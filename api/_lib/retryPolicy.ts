export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(err)
}

export function isRetryableAnalysisError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true
  if (err instanceof Error && err.name === 'AbortError') return true

  const message = errorMessage(err).toLowerCase()
  return (
    message.includes('mimo api error 429') ||
    message.includes('mimo api error 500') ||
    message.includes('failed to download url data') ||
    message.includes('empty response') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('timed out')
  )
}

export function backoffMsForAttempt(attempt: number): number {
  if (attempt <= 1) return 30_000
  if (attempt === 2) return 120_000
  return 600_000
}
