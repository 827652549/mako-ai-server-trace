import type { Telemetry } from "./core";
import type { Request, Response, NextFunction } from "express";

/**
 * Express 中间件：自动采集每个请求的耗时和状态码
 *
 * @example
 * ```ts
 * import { Telemetry, telemetryMiddleware } from '@makogroup/telemetry-node';
 *
 * const telemetry = new Telemetry({ appId: 'my-server', endpoint: '...' });
 * app.use(telemetryMiddleware(telemetry));
 * ```
 */
export function telemetryMiddleware(telemetry: Telemetry) {
  return (req: Request, res: Response, next: NextFunction) => {
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
            request_id: req.headers["x-request-id"] as string,
          }
        );
      }
    });

    next();
  };
}
