export interface TelemetryConfig {
  /** 应用标识 */
  appId: string;
  /** 上报地址，如 https://trace.yourdomain.com/api/track */
  endpoint: string;
  /** API Key */
  apiKey?: string;
  /** 批量上报条数阈值，默认 10 */
  batchSize?: number;
  /** 自动 flush 间隔(ms)，默认 5000 */
  flushInterval?: number;
  /** 是否自动采集页面访问，默认 true */
  autoPageView?: boolean;
  /** 是否自动采集性能指标(Web Vitals)，默认 true */
  autoPerformance?: boolean;
  /** 是否自动采集 JS 错误，默认 true */
  autoError?: boolean;
  /** 是否自动采集页面点击，默认 false */
  autoClick?: boolean;
  /** 调试模式，开启后会 console.log 上报数据 */
  debug?: boolean;
}

export interface TelemetryItem {
  type: "event" | "metric" | "error" | "log";
  app_id: string;
  user_id?: string;
  session_id?: string;
  timestamp?: number;
  [key: string]: unknown;
}
