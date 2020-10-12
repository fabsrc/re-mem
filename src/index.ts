import mimicFn from "mimic-fn";

interface CacheItem {
  data: Promise<any>;
  maxAge: number;
  staleWhileRevalidate?: number;
  staleIfError?: number;
  timeout?: NodeJS.Timeout;
}

interface Options {
  cacheKey?: Function;
  cache?: Map<any, CacheItem>;
  maxAge?: number;
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
    staleWhileRevalidate,
    staleIfError,
  }: Options = {}
): (...args: ArgumentsType) => Promise<ReturnType> {
  const setCacheItem = (
    key: any,
    fnPromise: Promise<ReturnType>,
    timestamp: number
  ): void => {
    cache.set(key, {
      data: fnPromise,
      maxAge: timestamp + maxAge,
      staleWhileRevalidate: staleWhileRevalidate
        ? timestamp + staleWhileRevalidate
        : undefined,
      staleIfError: staleIfError ? timestamp + staleIfError : undefined,
      timeout: Number.isFinite(maxAge)
        ? setTimeout(() => {
            cache.delete(key);
          }, maxAge)
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
      console.debug("Cache item found");

      if (cacheItem.maxAge < now) {
        console.debug("Cache item expired. Resolve new one.");

        cache.delete(key);
      } else {
        if (staleWhileRevalidate) {
          if (
            cacheItem.staleWhileRevalidate &&
            cacheItem.staleWhileRevalidate < now
          ) {
            console.debug("REVALIDATE");
            const fnPromise = Promise.resolve().then(() =>
              fn.apply(this, args)
            );

            fnPromise
              .then((res) => {
                if (cacheItem.timeout) {
                  clearTimeout(cacheItem.timeout);
                }

                setCacheItem(key, fnPromise, now);

                return res;
              })
              .catch((err) => {
                if (
                  staleIfError &&
                  cacheItem.staleIfError &&
                  cacheItem.staleIfError > now
                ) {
                  return;
                }

                console.debug("Stale not used for error");
                setCacheItem(key, fnPromise, now);
              });

            return cacheItem.data;
          }
        } else if (
          staleIfError &&
          cacheItem.staleIfError &&
          cacheItem.staleIfError > now
        ) {
          console.debug("CALL WITH STALE IF ERROR");
          const fnPromise = Promise.resolve().then(() => fn.apply(this, args));
          return fnPromise
            .then((res) => {
              if (cacheItem.timeout) {
                clearTimeout(cacheItem.timeout);
              }

              setCacheItem(key, fnPromise, now);

              return res;
            })
            .catch((err) => {
              if (
                staleIfError &&
                cacheItem.staleIfError &&
                cacheItem.staleIfError > now
              ) {
                return cacheItem.data;
              }

              console.debug("Stale not returned for error");
              throw err;
            });
        }

        return cacheItem.data;
      }
    } else {
      console.debug("👎 NO ITEM IN CACHE");
    }

    const fnPromise = Promise.resolve().then(() => fn.apply(this, args));

    setCacheItem(key, fnPromise, now);

    return fnPromise.catch((err) => {
      const cacheItem = cache.get(key);

      if (cacheItem?.timeout) {
        clearTimeout(cacheItem.timeout);
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
