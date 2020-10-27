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
  cacheError?: boolean;
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
    cacheError = false,
    staleWhileRevalidate,
    staleIfError,
  }: Options<FunctionToMemoize, CacheKeyType> = {}
): FunctionToMemoize {
  const setCacheItem = (
    key: any,
    fnPromise: Promise<ReturnType<FunctionToMemoize>>,
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
    this: FunctionToMemoize,
    ...args: Parameters<FunctionToMemoize>
  ): Promise<ReturnType<FunctionToMemoize>> {
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
