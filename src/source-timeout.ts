/** Bound the whole network operation, including consumption of the response body. */
export const SOURCE_TIMEOUT_MS = 45_000;

export async function withSourceTimeout<T>(load: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException("Source loading timed out", "TimeoutError");
      reject(error);
      controller.abort(error);
    }, SOURCE_TIMEOUT_MS);
  });
  try { return await Promise.race([load(controller.signal), deadline]); }
  finally { clearTimeout(timer!); }
}
