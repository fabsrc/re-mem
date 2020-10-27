import reMem, { clear } from "..";

describe("reMem", () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it("memoizes a function", async () => {
    const testFn = jest.fn();
    const memFn = reMem(testFn);
    await memFn();
    await memFn();
    expect(testFn).toHaveBeenCalledTimes(1);
  });

  it("memoizes a function returning a Promise", async () => {
    const testFn = jest.fn().mockResolvedValue(undefined);
    const memFn = reMem(testFn);
    await memFn();
    await memFn();
    expect(testFn).toHaveBeenCalledTimes(1);
  });

  it("throws error on first invocation", async () => {
    const testErr = new Error("TestError");
    const testFn = jest.fn().mockRejectedValue(testErr);
    const memFn = reMem(testFn);
    await expect(memFn).rejects.toThrow(testErr);
  });

  describe("cacheKey", () => {
    it("use first argument as cache key by default", async () => {
      const testCache = new Map();
      const testFn = jest.fn();
      const memFn = reMem(testFn, { cache: testCache });
      await memFn(1, 2, 3);
      expect(testCache.has(1)).toBe(true);
    });

    it("calls function to generate cache key", async () => {
      const testCache = new Map();
      const testFn = jest.fn();
      const testCacheKeyFn = jest.fn().mockReturnValue("testKey");
      const memFn = reMem(testFn, {
        cache: testCache,
        cacheKey: testCacheKeyFn,
      });
      await memFn(1, 2, 3);
      expect(testCacheKeyFn).toHaveBeenCalledWith([1, 2, 3]);
      expect(testCache.has("testKey")).toBe(true);
    });
  });
  describe("maxAge", () => {
    beforeEach(() => {
      jest.useFakeTimers("modern");
    });

    it("returns cached promise for Infinity by default", async () => {
      const testFn = jest.fn().mockResolvedValue("test");
      const testMemFn = reMem(testFn);
      await testMemFn();
      jest.advanceTimersByTime(Infinity);
      await testMemFn();
      expect(testFn).toBeCalledTimes(1);
    });

    it("returns cached promise for defined maxAge", async () => {
      const testFn = jest.fn().mockResolvedValue("test");
      const testMemFn = reMem(testFn, { maxAge: 100 });
      await testMemFn();
      jest.advanceTimersByTime(25);
      await testMemFn();
      jest.advanceTimersByTime(25);
      await testMemFn();
      expect(testFn).toBeCalledTimes(1);
      jest.advanceTimersByTime(51);
      await testMemFn();
      expect(testFn).toBeCalledTimes(2);
    });

    it("removes promise from cache after maxAge", async () => {
      const testCache = new Map();
      const testFn = jest.fn().mockResolvedValue("test");
      const testMemFn = reMem(testFn, { maxAge: 100, cache: testCache });
      await testMemFn();
      expect(testCache.size).toBe(1);
      jest.advanceTimersByTime(101);
      expect(testCache.size).toBe(0);
    });
  });

  describe("staleWhileRevalidate", () => {
    beforeEach(() => {
      jest.useFakeTimers("modern");
    });

    it("returns stale data after maxAge but before staleWhileRevalidate ends", async () => {
      const testFn = jest
        .fn()
        .mockResolvedValueOnce("first")
        .mockResolvedValueOnce("second");
      const testMemFn = reMem(testFn, {
        maxAge: 100,
        staleWhileRevalidate: 500,
      });
      await expect(testMemFn()).resolves.toEqual("first");
      jest.advanceTimersByTime(101);
      await expect(testMemFn()).resolves.toEqual("first");
      jest.advanceTimersByTime(400);
      await expect(testMemFn()).resolves.toEqual("second");
    });

    it("does not return stale data after maxAge + staleWhileRevalidate", async () => {
      const testFn = jest
        .fn()
        .mockResolvedValueOnce("first")
        .mockResolvedValueOnce("second")
        .mockResolvedValueOnce("third")
        .mockResolvedValueOnce("fourth");
      const testMemFn = reMem(testFn, {
        maxAge: 100,
        staleWhileRevalidate: 500,
      });
      await expect(testMemFn()).resolves.toEqual("first");
      jest.advanceTimersByTime(101);
      await expect(testMemFn()).resolves.toEqual("first");
      jest.advanceTimersByTime(400);
      await expect(testMemFn()).resolves.toEqual("second");
      await expect(testMemFn()).resolves.toEqual("third");
      jest.advanceTimersByTime(601);
      await expect(testMemFn()).resolves.toEqual("fourth");
    });
  });

  describe("staleIfError", () => {
    beforeEach(() => {
      jest.useFakeTimers("modern");
    });

    it("returns stale data on error after maxAge but before staleIfError ends", async () => {
      const testError = new Error("testError");
      const testFn = jest
        .fn()
        .mockResolvedValueOnce("first")
        .mockRejectedValue(testError);
      const testMemFn = reMem(testFn, {
        maxAge: 100,
        staleIfError: 500,
      });
      await expect(testMemFn()).resolves.toEqual("first");
      jest.advanceTimersByTime(101);
      await expect(testMemFn()).resolves.toEqual("first");
      expect(testFn).toHaveBeenCalledTimes(2);
    });

    it("does not return stale data on error after maxAge + staleIfError", async () => {
      const testError = new Error("testError");
      const testFn = jest
        .fn()
        .mockResolvedValueOnce("first")
        .mockRejectedValue(testError);
      const testMemFn = reMem(testFn, {
        maxAge: 100,
        staleWhileRevalidate: 500,
      });
      await expect(testMemFn()).resolves.toEqual("first");
      jest.advanceTimersByTime(101);
      await expect(testMemFn()).resolves.toEqual("first");
      jest.advanceTimersByTime(500);
      await expect(testMemFn()).rejects.toEqual(testError);
      expect(testFn).toHaveBeenCalledTimes(3);
    });
  });

  describe("cachePromiseRejection", () => {
    const testErr = new Error("TestError");

    describe("when set to false (default)", () => {
      it("deletes promise from cache after promise is rejected", async () => {
        const testFn = jest.fn().mockRejectedValue(testErr);
        const testMemFn = reMem(testFn);
        await expect(testMemFn()).rejects.toThrow();
        await expect(testMemFn()).rejects.toThrow();
        expect(testFn).toHaveBeenCalledTimes(2);
      });
    });

    describe("when set to true", () => {
      it("returns cached rejected promise", async () => {
        const testFn = jest.fn().mockRejectedValue(testErr);
        const testMemFn = reMem(testFn, { cachePromiseRejection: true });
        await expect(testMemFn()).rejects.toThrow();
        await expect(testMemFn()).rejects.toThrow();
        await expect(testMemFn()).rejects.toThrow();
        expect(testFn).toHaveBeenCalledTimes(1);
      });
    });
  });
});

describe("clear", () => {
  it("throws error if function was not memoized", () => {
    const testFn = jest.fn();
    expect(() => clear(testFn)).toThrowError(
      "Can't clear a function that was not memoized!"
    );
  });

  it("throws error if used cache has no clear method", async () => {
    const testFn = jest.fn();
    const memFn = reMem(testFn, { cache: {} as any });
    expect(() => clear(memFn)).toThrowError("The cache Map can't be cleared!");
  });

  it("clears cache of memoized function", async () => {
    const testFn = jest.fn();
    const memFn = reMem(testFn);
    await memFn();
    clear(memFn);
    await memFn();
    expect(testFn).toHaveBeenCalledTimes(2);
  });
});
