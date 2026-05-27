import type { TelemetryConfig, TelemetryItem } from "./types";

export class TelemetryCore {
  private config: Required<TelemetryConfig>;
  private queue: TelemetryItem[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;

  constructor(config: TelemetryConfig) {
    this.config = {
      batchSize: 10,
      flushInterval: 5000,
      autoPageView: true,
      autoPerformance: true,
      autoError: true,
      autoClick: false,
      debug: false,
      apiKey: "",
      ...config,
    };
    this.sessionId = this.genId();

    this.setupAutoFlush();
    this.setupPageUnload();
  }

  /** 手动上报事件 */
  track(eventKey: string, params?: Record<string, unknown>) {
    this.push({
      type: "event",
      app_id: this.config.appId,
      event_key: eventKey,
      event_params: params,
      user_id: this.getUserId(),
      session_id: this.sessionId,
    });
  }

  /** 上报错误 */
  captureError(error: Error, extra?: Record<string, unknown>) {
    this.push({
      type: "error",
      app_id: this.config.appId,
      error_type: error.name || "Error",
      error_message: error.message,
      error_stack: error.stack,
      user_id: this.getUserId(),
      session_id: this.sessionId,
      ...extra,
    });
  }

  /** 上报性能指标 */
  captureMetric(name: string, value: number, unit?: string) {
    this.push({
      type: "metric",
      app_id: this.config.appId,
      metric_name: name,
      metric_value: value,
      metric_unit: unit,
      user_id: this.getUserId(),
      session_id: this.sessionId,
    });
  }

  /** 立即 flush */
  async flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    await this.send(batch);
  }

  /** 销毁实例 */
  destroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flush();
  }

  // --- 内部方法 ---

  private push(item: TelemetryItem) {
    item.timestamp = Date.now();
    this.queue.push(item);
    if (this.config.debug) {
      console.log("[telemetry]", item.type, item);
    }
    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    }
  }

  private async send(batch: TelemetryItem[]) {
    const body = JSON.stringify({ batch });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    // 优先用 sendBeacon（页面关闭时不丢数据），否则用 fetch
    if (this.isPageUnloading && navigator.sendBeacon) {
      navigator.sendBeacon(this.config.endpoint, body);
    } else {
      try {
        await fetch(this.config.endpoint, {
          method: "POST",
          headers,
          body,
          keepalive: true,
        });
      } catch (e) {
        // 发送失败，放回队列
        this.queue.unshift(...batch);
        if (this.config.debug) console.warn("[telemetry] send failed", e);
      }
    }
  }

  private isPageUnloading = false;

  private setupAutoFlush() {
    this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
  }

  private setupPageUnload() {
    const handler = () => {
      this.isPageUnloading = true;
      this.flush();
    };
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") handler();
    });
    window.addEventListener("pagehide", handler);
  }

  private getUserId(): string {
    const key = "_telemetry_uid";
    let uid = localStorage.getItem(key);
    if (!uid) {
      uid = this.genId();
      localStorage.setItem(key, uid);
    }
    return uid;
  }

  private genId(): string {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }
}
