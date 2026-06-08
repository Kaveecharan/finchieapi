import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Isolate the retry logic by testing isTransientSmtpError behaviour indirectly
// via a minimal mock of sendEmail that replicates the retry loop exactly.

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransientSmtpError(err) {
  if (!err.responseCode) return true;
  return Math.floor(err.responseCode / 100) === 4;
}

async function sendEmailWithRetry(sendMail, MAX_ATTEMPTS = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await sendMail();
      return "ok";
    } catch (err) {
      lastErr = err;
      if (!isTransientSmtpError(err) || attempt === MAX_ATTEMPTS) break;
      await delay(1); // use 1ms in tests instead of 1000ms
    }
  }
  throw lastErr;
}

describe("email retry logic", () => {
  it("succeeds on first attempt", async () => {
    const mock = jest.fn().mockResolvedValue(undefined);
    await expect(sendEmailWithRetry(mock)).resolves.toBe("ok");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error (no responseCode) and succeeds", async () => {
    const mock = jest.fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue(undefined);
    await expect(sendEmailWithRetry(mock)).resolves.toBe("ok");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("retries on 4xx SMTP code and succeeds on third attempt", async () => {
    const err421 = Object.assign(new Error("421 Service unavailable"), { responseCode: 421 });
    const mock = jest.fn()
      .mockRejectedValueOnce(err421)
      .mockRejectedValueOnce(err421)
      .mockResolvedValue(undefined);
    await expect(sendEmailWithRetry(mock)).resolves.toBe("ok");
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry on 5xx permanent failure", async () => {
    const err550 = Object.assign(new Error("550 Mailbox not found"), { responseCode: 550 });
    const mock = jest.fn().mockRejectedValue(err550);
    await expect(sendEmailWithRetry(mock)).rejects.toMatchObject({ responseCode: 550 });
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("exhausts all 3 attempts on persistent transient error and throws", async () => {
    const transient = new Error("ETIMEDOUT");
    const mock = jest.fn().mockRejectedValue(transient);
    await expect(sendEmailWithRetry(mock)).rejects.toThrow("ETIMEDOUT");
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("isTransientSmtpError: no responseCode → true", () => {
    expect(isTransientSmtpError(new Error("ECONNRESET"))).toBe(true);
  });

  it("isTransientSmtpError: 421 → true", () => {
    expect(isTransientSmtpError({ responseCode: 421 })).toBe(true);
  });

  it("isTransientSmtpError: 452 → true", () => {
    expect(isTransientSmtpError({ responseCode: 452 })).toBe(true);
  });

  it("isTransientSmtpError: 550 → false", () => {
    expect(isTransientSmtpError({ responseCode: 550 })).toBe(false);
  });

  it("isTransientSmtpError: 500 → false", () => {
    expect(isTransientSmtpError({ responseCode: 500 })).toBe(false);
  });
});
