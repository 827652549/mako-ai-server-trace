import type { TelemetryConfig, TelemetryItem } from "./types";

export class Telemetry {
  private config: Required<TelemetryConfig>;
  private queue: TelemetryItem[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sending = false;

  constructor(config: TelemetryConfig) {
    this.config = {
      batchSize: 50,
      flushInterval: 10000,
      debug: false,
      apiKey: "",
      ...config,
    };
    this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
  }

  /** 上报事件 */
  track(eventKey: string, params?: Record<string, unknown>) {
    this.push({
      type: "event",
      app_id: this.config.appId,
      event_key: eventKey,
      event_params: params,
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
    });
  }

  /** 上报日志 */
  log(level: "info" | "warn" | "error" | "debug", message: string, extra?: Record<string, unknown>) {
    this.push({
      type: "log",
      app_id: this.config.appId,
      level,
      message,
      ...extra,
    });
  }

  /** 立即 flush */
  async flush() {
    if (this.queue.length === 0 || this.sending) return;
    const batch = this.queue.splice(0, this.config.batchSize);
    this.sending = true;
    try {
      await this.send(batch);
    } finally {
      this.sending = false;
    }
  }

  /** 销毁实例（进程退出前调用） */
  async destroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
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

    try {
      const res = await fetch(this.config.endpoint, {
        method: "POST",
        headers,
        body,
      });
      if (!res.ok) {
        console.error(`[telemetry] send failed: ${res.status}`);
        this.queue.unshift(...batch);
      }
    } catch (e) {
      console.error("[telemetry] send error:", e);
      this.queue.unshift(...batch);
    }
  }
}
