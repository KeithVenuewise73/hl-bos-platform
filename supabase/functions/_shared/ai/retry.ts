// Bounded retry for transient provider failures (Stage A V0).
//
// The AI gateway wraps ONLY the provider `generate()` call in this — never the
// DB run lifecycle. begin_run creates exactly one pending run; retries re-issue
// the model call within that one run; finish_run is called once at the end. So
// a retried-then-succeeded call yields ONE run and ONE completion, not
// duplicates — the DB idempotency (finish_run only updates a 'pending' row) is
// the backstop, and this wrapper never calls finish_run itself.

export interface RetryOptions {
  /** Total attempts, including the first. Default 2 (one retry). */
  attempts?: number;
  /** Return true to retry on this error; default retries on any throw. */
  retryable?: (err: unknown) => boolean;
  /** Observability hook; must not throw. */
  onRetry?: (attempt: number, err: unknown) => void;
}

/**
 * Run `fn` up to `attempts` times, returning the first success. Re-throws the
 * last error if all attempts fail (or the error is non-retryable).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 2);
  const retryable = opts.retryable ?? (() => true);
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i >= attempts || !retryable(err)) break;
      opts.onRetry?.(i, err);
    }
  }
  throw lastErr;
}
