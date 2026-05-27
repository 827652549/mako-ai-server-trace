# mako-ai-server-trace

远程埋点上报服务。四端 SDK (Web/Node/Swift/Go) 统一 HTTP 上报，Prometheus 存指标，Loki 存日志，Grafana 可视化。

## 架构

```
SDK (Web/Node/Swift/Go)
  │  POST /api/track
  ▼
Collector (Hono.js, port 3002)
  ├── 指标 → Pushgateway → Prometheus
  └── 日志 → Loki
              ↓
         Grafana (port 3003)
```

## 目录结构

```
mako-ai-server-trace/
├── collector/               # 收集服务
│   └── src/
│       ├── index.ts         # Hono 入口，端口 3000
│       ├── types.ts         # 4 种数据类型定义
│       ├── routes/track.ts  # POST /api/track 接口
│       ├── services/
│       │   ├── prometheus.ts # 指标累积计数 → Pushgateway
│       │   └── loki.ts      # 日志 → Loki HTTP API
│       └── middleware/
│           ├── auth.ts      # Bearer Token 认证
│           └── rateLimit.ts # 滑动窗口限流 (默认 1000次/分钟)
├── sdks/
│   ├── web/                 # @makogroup/telemetry-web (浏览器 SDK)
│   ├── node/                # @makogroup/telemetry-node (Node.js SDK)
│   ├── go/                  # telemetry-go (Go SDK)
│   └── swift/               # Telemetry (Swift SDK)
└── infra/                   # Docker 基础设施
    ├── docker-compose.yml   # 全部服务编排
    ├── prometheus/          # Prometheus 配置 + 告警规则
    ├── loki/                # Loki 配置
    ├── grafana/             # Grafana 数据源 + 预置仪表盘
    └── alertmanager/        # 告警通知配置
```

## 快速启动

```bash
cd infra
docker compose up -d
```

服务地址：
- Collector: `http://localhost:3002`
- Grafana: `http://localhost:3003` (admin / admin123)
- Prometheus: `http://localhost:9094`
- Alertmanager: `http://localhost:9093`

## API 接口

### POST /api/track

批量上报埋点数据。

**请求头：**
```
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

**请求体：**
```json
{
  "batch": [
    {
      "type": "event",
      "app_id": "my-app",
      "user_id": "u_123",
      "session_id": "s_456",
      "event_key": "button_click",
      "event_params": { "button_id": "submit" },
      "timestamp": 1716889362000
    }
  ]
}
```

**type 字段可选值：`event` | `metric` | `error` | `log`**

**event 格式：**
```json
{
  "type": "event",
  "app_id": "必填",
  "event_key": "必填",
  "user_id": "可选",
  "session_id": "可选",
  "event_params": "可选, object",
  "page_url": "可选",
  "timestamp": "可选, 毫秒时间戳, 默认当前时间"
}
```

**metric 格式：**
```json
{
  "type": "metric",
  "app_id": "必填",
  "metric_name": "必填",
  "metric_value": "必填, number",
  "metric_unit": "可选, 如 ms/MB/%",
  "timestamp": "可选"
}
```

**error 格式：**
```json
{
  "type": "error",
  "app_id": "必填",
  "error_type": "必填, 如 crash/timeout/network_error",
  "error_message": "必填",
  "error_stack": "可选",
  "page_url": "可选",
  "timestamp": "可选"
}
```

**log 格式：**
```json
{
  "type": "log",
  "app_id": "必填",
  "level": "必填, info|warn|error|debug",
  "message": "必填",
  "request_id": "可选",
  "extra": "可选, object",
  "timestamp": "可选"
}
```

**响应：**
```json
{ "success": true, "data": { "accepted": 3, "rejected": 0 } }
```

**限制：**
- 单次 batch 最多 500 条
- 限流 1000 次/分钟 (按 API Key)
- 无 API Key 配置时跳过认证 (开发环境)

### GET /health

健康检查。返回 `{ "status": "ok" }`

## Web SDK 接入

```bash
npm install @makogroup/telemetry-web
```

```ts
import { createTelemetry } from '@makogroup/telemetry-web';

const telemetry = createTelemetry({
  appId: 'my-web-app',
  endpoint: 'https://trace.yourdomain.com/api/track',
  apiKey: 'your-api-key',
  // 以下为可选配置
  batchSize: 10,           // 批量上报条数，默认 10
  flushInterval: 5000,     // 自动 flush 间隔(ms)，默认 5s
  autoPageView: true,      // 自动采集页面访问，默认 true
  autoPerformance: true,   // 自动采集 Web Vitals，默认 true
  autoError: true,         // 自动采集 JS 错误，默认 true
  autoClick: false,        // 自动采集点击事件，默认 false
  debug: false,            // 调试模式，console.log 上报数据
});

// 手动上报事件
telemetry.track('button_click', { button_id: 'submit' });

// 手动上报错误
try { ... } catch (e) { telemetry.captureError(e); }

// 手动上报指标
telemetry.captureMetric('custom_metric', 123, 'ms');
```

**自动采集内容：**
- `page_view` — 页面访问 (含 SPA 路由变化)
- `FCP` / `LCP` / `CLS` / `TTFB` / `DCL` / `load` — Web Vitals 性能指标
- JS 错误 + unhandledrejection
- `click` — 点击事件 (需开启 autoClick)

## Node SDK 接入

```bash
npm install @makogroup/telemetry-node
```

```ts
import { Telemetry, telemetryMiddleware } from '@makogroup/telemetry-node';

const telemetry = new Telemetry({
  appId: 'my-server',
  endpoint: 'https://trace.yourdomain.com/api/track',
  apiKey: 'your-api-key',
  batchSize: 50,           // 默认 50
  flushInterval: 10000,    // 默认 10s
  debug: false,
});

// Express 中间件 — 自动采集每个请求的耗时和错误
app.use(telemetryMiddleware(telemetry));

// 手动上报
telemetry.track('db_query', { table: 'users', duration: 45 });
telemetry.captureMetric('queue_size', 100, 'items');
telemetry.captureError(new Error('something failed'));
telemetry.log('info', 'server started', { port: 3000 });

// 进程退出前确保数据发送
process.on('SIGTERM', () => telemetry.destroy());
```

## Go SDK 接入

```bash
go get github.com/makogroup/telemetry-go
```

```go
package main

import (
    "time"
    telemetry "github.com/makogroup/telemetry-go"
)

func main() {
    t := telemetry.New(telemetry.Config{
        Endpoint:      "http://8.153.87.187:3002/api/track",
        APIKey:        "your-api-key",
        AppID:         "my-go-service",
        BatchSize:     50,
        FlushInterval: 10 * time.Second,
    })

    // 手动上报
    t.Track("db_query", map[string]interface{}{"table": "users", "duration": 45})
    t.CaptureMetric("queue_size", 100, "items")
    t.CaptureError("timeout", "request timed out", "goroutine stack...")
    t.Log("info", "server started", map[string]interface{}{"port": 3000})

    // 进程退出前确保数据发送
    defer t.Destroy()

    // ... 业务逻辑
}
```

## Swift SDK 接入

```swift
// Swift Package Manager
 dependencies: [
    .package(url: "https://github.com/makogroup/telemetry-swift", from: "1.0.0")
]
```

```swift
import Telemetry

let telemetry = Telemetry(config: TelemetryConfig(
    endpoint: "http://8.153.87.187:3002/api/track",
    apiKey: "your-api-key",
    appId: "my-swift-app"
))

// 手动上报
telemetry.track("button_click", params: ["button_id": "submit"])
telemetry.captureMetric("api_latency", value: 230, unit: "ms")
telemetry.captureError("crash", message: "Unexpectedly found nil", stack: "...")
telemetry.log("info", "view appeared")

// App 进入后台时自动 flush
// 进程退出前手动 flush
telemetry.destroy()
```

## 查询场景

### 1. 查询某服务的日 UV (Loki)

在 Grafana Explore 中选择 Loki 数据源：

```logql
count(count_over_time({app_id="node-a", type="event"} | json | user_id != "" [24h] by user_id))
```

### 2. 查询错误分布 (Prometheus)

```promql
sum by (app_id, error_type) (increase(trace_errors_total[24h]))
```

### 3. 服务健康检查告警 (Prometheus + Alertmanager)

已内置 3 条告警规则 (`infra/prometheus/rules/alerts.yml`)：
- `ServiceDown` — 服务健康检查失败 1 分钟
- `HighErrorRate` — 错误率超过 10/s 持续 2 分钟
- `TrafficDrop` — 上报量接近 0 持续 5 分钟

告警通知配置在 `infra/alertmanager/alertmanager.yml`，支持 Webhook / 邮件。

### 4. 查询某次请求详情 (Loki)

```logql
{app_id="web-service"} | json | request_id = "req_abc123"
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `API_KEY` | 空 (跳过认证) | Collector 认证密钥 |
| `PORT` | 3000 | Collector 端口 |
| `GRAFANA_PASSWORD` | admin123 | Grafana 管理员密码 |
| `PUSHGATEWAY_URL` | http://pushgateway:9091 | Pushgateway 地址 |
| `LOKI_URL` | http://loki:3100 | Loki 地址 |
| `RATE_LIMIT_WINDOW` | 60000 | 限流窗口(ms) |
| `RATE_LIMIT_MAX` | 1000 | 限流窗口内最大请求数 |

## 端口映射

| 服务 | 宿主机端口 | 容器端口 |
|------|-----------|---------|
| Collector | 3002 | 3000 |
| Prometheus | 9094 | 9090 |
| Pushgateway | 9091 | 9091 |
| Loki | 3100 | 3100 |
| Grafana | 3003 | 3000 |
| Alertmanager | 9093 | 9093 |

## 线上环境

| 服务 | 地址 |
|------|------|
| Collector | http://8.153.87.187:3002 |
| Grafana | http://8.153.87.187:3003 |
| Prometheus | http://8.153.87.187:9094 |
| Pushgateway | http://8.153.87.187:9091 |
| Loki | http://8.153.87.187:3100 |
| Alertmanager | http://8.153.87.187:9093 |

**Grafana 登录：** admin / f18157649cff70af

**API Key：** `8a316c28fbc9d76d7c5e04e84eed1f28`

## 部署到远程服务器

```bash
# 1. 上传项目
rsync -avz --exclude node_modules --exclude dist --exclude .DS_Store \
  -e "ssh -o StrictHostKeyChecking=no" \
  /Users/mako/WebstormProjects/mako-ai-server-trace/ \
  root@8.153.87.187:/opt/mako-ai-server-trace/

# 2. SSH 登录并启动
ssh root@8.153.87.187
cd /opt/mako-ai-server-trace/infra
docker compose up -d --build

# 3. 验证
curl http://8.153.87.187:3002/health
```
