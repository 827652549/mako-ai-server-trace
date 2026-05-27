export interface TelemetryConfig {
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

export interface TelemetryItem {
  type: "event" | "metric" | "error" | "log";
  app_id: string;
  timestamp?: number;
  [key: string]: unknown;
}
