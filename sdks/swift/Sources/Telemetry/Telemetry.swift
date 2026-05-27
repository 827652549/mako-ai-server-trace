import Foundation

public struct TelemetryItem: Codable {
    public let type: String
    public let appId: String
    public var userId: String?
    public var sessionId: String?
    public var eventKey: String?
    public var eventParams: AnyCodable?
    public var metricName: String?
    public var metricValue: Double?
    public var metricUnit: String?
    public var errorType: String?
    public var errorMessage: String?
    public var errorStack: String?
    public var level: String?
    public var message: String?
    public var extra: AnyCodable?
    public var timestamp: Int64?

    enum CodingKeys: String, CodingKey {
        case type
        case appId = "app_id"
        case userId = "user_id"
        case sessionId = "session_id"
        case eventKey = "event_key"
        case eventParams = "event_params"
        case metricName = "metric_name"
        case metricValue = "metric_value"
        case metricUnit = "metric_unit"
        case errorType = "error_type"
        case errorMessage = "error_message"
        case errorStack = "error_stack"
        case level, message, extra, timestamp
    }
}

public struct TrackRequest: Codable {
    public let batch: [TelemetryItem]
}

public struct AnyCodable: Codable {
    public let value: Any

    public init(_ value: Any) {
        self.value = value
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array
        } else {
            value = NSNull()
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let int = value as? Int {
            try container.encode(int)
        } else if let double = value as? Double {
            try container.encode(double)
        } else if let string = value as? String {
            try container.encode(string)
        } else if let bool = value as? Bool {
            try container.encode(bool)
        } else if let dict = value as? [String: AnyCodable] {
            try container.encode(dict)
        } else if let array = value as? [AnyCodable] {
            try container.encode(array)
        }
    }
}

public struct TelemetryConfig {
    public let endpoint: String
    public let apiKey: String
    public let appId: String
    public var batchSize: Int
    public var flushInterval: TimeInterval
    public var maxRetries: Int

    public init(endpoint: String, apiKey: String, appId: String,
                batchSize: Int = 50, flushInterval: TimeInterval = 10,
                maxRetries: Int = 3) {
        self.endpoint = endpoint
        self.apiKey = apiKey
        self.appId = appId
        self.batchSize = batchSize
        self.flushInterval = flushInterval
        self.maxRetries = maxRetries
    }
}

public class Telemetry {
    private let config: TelemetryConfig
    private var queue: [TelemetryItem] = []
    private let lock = NSLock()
    private let session = URLSession.shared
    private var flushTimer: Timer?
    private let userId: String
    private var onBackgroundObserver: Any?
    private var willTerminateObserver: Any?

    public init(config: TelemetryConfig) {
        self.config = config
        self.userId = "u_\(Int.random(in: 10000000...99999999))"
        startFlushTimer()
        observeAppLifecycle()
    }

    deinit {
        flushTimer?.invalidate()
        if let obs = onBackgroundObserver {
            NotificationCenter.default.removeObserver(obs)
        }
        if let obs = willTerminateObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }

    public func track(_ eventKey: String, params: [String: Any]? = nil) {
        let item = TelemetryItem(
            type: "event",
            appId: config.appId,
            userId: userId,
            eventKey: eventKey,
            eventParams: params.map { AnyCodable($0) },
            timestamp: Int64(Date().timeIntervalSince1970 * 1000)
        )
        enqueue(item)
    }

    public func captureMetric(_ name: String, value: Double, unit: String) {
        let item = TelemetryItem(
            type: "metric",
            appId: config.appId,
            userId: userId,
            metricName: name,
            metricValue: value,
            metricUnit: unit,
            timestamp: Int64(Date().timeIntervalSince1970 * 1000)
        )
        enqueue(item)
    }

    public func captureError(_ errorType: String, message: String, stack: String = "") {
        let item = TelemetryItem(
            type: "error",
            appId: config.appId,
            userId: userId,
            errorType: errorType,
            errorMessage: message,
            errorStack: stack,
            timestamp: Int64(Date().timeIntervalSince1970 * 1000)
        )
        enqueue(item)
    }

    public func log(_ level: String, _ message: String, extra: [String: Any]? = nil) {
        let item = TelemetryItem(
            type: "log",
            appId: config.appId,
            userId: userId,
            level: level,
            message: message,
            extra: extra.map { AnyCodable($0) },
            timestamp: Int64(Date().timeIntervalSince1970 * 1000)
        )
        enqueue(item)
    }

    private func enqueue(_ item: TelemetryItem) {
        lock.lock()
        queue.append(item)
        let shouldFlush = queue.count >= config.batchSize
        lock.unlock()

        if shouldFlush {
            flush()
        }
    }

    public func flush() {
        lock.lock()
        guard !queue.isEmpty else {
            lock.unlock()
            return
        }
        let batch = queue
        queue = []
        lock.unlock()

        let request = TrackRequest(batch: batch)
        guard let body = try? JSONEncoder().encode(request) else { return }

        var urlRequest = URLRequest(url: URL(string: config.endpoint)!)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !config.apiKey.isEmpty {
            urlRequest.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
        }
        urlRequest.httpBody = body

        let task = session.dataTask(with: urlRequest) { [weak self] _, response, error in
            if let httpResponse = response as? HTTPURLResponse,
               httpResponse.statusCode >= 300 || error != nil {
                self?.lock.lock()
                self?.queue.insert(contentsOf: batch, at: 0)
                self?.lock.unlock()
            }
        }
        task.resume()
    }

    public func destroy() {
        flushTimer?.invalidate()
        flush()
    }

    private func startFlushTimer() {
        flushTimer = Timer.scheduledTimer(withTimeInterval: config.flushInterval, repeats: true) { [weak self] _ in
            self?.flush()
        }
    }

    private func observeAppLifecycle() {
        onBackgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.flush()
        }

        willTerminateObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.willTerminateNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.flush()
        }
    }
}

#if canImport(UIKit)
import UIKit
#endif
