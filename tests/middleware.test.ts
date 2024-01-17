import { describe, it, expect, vi } from "vitest";
import {
  createMiddleware,
  composeMiddleware,
  timingMiddleware,
  corsMiddleware,
  authMiddleware,
  rateLimitMiddleware,
  AuthError,
  RateLimitError,
} from "../src/Middleware";
import { Context } from "../src/types";

function makeContext(overrides: Partial<Context> = {}): Context {
  return {
    input: {},
    params: {},
    query: {},
    headers: {},
    method: "GET",
    path: "/test",
    state: {},
    ...overrides,
  };
}

describe("createMiddleware", () => {
  it("wraps a handler function", async () => {
    const mw = createMiddleware(async (ctx, next) => {
      ctx.state["touched"] = true;
      return next();
    });

    const ctx = makeContext();
    await mw(ctx, async () => "done");
    expect(ctx.state["touched"]).toBe(true);
  });
});

describe("composeMiddleware", () => {
  it("executes middleware in order", async () => {
    const order: number[] = [];
    const mw1 = createMiddleware(async (_, next) => { order.push(1); return next(); });
    const mw2 = createMiddleware(async (_, next) => { order.push(2); return next(); });
    const mw3 = createMiddleware(async (_, next) => { order.push(3); return next(); });

    const composed = composeMiddleware(mw1, mw2, mw3);
    await composed(makeContext(), async () => { order.push(4); return "done"; });

    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("allows short-circuiting without calling next", async () => {
    const mw = createMiddleware(async () => "blocked");
    const composed = composeMiddleware(mw);
    const result = await composed(makeContext(), async () => "should not reach");
    expect(result).toBe("blocked");
  });
});

describe("timingMiddleware", () => {
  it("measures execution time", async () => {
    const onFinish = vi.fn();
    const mw = timingMiddleware(onFinish);

    await mw(makeContext(), async () => "ok");

    expect(onFinish).toHaveBeenCalledWith("GET", "/test", expect.any(Number));
  });

  it("reports timing even on error", async () => {
    const onFinish = vi.fn();
    const mw = timingMiddleware(onFinish);

    await expect(
      mw(makeContext(), async () => { throw new Error("boom"); }),
    ).rejects.toThrow("boom");

    expect(onFinish).toHaveBeenCalled();
  });
});

describe("corsMiddleware", () => {
  it("sets CORS headers in context state", async () => {
    const mw = corsMiddleware({ origin: "http://example.com" });
    const ctx = makeContext();

    await mw(ctx, async () => "ok");
    expect(ctx.state["cors"]).toHaveProperty("Access-Control-Allow-Origin", "http://example.com");
  });

  it("defaults to wildcard origin", async () => {
    const mw = corsMiddleware();
    const ctx = makeContext();

    await mw(ctx, async () => "ok");
    expect(ctx.state["cors"]).toHaveProperty("Access-Control-Allow-Origin", "*");
  });
});

describe("authMiddleware", () => {
  it("throws AuthError when no token", async () => {
    const mw = authMiddleware(async () => null);
    await expect(mw(makeContext(), async () => "ok")).rejects.toThrow(AuthError);
  });

  it("throws AuthError for invalid token", async () => {
    const mw = authMiddleware(async () => null);
    const ctx = makeContext({ headers: { authorization: "Bearer bad-token" } });
    await expect(mw(ctx, async () => "ok")).rejects.toThrow(AuthError);
  });

  it("sets user in state for valid token", async () => {
    const mw = authMiddleware(async (token) => {
      if (token === "valid") return { userId: "u1", role: "admin" };
      return null;
    });

    const ctx = makeContext({ headers: { authorization: "Bearer valid" } });
    await mw(ctx, async () => "ok");
    expect(ctx.state["user"]).toEqual({ userId: "u1", role: "admin" });
  });
});

describe("rateLimitMiddleware", () => {
  it("allows requests under the limit", async () => {
    const mw = rateLimitMiddleware({ windowMs: 60000, maxRequests: 5 });
    const ctx = makeContext({ headers: { "x-forwarded-for": "127.0.0.1" } });

    await mw(ctx, async () => "ok");
    expect(ctx.state["rateLimit"]).toHaveProperty("remaining", 4);
  });

  it("throws RateLimitError when limit exceeded", async () => {
    const mw = rateLimitMiddleware({ windowMs: 60000, maxRequests: 2 });
    const ctx1 = makeContext({ headers: { "x-forwarded-for": "10.0.0.1" } });
    const ctx2 = makeContext({ headers: { "x-forwarded-for": "10.0.0.1" } });
    const ctx3 = makeContext({ headers: { "x-forwarded-for": "10.0.0.1" } });

    await mw(ctx1, async () => "ok");
    await mw(ctx2, async () => "ok");
    await expect(mw(ctx3, async () => "ok")).rejects.toThrow(RateLimitError);
  });

  it("uses custom key function", async () => {
    const mw = rateLimitMiddleware({
      windowMs: 60000,
      maxRequests: 1,
      keyFn: (ctx) => ctx.headers["x-api-key"] ?? "anon",
    });

    const ctx1 = makeContext({ headers: { "x-api-key": "key-a" } });
    const ctx2 = makeContext({ headers: { "x-api-key": "key-b" } });

    await mw(ctx1, async () => "ok");
    // different key, should not be rate limited
    await expect(mw(ctx2, async () => "ok")).resolves.toBe("ok");
  });
});
