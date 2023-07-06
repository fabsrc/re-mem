import mimicFn from "mimic-fn";

type AnyFunction = (...arguments_: any) => any;

interface CacheItem<Value> {
  data: Promise<Value>;
  timestamp: number;
  maxAge: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  timeout?: NodeJS.Timeout;
}

interface CacheStorage<KeyType, ValueType> {
  has: (key: KeyType) => boolean;
  get: (key: KeyType) => CacheItem<ValueType> | undefined;
  set: (key: KeyType, value: CacheItem<ValueType>) => void;
  delete: (key: KeyType) => void;
  clear?: () => void;
}

interface Options<FunctionToMemoize extends AnyFunction, CacheKeyType> {
  maxAge?: number;
  cacheKey?: (arguments_: Parameters<FunctionToMemoize>) => CacheKeyType;
  cache?: CacheStorage<CacheKeyType, ReturnType<FunctionToMemoize>>;
  cachePromiseRejection?: boolean;
  staleWhileRevalidate?: number;
  staleIfError?: number;
}

const cacheStore = new WeakMap<AnyFunction>();

function reMem<
  FunctionToMemoize extends AnyFunction,
	CacheKeyType
>(
  fn: FunctionToMemoize,
  {
    cacheKey,
    cache = new Map(),
    maxAge = Infinity,
    cachePromiseRejection = false,
    staleWhileRevalidate,
    staleIfError, // values less than staleWhileRevalidate are ignored
  }: Options<FunctionToMemoize, CacheKeyType> = {}
): FunctionToMemoize {
  const timeoutTime = Math.max(
    maxAge,
    staleIfError ? staleIfError + maxAge : 0,
    staleWhileRevalidate ? staleWhileRevalidate + maxAge : 0
  );

  const setCacheItem = (
    key: any,
    fnPromise: Promise<ReturnType<FunctionToMemoize>>,
    timestamp: number
  ): void => {
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
    this: FunctionToMemoize,
    ...args: Parameters<FunctionToMemoize>
  ): Promise<ReturnType<FunctionToMemoize>> {
    const key = cacheKey ? cacheKey(args) : args[0];
    const cacheItem = cache.get(key);
    const now = Date.now();

    if (cacheItem) {
      // no expiry
      if (cacheItem.timeout === undefined) {
        return cacheItem.data;
      }

      // within maxAge
      if (cacheItem.timestamp + cacheItem.maxAge > now) {
        return cacheItem.data;
      }

      // should we try another request?
      // this is after maxAge and before staleWhileRevalidate or staleIfError
      // istanbul ignore else - we fall through to making a request later
      if (cacheItem.timestamp + timeoutTime > now) {
        const fnPromise = Promise.resolve().then(() => fn.apply(this, args));

        // always put a success in the cache
        const p = fnPromise.then((res) => {
          // no timeout is the first case in the outer if (no expiry)
          clearTimeout(cacheItem.timeout as NodeJS.Timeout);

          setCacheItem(key, fnPromise, now);

          return res;
        });

        // staleWhileRevalidate takes precedence over staleIfError
        if (
          staleWhileRevalidate &&
          cacheItem.staleWhileRevalidate &&
          cacheItem.timestamp +
            cacheItem.maxAge +
            cacheItem.staleWhileRevalidate >
            now
        ) {
          // ignore errors after revalidation
          p.catch(() => {});
          return cacheItem.data;
        }

        // we're within staleIfError
        return p.catch(() => {
          // TODO logging, and it'd be great to capture this somewhere so the
          // app could find out it's happened
          return cacheItem.data;
        });
      }
    }

    const fnPromise = Promise.resolve().then(() => fn.apply(this, args));

    setCacheItem(key, fnPromise, now);

    return fnPromise.catch((err) => {
      if (!cachePromiseRejection) {
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

  return reMemFn as FunctionToMemoize;
}

export default reMem;

export const clear = (fn: AnyFunction): void => {
  const cache = cacheStore.get(fn);
  if (!cache) {
    throw new TypeError("Can't clear a function that was not memoized!");
  }

  if (typeof cache.clear !== "function") {
    throw new TypeError("The cache Map can't be cleared!");
  }

  cache.clear();
};
