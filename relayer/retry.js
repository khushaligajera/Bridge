/**
 * Retry a async function up to `maxAttempts` times with exponential backoff.
 *
 * @param {() => Promise<T>} fn           Function to retry.
 * @param {number}           maxAttempts  Total attempts (default: 3).
 * @param {number}           baseDelayMs  Initial delay in ms (default: 2000).
 * @param {string}           label        Label for log messages.
 * @returns {Promise<T>}
 */
export async function withRetry(fn, maxAttempts = 3, baseDelayMs = 2000, label = "op") {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);  // 2s, 4s, 8s …
      console.error(`[retry] ${label} failed (attempt ${attempt}/${maxAttempts}): ${err.message}`);

      if (attempt < maxAttempts) {
        console.log(`[retry] retrying in ${delay}ms …`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`[retry] ${label} exhausted after ${maxAttempts} attempts: ${lastError?.message}`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));