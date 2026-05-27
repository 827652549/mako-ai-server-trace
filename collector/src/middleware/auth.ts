import type { Context, Next } from "hono";

const API_KEY = process.env.API_KEY || "";

export async function authMiddleware(c: Context, next: Next) {
  // 未配置 API Key 时跳过校验（开发环境）
  if (!API_KEY) {
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  await next();
}
