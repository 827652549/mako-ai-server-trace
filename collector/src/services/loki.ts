import type { TelemetryItem } from "../types";

const LOKI_URL = process.env.LOKI_URL || "http://loki:3100";

/**
 * 将埋点数据推送到 Loki
 *
 * 每条数据作为一个日志行推送，labels 按 app_id + type 分组
 * 这样在 Grafana 中可以按 app_id 过滤，按 type 区分事件/错误/日志
 */
export async function pushToLoki(items: TelemetryItem[]): Promise<void> {
  if (items.length === 0) return;

  // 按 app_id + type 分组
  const streams = new Map<
    string,
    { labels: Record<string, string>; values: [string, string][] }
  >();

  for (const item of items) {
    const ts = item.timestamp
      ? String(item.timestamp * 1_000_000) // Loki 需要纳秒
      : String(Date.now() * 1_000_000);

    const labels: Record<string, string> = {
      app_id: item.app_id,
      type: item.type,
    };

    if ("user_id" in item && item.user_id) {
      labels.user_id = item.user_id;
    }
    if ("level" in item && item.level) {
      labels.level = item.level;
    }

    const streamKey = JSON.stringify(labels);
    if (!streams.has(streamKey)) {
      streams.set(streamKey, { labels, values: [] });
    }

    // 日志行内容：完整的 JSON，方便 Loki | json 解析
    const line = JSON.stringify(item);
    streams.get(streamKey)!.values.push([ts, line]);
  }

  const payload = {
    streams: Array.from(streams.values()).map(({ labels, values }) => ({
      stream: labels,
      values,
    })),
  };

  try {
    const res = await fetch(`${LOKI_URL}/loki/api/v1/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(
        `[loki] push failed: ${res.status} ${await res.text()}`
      );
    }
  } catch (err) {
    console.error("[loki] push error:", err);
  }
}
