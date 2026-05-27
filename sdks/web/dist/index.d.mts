interface TelemetryConfig {
    /** 应用标识 */
    appId: string;
    /** 上报地址，如 https://trace.yourdomain.com/api/track */
    endpoint: string;
    /** API Key */
    apiKey?: string;
    /** 批量上报条数阈值，默认 10 */
    batchSize?: number;
    /** 自动 flush 间隔(ms)，默认 5000 */
    flushInterval?: number;
    /** 是否自动采集页面访问，默认 true */
    autoPageView?: boolean;
    /** 是否自动采集性能指标(Web Vitals)，默认 true */
    autoPerformance?: boolean;
    /** 是否自动采集 JS 错误，默认 true */
    autoError?: boolean;
    /** 是否自动采集页面点击，默认 false */
    autoClick?: boolean;
    /** 调试模式，开启后会 console.log 上报数据 */
    debug?: boolean;
}

declare class TelemetryCore {
    private config;
    private queue;
    private flushTimer;
    private sessionId;
    constructor(config: TelemetryConfig);
    /** 手动上报事件 */
    track(eventKey: string, params?: Record<string, unknown>): void;
    /** 上报错误 */
    captureError(error: Error, extra?: Record<string, unknown>): void;
    /** 上报性能指标 */
    captureMetric(name: string, value: number, unit?: string): void;
    /** 立即 flush */
    flush(): Promise<void>;
    /** 销毁实例 */
    destroy(): void;
    private push;
    private send;
    private isPageUnloading;
    private setupAutoFlush;
    private setupPageUnload;
    private getUserId;
    private genId;
}

/**
 * 创建 Telemetry 实例并启动自动采集
 *
 * @example
 * ```ts
 * import { createTelemetry } from '@makogroup/telemetry-web';
 *
 * const telemetry = createTelemetry({
 *   appId: 'my-app',
 *   endpoint: 'https://trace.yourdomain.com/api/track',
 *   apiKey: 'your-api-key',
 * });
 *
 * // 手动上报
 * telemetry.track('button_click', { button_id: 'submit' });
 * ```
 */
declare function createTelemetry(config: TelemetryConfig): TelemetryCore;

export { type TelemetryConfig, TelemetryCore, createTelemetry };
