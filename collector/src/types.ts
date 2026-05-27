export interface TelemetryEvent {
  type: "event";
  app_id: string;
  user_id?: string;
  session_id?: string;
  event_key: string;
  event_params?: Record<string, unknown>;
  page_url?: string;
  user_agent?: string;
  timestamp?: number;
}

export interface TelemetryMetric {
  type: "metric";
  app_id: string;
  user_id?: string;
  session_id?: string;
  metric_name: string;
  metric_value: number;
  metric_unit?: string;
  timestamp?: number;
}

export interface TelemetryError {
  type: "error";
  app_id: string;
  user_id?: string;
  session_id?: string;
  error_type: string;
  error_message: string;
  error_stack?: string;
  page_url?: string;
  timestamp?: number;
}

export interface TelemetryLog {
  type: "log";
  app_id: string;
  user_id?: string;
  session_id?: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  request_id?: string;
  extra?: Record<string, unknown>;
  timestamp?: number;
}

export type TelemetryItem =
  | TelemetryEvent
  | TelemetryMetric
  | TelemetryError
  | TelemetryLog;

export interface TrackRequest {
  batch: TelemetryItem[];
}
