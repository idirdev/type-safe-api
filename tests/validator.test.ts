import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Validator, ValidationError } from "../src/Validator";

describe("Validator", () => {
  const validator = new Validator();

  describe("validate", () => {
    it("validates a correct object", () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const result = validator.validate(schema, { name: "Alice", age: 30 });
      expect(result).toEqual({ name: "Alice", age: 30 });
    });

    it("throws ValidationError for invalid data", () => {
      const schema = z.object({ email: z.string().email() });
      expect(() => validator.validate(schema, { email: "nope" })).toThrow(ValidationError);
    });

    it("includes field-level errors", () => {
      const schema = z.object({
        name: z.string().min(2),
        age: z.number().min(0),
      });

      try {
        validator.validate(schema, { name: "", age: -1 });
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const ve = err as ValidationError;
        expect(ve.fieldErrors).toHaveProperty("name");
        expect(ve.fieldErrors).toHaveProperty("age");
      }
    });

    it("validates nested objects", () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          address: z.object({ city: z.string() }),
        }),
      });

      const result = validator.validate(schema, {
        user: { name: "Bob", address: { city: "NYC" } },
      });
      expect(result.user.address.city).toBe("NYC");
    });

    it("validates arrays", () => {
      const schema = z.array(z.number());
      const result = validator.validate(schema, [1, 2, 3]);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe("type coercion", () => {
    it("coerces string numbers to numbers", () => {
      const v = new Validator({ coerce: true });
      const schema = z.object({ count: z.number() });
      const result = v.validate(schema, { count: "42" });
      expect(result.count).toBe(42);
    });

    it("coerces 'true'/'false' to booleans", () => {
      const v = new Validator({ coerce: true });
      const schema = z.object({ active: z.boolean() });
      const result = v.validate(schema, { active: "true" });
      expect(result.active).toBe(true);
    });

    it("coerces 'null' to null", () => {
      const v = new Validator({ coerce: true });
      const schema = z.object({ value: z.null() });
      const result = v.validate(schema, { value: "null" });
      expect(result.value).toBeNull();
    });

    it("does not coerce when disabled", () => {
      const v = new Validator({ coerce: false });
      const schema = z.object({ count: z.number() });
      expect(() => v.validate(schema, { count: "42" })).toThrow(ValidationError);
    });
  });

  describe("formatErrors", () => {
    it("formats validation errors as readable string", () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      try {
        validator.validate(schema, { name: 123, age: "not a number" });
      } catch (err) {
        const formatted = validator.formatErrors(err as ValidationError);
        expect(formatted).toContain("Validation errors:");
        expect(formatted).toContain("name");
      }
    });
  });

  describe("ValidationError.fromZodError", () => {
    it("converts ZodError into ValidationError with field map", () => {
      const schema = z.object({ email: z.string().email(), age: z.number().min(18) });
      const result = schema.safeParse({ email: "bad", age: 5 });

      if (!result.success) {
        const ve = ValidationError.fromZodError(result.error);
        expect(ve).toBeInstanceOf(ValidationError);
        expect(ve.fieldErrors).toHaveProperty("email");
        expect(ve.fieldErrors).toHaveProperty("age");
        expect(ve.message).toContain("Validation failed");
      }
    });
  });
});
