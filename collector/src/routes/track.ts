import { Hono } from "hono";
import type { TrackRequest, TelemetryItem } from "../types";
import { pushToPrometheus } from "../services/prometheus";
import { pushToLoki } from "../services/loki";

const track = new Hono();

const ALLOWED_TYPES = new Set(["event", "metric", "error", "log"]);

function validateItem(item: unknown): item is TelemetryItem {
  if (!item || typeof item !== "object") return false;
  const obj = item as Record<string, unknown>;
  if (!ALLOWED_TYPES.has(obj.type as string)) return false;
  if (typeof obj.app_id !== "string" || !obj.app_id) return false;
  return true;
}

track.post("/", async (c) => {
  let body: TrackRequest;
  try {
    body = await c.req.json<TrackRequest>();
  } catch {
    return c.json({ success: false, message: "Invalid JSON" }, 400);
  }

  if (!body.batch || !Array.isArray(body.batch)) {
    return c.json(
      { success: false, message: "Missing 'batch' array" },
      400
    );
  }

  if (body.batch.length === 0) {
    return c.json({ success: true, data: { accepted: 0, rejected: 0 } });
  }

  if (body.batch.length > 500) {
    return c.json(
      { success: false, message: "Batch size exceeds limit (500)" },
      400
    );
  }

  const valid: TelemetryItem[] = [];
  let rejected = 0;

  for (const item of body.batch) {
    if (validateItem(item)) {
      valid.push(item);
    } else {
      rejected++;
    }
  }

  // 并行写入 Prometheus 和 Loki
  await Promise.all([pushToPrometheus(valid), pushToLoki(valid)]);

  return c.json({
    success: true,
    data: { accepted: valid.length, rejected },
  });
});

export default track;
