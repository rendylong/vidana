# Tencent Cloud Redis Worker

Vidana uses Redis Stream on the CVM to queue video analysis jobs.

## Local/CVM Redis

Run Redis bound to localhost or VPC private IP only. Do not expose Redis publicly.

Recommended env:

    REDIS_URL=redis://127.0.0.1:6379
    ANALYSIS_QUEUE_STREAM=vidana:analysis:queue
    ANALYSIS_QUEUE_DELAYED=vidana:analysis:delayed
    ANALYSIS_QUEUE_GROUP=vidana-workers
    ANALYSIS_PENDING_IDLE_MS=60000
    ANALYSIS_STALE_LOCK_MS=900000
    MIMO_MAX_CONCURRENCY=1
    MIMO_MIN_INTERVAL_MS=3000
    ANALYSIS_ACTIVE_LIMIT_PER_USER=3

## Start Worker

    npm run worker:analysis

Run the API/web process separately. The API submits jobs; the worker executes them.

For local full-stack development, run Redis first, then run:

    npm run dev:full
    npm run worker:analysis

