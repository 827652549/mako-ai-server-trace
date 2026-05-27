import type { TelemetryCore } from "./core";
import type { TelemetryConfig } from "./types";

/** 自动采集页面访问 */
export function setupAutoPageView(telemetry: TelemetryCore) {
  const report = () => {
    telemetry.track("page_view", {
      url: location.href,
      path: location.pathname,
      referrer: document.referrer,
    });
  };
  // 首次进入
  report();
  // SPA 路由变化监听（pushState/replaceState/popstate）
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    origPush.apply(this, args);
    report();
  };
  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    report();
  };
  window.addEventListener("popstate", report);
}

/** 自动采集 JS 错误 */
export function setupAutoError(telemetry: TelemetryCore) {
  window.addEventListener("error", (e) => {
    telemetry.captureError(e.error || new Error(e.message), {
      source: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      page_url: location.href,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
    telemetry.captureError(err, {
      type: "unhandledrejection",
      page_url: location.href,
    });
  });
}

/** 自动采集 Web Vitals 性能指标 */
export function setupAutoPerformance(telemetry: TelemetryCore) {
  // FCP (First Contentful Paint)
  const fcpObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === "first-contentful-paint") {
        telemetry.captureMetric("FCP", entry.startTime, "ms");
        fcpObserver.disconnect();
      }
    }
  });
  try { fcpObserver.observe({ type: "paint", buffered: true }); } catch {}

  // LCP (Largest Contentful Paint)
  const lcpObserver = new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const last = entries[entries.length - 1];
    telemetry.captureMetric("LCP", last.startTime, "ms");
  });
  try { lcpObserver.observe({ type: "largest-contentful-paint", buffered: true }); } catch {}

  // CLS (Cumulative Layout Shift)
  let cls = 0;
  const clsObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!(entry as any).hadRecentInput) {
        cls += (entry as any).value;
      }
    }
  });
  try { clsObserver.observe({ type: "layout-shift", buffered: true }); } catch {}

  // 页面卸载时上报 CLS
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      telemetry.captureMetric("CLS", cls);
    }
  });

  // 页面加载完成时上报 navigation timing
  window.addEventListener("load", () => {
    setTimeout(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      if (nav) {
        telemetry.captureMetric("TTFB", nav.responseStart - nav.requestStart, "ms");
        telemetry.captureMetric("DCL", nav.domContentLoadedEventEnd - nav.startTime, "ms");
        telemetry.captureMetric("load", nav.loadEventEnd - nav.startTime, "ms");
      }
    }, 0);
  });
}

/** 自动采集点击事件 */
export function setupAutoClick(telemetry: TelemetryCore) {
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    // 只采集有意义的点击
    if (["a", "button", "input"].includes(tag) || target.hasAttribute("data-track")) {
      telemetry.track("click", {
        tag,
        text: target.textContent?.slice(0, 50),
        id: target.id || undefined,
        class: target.className || undefined,
        href: (target as HTMLAnchorElement).href || undefined,
        page_url: location.href,
      });
    }
  }, true);
}

/** 启动所有自动采集 */
export function setupAutoCollectors(telemetry: TelemetryCore, config: TelemetryConfig) {
  if (config.autoPageView !== false) setupAutoPageView(telemetry);
  if (config.autoError !== false) setupAutoError(telemetry);
  if (config.autoPerformance !== false) setupAutoPerformance(telemetry);
  if (config.autoClick) setupAutoClick(telemetry);
}
