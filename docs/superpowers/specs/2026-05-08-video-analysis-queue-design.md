# Vidana 视频分析排队机制设计

日期：2026-05-08

## 背景

当前 Web 和 CLI 请求会在 HTTP 请求生命周期内直接调用 Mimo。多用户并发时会同时占用 Vercel/API 进程、数据库连接和 Mimo 调用额度；一旦 Mimo 限频、空响应或网络抖动，用户请求容易超时，失败也难以统一重试。

目标是把“提交分析”和“执行 Mimo 分析”解耦：API 只负责创建任务并入队，Worker 按受控速率处理任务，结果写回数据库，前端和 CLI 通过状态查询拿结果。

## 选定方案

采用现有腾讯云 CVM 自建 Redis，使用 Redis Stream 做任务队列，部署一个长驻 Worker 处理分析任务。

选择原因：

- 不额外购买腾讯云 Redis，MVP 成本低。
- Redis Stream 足够支持排队、消费者确认、失败重试和 pending 消息恢复。
- Worker 部署在腾讯云 VPC 内，网络、日志和 Mimo 出网控制更可控。
- 数据库仍作为最终状态源，Redis 只做调度，不承担业务真相。

## 非目标

- 不做复杂多租户调度。
- 不做完整计费预授权系统。
- 不引入托管 Redis/TDMQ，除非后续并发规模证明需要。
- 不改变 Vidana 的主产品形态；仍是上传、填写条件、提交分析、查看结果。

## 架构

```text
Web/CLI
  |
  | submit video + analysis params
  v
API server
  | 1. validate auth/credits
  | 2. create analyses row: queued
  | 3. XADD redis stream
  v
Redis Stream: vidana:analysis:queue
  |
  | XREADGROUP
  v
Worker on CVM
  | 1. claim task
  | 2. mark processing
  | 3. call Mimo with rate limit
  | 4. write completed/failed
  | 5. XACK
  v
Supabase/Postgres analyses table
  ^
  |
Web/CLI polls status/result
```

## Data Model

Extend `analyses.status` to support queue states:

```text
queued | processing | completed | failed | canceled
```

Keep compatibility with existing values if needed:

```text
pending | analyzing
```

Add fields to `analyses`:

```text
queued_at timestamptz
started_at timestamptz
attempt_count integer not null default 0
max_attempts integer not null default 3
next_retry_at timestamptz
locked_by text
locked_at timestamptz
error_message text
source_mode text
```

Redis stream message payload:

```json
{
  "analysisId": "...",
  "userId": "...",
  "queuedAt": "..."
}
```

The Worker must reload full task details from the database by `analysisId`; Redis payload is intentionally minimal.

## API Flow

For Web analysis:

1. Verify session.
2. Validate `storagePath`, target audience, platform and context.
3. Check user has credits.
4. Enforce per-user active task limit.
5. Insert or update analysis row as `queued`.
6. Add message to Redis Stream.
7. Return `202 Accepted` with `analysisId`.

For CLI/public analysis:

1. Verify bearer API key.
2. Parse and upload video.
3. Run the same queue submission path.
4. Default behavior waits by polling until terminal status.
5. Add `--no-wait` and `vidana status <analysisId>` later if needed.

## Worker Flow

Worker process:

1. Connect to Redis and create consumer group if missing.
2. Read from `vidana:analysis:queue` with `XREADGROUP`.
3. For each message, load the analysis row.
4. Skip and acknowledge if already terminal.
5. Atomically claim the task by changing `queued` or retry-ready `failed` to `processing`.
6. Run existing Mimo analysis logic.
7. On success, update `completed`, `report`, `raw_result`, `score`, `completed_at`, `source_mode`; then charge one credit.
8. On retryable failure, update attempt metadata and requeue after delay.
9. On final failure, update `failed` and `error_message`.
10. Acknowledge Redis message after database state is safely updated.

## Rate Limiting

Use two limits in Worker:

- `MIMO_MAX_CONCURRENCY`, default `1`.
- `MIMO_MIN_INTERVAL_MS`, default `3000`.

If Mimo later provides a clear quota such as requests per minute, add a Redis token bucket. MVP can start with one Worker process and concurrency `1`, which is the safest way to avoid Mimo frequency errors.

## Retry Policy

Retryable:

- Mimo `429`
- Mimo `5xx`
- network timeout
- `failed to download url data`
- empty Mimo response

Not retryable:

- unsupported video format
- video missing from storage
- invalid auth/API key
- insufficient credits
- missing required fields
- service misconfiguration such as missing Mimo key

Backoff:

```text
attempt 1: retry after 30 seconds
attempt 2: retry after 2 minutes
attempt 3: retry after 10 minutes
after max_attempts: failed
```

## Credits

MVP keeps the current successful-charge model:

- Check credits before queue submission.
- Charge one credit only after `completed`.
- Do not charge failed tasks.

To prevent users from submitting unlimited queued work, enforce active task limit:

```text
queued + processing <= 3 per user
```

If this becomes insufficient, add credit reservation in a later iteration.

## Frontend Behavior

After submit:

- Show `queued` state immediately.
- Poll analysis status every 2-3 seconds.
- Show `processing` when Worker starts.
- Show report when `completed`.
- Show concrete `error_message` when `failed`.
- Keep history sidebar/status labels in sync with new states.

No chat interface is introduced.

## CLI Behavior

Default CLI behavior should remain convenient:

- Submit task.
- Poll status.
- Print Markdown when completed.
- Exit non-zero with backend error message when failed.

Future commands:

```bash
vidana analyze video.mp4 --no-wait
vidana status <analysisId>
```

## Redis Deployment On CVM

MVP Redis can run on the existing CVM through Docker or system package.

Requirements:

- Bind to `127.0.0.1` if API and Worker are on the same machine.
- If accessed across VPC machines, bind to private IP only and restrict security group.
- Enable AOF persistence.
- Set memory limit and Stream trimming policy.
- Do not expose Redis to public internet.

Recommended env:

```bash
REDIS_URL=redis://127.0.0.1:6379
ANALYSIS_QUEUE_STREAM=vidana:analysis:queue
ANALYSIS_QUEUE_GROUP=vidana-workers
MIMO_MAX_CONCURRENCY=1
MIMO_MIN_INTERVAL_MS=3000
ANALYSIS_ACTIVE_LIMIT_PER_USER=3
```

## Testing

Unit tests:

- queue enqueue payload
- active task limit
- retryability classification
- backoff calculation
- status mapping

Integration tests:

- submit creates `queued` analysis and Redis message
- Worker completes a fake Mimo task
- Worker retries retryable errors
- Worker marks final failure after max attempts
- CLI polling returns Markdown on completion

Manual verification:

- Start Redis locally.
- Start API and Worker.
- Submit 2-3 analyses quickly.
- Confirm only one Mimo job runs at a time with default settings.
- Confirm UI moves through queued -> processing -> completed/failed.

## Migration Path

Phase 1:

- Add DB fields and status values.
- Add Redis queue helper.
- Add Worker entrypoint.
- Make Web/API submit queued tasks.
- Add polling/status support.

Phase 2:

- Move CLI to queued submission and polling.
- Add retry and active task limit tests.
- Improve admin visibility of queued/processing tasks.

Phase 3:

- Add `--no-wait` and `vidana status`.
- Add stronger operational metrics.
- Consider moving from self-hosted Redis to Tencent Cloud Redis/TDMQ if queue volume or availability requirements increase.
