import reMem from "..";

describe("reMem", () => {
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
});
