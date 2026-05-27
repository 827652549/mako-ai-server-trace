import type { TelemetryItem } from "../types";

const PUSHGATEWAY_URL =
  process.env.PUSHGATEWAY_URL || "http://pushgateway:9091";

// 内存累积计数器（Pushgateway 每次推送会覆盖，所以需要累积后再推）
const eventCounters = new Map<string, number>();
const errorCounters = new Map<string, number>();
const metricLatest = new Map<string, number>();

export async function pushToPrometheus(items: TelemetryItem[]): Promise<void> {
  // 累积计数
  for (const item of items) {
    if (item.type === "event") {
      const key = `${item.app_id}|${item.event_key}`;
      eventCounters.set(key, (eventCounters.get(key) || 0) + 1);
    } else if (item.type === "error") {
      const key = `${item.app_id}|${item.error_type}`;
      errorCounters.set(key, (errorCounters.get(key) || 0) + 1);
    } else if (item.type === "metric") {
      const key = `${item.app_id}|${item.metric_name}|${item.metric_unit || ""}`;
      metricLatest.set(key, item.metric_value);
    }
  }

  const lines: string[] = [];

  // 事件计数
  lines.push("# HELP trace_events_total Total number of trace events");
  lines.push("# TYPE trace_events_total counter");
  for (const [key, count] of eventCounters) {
    const [app_id, event_key] = key.split("|");
    lines.push(
      `trace_events_total{app_id="${app_id}",event_key="${event_key}"} ${count}`
    );
  }

  // 错误计数
  lines.push("# HELP trace_errors_total Total number of trace errors");
  lines.push("# TYPE trace_errors_total counter");
  for (const [key, count] of errorCounters) {
    const [app_id, error_type] = key.split("|");
    lines.push(
      `trace_errors_total{app_id="${app_id}",error_type="${error_type}"} ${count}`
    );
  }

  // 性能指标
  lines.push("# HELP trace_metrics_value Latest telemetry metric values");
  lines.push("# TYPE trace_metrics_value gauge");
  for (const [key, value] of metricLatest) {
    const [app_id, metric_name, unit] = key.split("|");
    lines.push(
      `trace_metrics_value{app_id="${app_id}",metric_name="${metric_name}",unit="${unit}"} ${value}`
    );
  }

  const body = lines.join("\n") + "\n";

  try {
    const res = await fetch(
      `${PUSHGATEWAY_URL}/metrics/job/trace_collector`,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body,
      }
    );
    if (!res.ok) {
      console.error(
        `[prometheus] push failed: ${res.status} ${await res.text()}`
      );
    }
  } catch (err) {
    console.error("[prometheus] push error:", err);
  }
}
