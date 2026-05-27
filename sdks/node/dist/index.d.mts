import { Request, Response, NextFunction } from 'express';

interface TelemetryConfig {
    /** 应用标识 */
    appId: string;
    /** 上报地址 */
    endpoint: string;
    /** API Key */
    apiKey?: string;
    /** 批量上报条数阈值，默认 50 */
    batchSize?: number;
    /** 自动 flush 间隔(ms)，默认 10000 */
    flushInterval?: number;
    /** 调试模式 */
    debug?: boolean;
}

declare class Telemetry {
    private config;
    private queue;
    private flushTimer;
    private sending;
    constructor(config: TelemetryConfig);
    /** 上报事件 */
    track(eventKey: string, params?: Record<string, unknown>): void;
    /** 上报错误 */
    captureError(error: Error, extra?: Record<string, unknown>): void;
    /** 上报性能指标 */
    captureMetric(name: string, value: number, unit?: string): void;
    /** 上报日志 */
    log(level: "info" | "warn" | "error" | "debug", message: string, extra?: Record<string, unknown>): void;
    /** 立即 flush */
    flush(): Promise<void>;
    /** 销毁实例（进程退出前调用） */
    destroy(): Promise<void>;
    private push;
    private send;
}

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
declare function telemetryMiddleware(telemetry: Telemetry): (req: Request, res: Response, next: NextFunction) => void;

export { Telemetry, type TelemetryConfig, telemetryMiddleware };
