import { useState, useCallback } from "react";
import { showErrorToast } from "@/lib/errorHandler";

interface UseAsyncOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  retryCount?: number;
  retryDelay?: number;
}

export function useAsync<T>(
  asyncFunction: (...args: any[]) => Promise<T>,
  options: UseAsyncOptions<T> = {}
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(
    async (...args: any[]) => {
      setLoading(true);
      setError(null);

      let lastError: Error | null = null;
      const maxRetries = options.retryCount ?? 0;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await asyncFunction(...args);
          setData(result);
          setLoading(false);
          options.onSuccess?.(result);
          return result;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          
          if (attempt < maxRetries) {
            await new Promise(resolve => 
              setTimeout(resolve, options.retryDelay ?? 1000)
            );
          }
        }
      }

      setError(lastError);
      setLoading(false);
      options.onError?.(lastError!);
      showErrorToast(lastError);
      throw lastError;
    },
    [asyncFunction, options]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return { execute, loading, error, data, reset };
}
