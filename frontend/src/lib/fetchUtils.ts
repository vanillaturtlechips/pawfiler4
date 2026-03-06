import { showErrorToast } from "./errorHandler";

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY,
  context?: string
): Promise<T> {
  try {
    return await fetchFn();
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fetchFn, retries - 1, delay * 2, context);
    }
    throw showErrorToast(error, context);
  }
}

export async function fetchWithTimeout<T>(
  fetchFn: () => Promise<T>,
  timeout = 30000
): Promise<T> {
  return Promise.race([
    fetchFn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("요청 시간이 초과되었습니다")), timeout)
    ),
  ]);
}
