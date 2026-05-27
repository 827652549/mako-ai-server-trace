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
  TelemetryCore: () => TelemetryCore,
  createTelemetry: () => createTelemetry
});
module.exports = __toCommonJS(index_exports);

// src/core.ts
var TelemetryCore = class {
  constructor(config) {
    this.queue = [];
    this.flushTimer = null;
    this.isPageUnloading = false;
    this.config = {
      batchSize: 10,
      flushInterval: 5e3,
      autoPageView: true,
      autoPerformance: true,
      autoError: true,
      autoClick: false,
      debug: false,
      apiKey: "",
      ...config
    };
    this.sessionId = this.genId();
    this.setupAutoFlush();
    this.setupPageUnload();
  }
  /** 手动上报事件 */
  track(eventKey, params) {
    this.push({
      type: "event",
      app_id: this.config.appId,
      event_key: eventKey,
      event_params: params,
      user_id: this.getUserId(),
      session_id: this.sessionId
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
      user_id: this.getUserId(),
      session_id: this.sessionId,
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
      metric_unit: unit,
      user_id: this.getUserId(),
      session_id: this.sessionId
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
    if (this.isPageUnloading && navigator.sendBeacon) {
      navigator.sendBeacon(this.config.endpoint, body);
    } else {
      try {
        await fetch(this.config.endpoint, {
          method: "POST",
          headers,
          body,
          keepalive: true
        });
      } catch (e) {
        this.queue.unshift(...batch);
        if (this.config.debug) console.warn("[telemetry] send failed", e);
      }
    }
  }
  setupAutoFlush() {
    this.flushTimer = setInterval(() => this.flush(), this.config.flushInterval);
  }
  setupPageUnload() {
    const handler = () => {
      this.isPageUnloading = true;
      this.flush();
    };
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") handler();
    });
    window.addEventListener("pagehide", handler);
  }
  getUserId() {
    const key = "_telemetry_uid";
    let uid = localStorage.getItem(key);
    if (!uid) {
      uid = this.genId();
      localStorage.setItem(key, uid);
    }
    return uid;
  }
  genId() {
    return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  }
};

// src/auto.ts
function setupAutoPageView(telemetry) {
  const report = () => {
    telemetry.track("page_view", {
      url: location.href,
      path: location.pathname,
      referrer: document.referrer
    });
  };
  report();
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function(...args) {
    origPush.apply(this, args);
    report();
  };
  history.replaceState = function(...args) {
    origReplace.apply(this, args);
    report();
  };
  window.addEventListener("popstate", report);
}
function setupAutoError(telemetry) {
  window.addEventListener("error", (e) => {
    telemetry.captureError(e.error || new Error(e.message), {
      source: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      page_url: location.href
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
    telemetry.captureError(err, {
      type: "unhandledrejection",
      page_url: location.href
    });
  });
}
function setupAutoPerformance(telemetry) {
  const fcpObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === "first-contentful-paint") {
        telemetry.captureMetric("FCP", entry.startTime, "ms");
        fcpObserver.disconnect();
      }
    }
  });
  try {
    fcpObserver.observe({ type: "paint", buffered: true });
  } catch (e) {
  }
  const lcpObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    telemetry.captureMetric("LCP", last.startTime, "ms");
  });
  try {
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
  } catch (e) {
  }
  let cls = 0;
  const clsObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) {
        cls += entry.value;
      }
    }
  });
  try {
    clsObserver.observe({ type: "layout-shift", buffered: true });
  } catch (e) {
  }
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      telemetry.captureMetric("CLS", cls);
    }
  });
  window.addEventListener("load", () => {
    setTimeout(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav) {
        telemetry.captureMetric("TTFB", nav.responseStart - nav.requestStart, "ms");
        telemetry.captureMetric("DCL", nav.domContentLoadedEventEnd - nav.startTime, "ms");
        telemetry.captureMetric("load", nav.loadEventEnd - nav.startTime, "ms");
      }
    }, 0);
  });
}
function setupAutoClick(telemetry) {
  document.addEventListener("click", (e) => {
    var _a;
    const target = e.target;
    const tag = target.tagName.toLowerCase();
    if (["a", "button", "input"].includes(tag) || target.hasAttribute("data-track")) {
      telemetry.track("click", {
        tag,
        text: (_a = target.textContent) == null ? void 0 : _a.slice(0, 50),
        id: target.id || void 0,
        class: target.className || void 0,
        href: target.href || void 0,
        page_url: location.href
      });
    }
  }, true);
}
function setupAutoCollectors(telemetry, config) {
  if (config.autoPageView !== false) setupAutoPageView(telemetry);
  if (config.autoError !== false) setupAutoError(telemetry);
  if (config.autoPerformance !== false) setupAutoPerformance(telemetry);
  if (config.autoClick) setupAutoClick(telemetry);
}

// src/index.ts
function createTelemetry(config) {
  const telemetry = new TelemetryCore(config);
  setupAutoCollectors(telemetry, config);
  return telemetry;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TelemetryCore,
  createTelemetry
});
