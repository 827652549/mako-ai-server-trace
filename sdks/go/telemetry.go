package telemetry

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type TelemetryItem struct {
	Type        string      `json:"type"`
	AppID       string      `json:"app_id"`
	UserID      string      `json:"user_id,omitempty"`
	SessionID   string      `json:"session_id,omitempty"`
	EventKey    string      `json:"event_key,omitempty"`
	EventParams interface{} `json:"event_params,omitempty"`
	MetricName  string      `json:"metric_name,omitempty"`
	MetricValue float64     `json:"metric_value,omitempty"`
	MetricUnit  string      `json:"metric_unit,omitempty"`
	ErrorType   string      `json:"error_type,omitempty"`
	ErrorMsg    string      `json:"error_message,omitempty"`
	ErrorStack  string      `json:"error_stack,omitempty"`
	Level       string      `json:"level,omitempty"`
	Message     string      `json:"message,omitempty"`
	Extra       interface{} `json:"extra,omitempty"`
	Timestamp   int64       `json:"timestamp,omitempty"`
}

type TrackRequest struct {
	Batch []TelemetryItem `json:"batch"`
}

type Config struct {
	Endpoint     string
	APIKey       string
	AppID        string
	BatchSize    int
	FlushInterval time.Duration
	MaxRetries   int
}

type Telemetry struct {
	config  Config
	queue   []TelemetryItem
	mu      sync.Mutex
	client  *http.Client
	stopCh  chan struct{}
	userID  string
}

func New(config Config) *Telemetry {
	if config.BatchSize <= 0 {
		config.BatchSize = 50
	}
	if config.FlushInterval <= 0 {
		config.FlushInterval = 10 * time.Second
	}
	if config.MaxRetries <= 0 {
		config.MaxRetries = 3
	}

	t := &Telemetry{
		config: config,
		queue:  make([]TelemetryItem, 0, config.BatchSize),
		client: &http.Client{Timeout: 10 * time.Second},
		stopCh: make(chan struct{}),
		userID: generateUserID(),
	}

	go t.flushLoop()
	return t
}

func (t *Telemetry) Track(eventKey string, params interface{}) {
	item := TelemetryItem{
		Type:        "event",
		AppID:       t.config.AppID,
		UserID:      t.userID,
		EventKey:    eventKey,
		EventParams: params,
		Timestamp:   time.Now().UnixMilli(),
	}
	t.enqueue(item)
}

func (t *Telemetry) CaptureMetric(name string, value float64, unit string) {
	item := TelemetryItem{
		Type:        "metric",
		AppID:       t.config.AppID,
		UserID:      t.userID,
		MetricName:  name,
		MetricValue: value,
		MetricUnit:  unit,
		Timestamp:   time.Now().UnixMilli(),
	}
	t.enqueue(item)
}

func (t *Telemetry) CaptureError(errType string, message string, stack string) {
	item := TelemetryItem{
		Type:       "error",
		AppID:      t.config.AppID,
		UserID:     t.userID,
		ErrorType:  errType,
		ErrorMsg:   message,
		ErrorStack: stack,
		Timestamp:  time.Now().UnixMilli(),
	}
	t.enqueue(item)
}

func (t *Telemetry) Log(level string, message string, extra interface{}) {
	item := TelemetryItem{
		Type:      "log",
		AppID:     t.config.AppID,
		UserID:    t.userID,
		Level:     level,
		Message:   message,
		Extra:     extra,
		Timestamp: time.Now().UnixMilli(),
	}
	t.enqueue(item)
}

func (t *Telemetry) enqueue(item TelemetryItem) {
	t.mu.Lock()
	t.queue = append(t.queue, item)
	shouldFlush := len(t.queue) >= t.config.BatchSize
	t.mu.Unlock()

	if shouldFlush {
		t.Flush()
	}
}

func (t *Telemetry) Flush() {
	t.mu.Lock()
	if len(t.queue) == 0 {
		t.mu.Unlock()
		return
	}
	batch := t.queue
	t.queue = make([]TelemetryItem, 0, t.config.BatchSize)
	t.mu.Unlock()

	req := TrackRequest{Batch: batch}
	body, _ := json.Marshal(req)

	for i := 0; i < t.config.MaxRetries; i++ {
		httpReq, err := http.NewRequest("POST", t.config.Endpoint, bytes.NewReader(body))
		if err != nil {
			continue
		}
		httpReq.Header.Set("Content-Type", "application/json")
		if t.config.APIKey != "" {
			httpReq.Header.Set("Authorization", "Bearer "+t.config.APIKey)
		}

		resp, err := t.client.Do(httpReq)
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 300 {
				return
			}
		}

		time.Sleep(time.Duration(i+1) * time.Second)
	}

	t.mu.Lock()
	t.queue = append(batch, t.queue...)
	t.mu.Unlock()
}

func (t *Telemetry) flushLoop() {
	ticker := time.NewTicker(t.config.FlushInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			t.Flush()
		case <-t.stopCh:
			t.Flush()
			return
		}
	}
}

func (t *Telemetry) Destroy() {
	close(t.stopCh)
}

func generateUserID() string {
	return fmt.Sprintf("u_%d", time.Now().UnixNano()%100000000)
}
