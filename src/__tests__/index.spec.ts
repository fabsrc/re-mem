import reMem from "..";

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

    it("returns cached promise for defined max age", async () => {
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
  describe("cacheError", () => {
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
        const testMemFn = reMem(testFn, { cacheError: true });
        await expect(testMemFn()).rejects.toThrow();
        await expect(testMemFn()).rejects.toThrow();
        await expect(testMemFn()).rejects.toThrow();
        expect(testFn).toHaveBeenCalledTimes(1);
      });
    });
  });
});
