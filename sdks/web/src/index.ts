import { TelemetryCore } from "./core";
import { setupAutoCollectors } from "./auto";
import type { TelemetryConfig } from "./types";

export type { TelemetryConfig } from "./types";

/**
 * 创建 Telemetry 实例并启动自动采集
 *
 * @example
 * ```ts
 * import { createTelemetry } from '@makogroup/telemetry-web';
 *
 * const telemetry = createTelemetry({
 *   appId: 'my-app',
 *   endpoint: 'https://trace.yourdomain.com/api/track',
 *   apiKey: 'your-api-key',
 * });
 *
 * // 手动上报
 * telemetry.track('button_click', { button_id: 'submit' });
 * ```
 */
export function createTelemetry(config: TelemetryConfig): TelemetryCore {
  const telemetry = new TelemetryCore(config);
  setupAutoCollectors(telemetry, config);
  return telemetry;
}

export { TelemetryCore } from "./core";
