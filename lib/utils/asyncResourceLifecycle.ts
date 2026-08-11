export interface AsyncResourceLease<T> {
  resource: T;
  release: () => void;
}

export interface AsyncResourceHandlers<T> {
  onLoad: (resource: T) => void;
  onError?: (error: unknown) => void;
}

/**
 * Own one asynchronous resource acquisition until cleanup. Handler refs are
 * read only when the async operation settles, so React callers can update
 * callbacks without restarting the acquisition effect.
 */
export function startAsyncResourceLifecycle<T>(
  acquire: () => Promise<AsyncResourceLease<T>>,
  handlersRef: { current: AsyncResourceHandlers<T> },
): () => void {
  let active = true;
  let lease: AsyncResourceLease<T> | null = null;

  const release = () => {
    if (!lease) return;
    const ownedLease = lease;
    lease = null;
    ownedLease.release();
  };

  void acquire().then(
    (acquiredLease) => {
      if (!active) {
        acquiredLease.release();
        return;
      }

      lease = acquiredLease;
      try {
        handlersRef.current.onLoad(acquiredLease.resource);
      } catch (error) {
        handlersRef.current.onError?.(error);
      }
    },
    (error) => {
      if (active) handlersRef.current.onError?.(error);
    },
  );

  return () => {
    if (!active) return;
    active = false;
    release();
  };
}
