import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Router } from "../src/Router";

function createTestRouter() {
  return new Router()
    .define("getUser", {
      method: "GET",
      path: "/users/:id",
      input: z.object({ id: z.string() }),
      output: z.object({ id: z.string(), name: z.string() }),
    }, async (ctx) => ({
      id: ctx.params.id,
      name: "Alice",
    }))
    .define("listUsers", {
      method: "GET",
      path: "/users",
      input: z.object({ page: z.number().optional() }),
      output: z.object({ users: z.array(z.string()), total: z.number() }),
    }, async () => ({
      users: ["alice", "bob"],
      total: 2,
    }))
    .define("createUser", {
      method: "POST",
      path: "/users",
      input: z.object({ name: z.string(), email: z.string().email() }),
      output: z.object({ id: z.string(), name: z.string() }),
    }, async (ctx) => ({
      id: "new-id",
      name: ctx.input.name,
    }));
}

describe("Router", () => {
  describe("route matching", () => {
    it("matches a simple path", () => {
      const router = createTestRouter();
      const result = router.match("GET", "/users");
      expect(result).not.toBeNull();
      expect(result?.params).toEqual({});
    });

    it("matches a path with parameters", () => {
      const router = createTestRouter();
      const result = router.match("GET", "/users/123");
      expect(result).not.toBeNull();
      expect(result?.params.id).toBe("123");
    });

    it("returns null for unknown paths", () => {
      const router = createTestRouter();
      expect(router.match("GET", "/nonexistent")).toBeNull();
    });

    it("respects HTTP method", () => {
      const router = createTestRouter();
      expect(router.match("POST", "/users")).not.toBeNull();
      expect(router.match("DELETE", "/users")).toBeNull();
    });

    it("decodes URI-encoded parameters", () => {
      const router = createTestRouter();
      const result = router.match("GET", "/users/hello%20world");
      expect(result?.params.id).toBe("hello world");
    });
  });

  describe("request handling", () => {
    it("handles a valid GET request", async () => {
      const router = createTestRouter();
      const response = await router.handle("GET", "/users", {
        input: {},
        query: {},
        headers: {},
      });

      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.data).toHaveProperty("users");
        expect(response.data).toHaveProperty("total", 2);
      }
    });

    it("handles GET with path params", async () => {
      const router = createTestRouter();
      const response = await router.handle("GET", "/users/456", {
        input: { id: "456" },
        query: {},
        headers: {},
      });

      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.data).toEqual({ id: "456", name: "Alice" });
      }
    });

    it("handles POST with body", async () => {
      const router = createTestRouter();
      const response = await router.handle("POST", "/users", {
        input: { name: "Charlie", email: "charlie@test.com" },
        query: {},
        headers: {},
      });

      expect(response.success).toBe(true);
      if (response.success) {
        expect(response.data).toEqual({ id: "new-id", name: "Charlie" });
      }
    });

    it("returns NOT_FOUND for unmatched routes", async () => {
      const router = createTestRouter();
      const response = await router.handle("GET", "/missing", {});

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.code).toBe("NOT_FOUND");
      }
    });

    it("returns VALIDATION_ERROR for invalid input", async () => {
      const router = createTestRouter();
      const response = await router.handle("POST", "/users", {
        input: { name: "X", email: "not-an-email" },
        query: {},
        headers: {},
      });

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("middleware", () => {
    it("executes global middleware", async () => {
      const logs: string[] = [];
      const router = new Router()
        .use(async (ctx, next) => {
          logs.push("before");
          const result = await next();
          logs.push("after");
          return result;
        })
        .define("ping", {
          method: "GET",
          path: "/ping",
          input: z.object({}),
          output: z.object({ pong: z.boolean() }),
        }, async () => ({ pong: true }));

      await router.handle("GET", "/ping", { input: {}, query: {}, headers: {} });
      expect(logs).toEqual(["before", "after"]);
    });
  });

  describe("schema", () => {
    it("returns route definitions via getSchema", () => {
      const router = createTestRouter();
      const schema = router.getSchema();
      expect(Object.keys(schema)).toContain("getUser");
      expect(Object.keys(schema)).toContain("listUsers");
      expect(schema.getUser.method).toBe("GET");
    });

    it("exposes routes via getRoutes", () => {
      const router = createTestRouter();
      const routes = router.getRoutes();
      expect(routes.size).toBe(3);
    });
  });
});
