import type { Context, Next } from "hono";

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW) || 60_000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX) || 1000;

// 简单的内存滑动窗口限流
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export async function rateLimitMiddleware(c: Context, next: Next) {
  const key = c.req.header("Authorization") || c.req.header("X-Forwarded-For") || "anonymous";
  const now = Date.now();

  let entry = requestCounts.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    requestCounts.set(key, entry);
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    return c.json(
      { success: false, message: "Rate limit exceeded" },
      429
    );
  }

  c.header("X-RateLimit-Limit", String(MAX_REQUESTS));
  c.header("X-RateLimit-Remaining", String(MAX_REQUESTS - entry.count));

  await next();
}
