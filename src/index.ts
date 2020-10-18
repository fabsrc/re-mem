import mimicFn from "mimic-fn";

interface CacheItem {
  data: Promise<any>;
  timestamp: number;
  maxAge: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  timeout?: NodeJS.Timeout;
}

interface Options {
  cacheKey?: Function;
  cache?: Map<any, CacheItem>;
  maxAge?: number;
  cacheError?: boolean;
  staleWhileRevalidate?: number;
  staleIfError?: number;
}

const cacheStore = new WeakMap();

function reMem<
  ArgumentsType extends unknown[],
  ReturnType
  // CacheKeyType
  // FunctionToMemoize = (...args: ArgumentsType) => ReturnType
>(
  fn: (...args: ArgumentsType) => Promise<ReturnType>,
  {
    cacheKey,
    cache = new Map(),
    maxAge = Infinity,
    cacheError = false,
    staleWhileRevalidate,
    staleIfError,
  }: Options = {}
): (...args: ArgumentsType) => Promise<ReturnType> {
  const setCacheItem = (
    key: any,
    fnPromise: Promise<ReturnType>,
    timestamp: number
  ): void => {
    const timeoutTime = Math.max(
      maxAge,
      staleIfError ? staleIfError + maxAge : 0,
      staleWhileRevalidate ? staleWhileRevalidate + maxAge : 0
    );

    cache.set(key, {
      data: fnPromise,
      timestamp,
      maxAge,
      staleWhileRevalidate,
      staleIfError,
      timeout: Number.isFinite(timeoutTime)
        ? setTimeout(() => {
            cache.delete(key);
          }, timeoutTime)
        : undefined,
    });
  };

  const reMemFn = async function (
    this: Function,
    ...args: ArgumentsType
  ): Promise<ReturnType> {
    const key = cacheKey ? cacheKey(args) : args[0];
    const cacheItem = cache.get(key);
    const now = Date.now();

    if (cacheItem) {
      if (cacheItem.timestamp + cacheItem.maxAge < now) {
        if (
          staleWhileRevalidate &&
          cacheItem.staleWhileRevalidate &&
          cacheItem.timestamp +
            cacheItem.maxAge +
            cacheItem.staleWhileRevalidate >
            now
        ) {
          const fnPromise = Promise.resolve().then(() => fn.apply(this, args));

          fnPromise
            .then((res) => {
              if (cacheItem.timeout) {
                clearTimeout(cacheItem.timeout);
              }

              setCacheItem(key, fnPromise, now);

              return res;
            })
            .catch(() => {
              // Ignore error after revalidation
            });

          return cacheItem.data;
        }

        if (
          staleIfError &&
          cacheItem.staleIfError &&
          cacheItem.timestamp + cacheItem.maxAge + cacheItem.staleIfError > now
        ) {
          const fnPromise = Promise.resolve().then(() => fn.apply(this, args));
          return fnPromise.catch(() => cacheItem.data);
        }
      } else {
        return cacheItem.data;
      }
    }

    const fnPromise = Promise.resolve().then(() => fn.apply(this, args));

    setCacheItem(key, fnPromise, now);

    return fnPromise.catch((err) => {
      if (!cacheError) {
        const cacheItem = cache.get(key);

        if (cacheItem?.timeout) {
          clearTimeout(cacheItem.timeout);
        }

        cache.delete(key);
      }

      throw err;
    });
  };

  mimicFn(reMemFn, fn, { ignoreNonConfigurable: true });

  cacheStore.set(reMemFn, cache);

  return reMemFn;
}

export default reMem;

export const clear = (fn: Function) => {
  if (!cacheStore.has(fn)) {
    throw new Error("Can't clear a function that was not memoized!");
  }

  const cache = cacheStore.get(fn);
  if (typeof cache.clear === "function") {
    cache.clear();
  }
};
