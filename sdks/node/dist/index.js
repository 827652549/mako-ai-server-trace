"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Telemetry: () => Telemetry,
  telemetryMiddleware: () => telemetryMiddleware
});
module.exports = __toCommonJS(index_exports);

// src/core.ts
var Telemetry = class {
  config;
  queue = [];
  flushTimer = null;
  sending = false;
  constructor(config) {
    this.config = {
      batchSize: 50,
      flushInterval: 1e4,
      debug: false,
      apiKey: "",
      ...config
    };
    this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
  }
  /** 上报事件 */
  track(eventKey, params) {
    this.push({
      type: "event",
      app_id: this.config.appId,
      event_key: eventKey,
      event_params: params
    });
  }
  /** 上报错误 */
  captureError(error, extra) {
    this.push({
      type: "error",
      app_id: this.config.appId,
      error_type: error.name || "Error",
      error_message: error.message,
      error_stack: error.stack,
      ...extra
    });
  }
  /** 上报性能指标 */
  captureMetric(name, value, unit) {
    this.push({
      type: "metric",
      app_id: this.config.appId,
      metric_name: name,
      metric_value: value,
      metric_unit: unit
    });
  }
  /** 上报日志 */
  log(level, message, extra) {
    this.push({
      type: "log",
      app_id: this.config.appId,
      level,
      message,
      ...extra
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
  push(item) {
    item.timestamp = Date.now();
    this.queue.push(item);
    if (this.config.debug) {
      console.log("[telemetry]", item.type, item);
    }
    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    }
  }
  async send(batch) {
    const body = JSON.stringify({ batch });
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    try {
      const res = await fetch(this.config.endpoint, {
        method: "POST",
        headers,
        body
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
};

// src/middleware.ts
function telemetryMiddleware(telemetry) {
  return (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      telemetry.captureMetric("http_request_duration", duration, "ms");
      if (res.statusCode >= 400) {
        telemetry.log(
          res.statusCode >= 500 ? "error" : "warn",
          `${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
          {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration,
            request_id: req.headers["x-request-id"]
          }
        );
      }
    });
    next();
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Telemetry,
  telemetryMiddleware
});
