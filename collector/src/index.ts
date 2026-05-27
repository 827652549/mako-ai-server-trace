import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import track from "./routes/track";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/rateLimit";

const app = new Hono();

// 全局中间件
app.use("*", cors());
app.use("*", logger());

// 健康检查
app.get("/health", (c) => c.json({ status: "ok" }));

// 上报接口（带认证和限流）
app.use("/api/track", authMiddleware);
app.use("/api/track", rateLimitMiddleware);
app.route("/api/track", track);

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Collector running on http://localhost:${info.port}`);
});
