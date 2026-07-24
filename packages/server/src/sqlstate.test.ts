import { describe, it, expect } from "vitest";
import { mapPostgresError } from "./sqlstate.js";

describe("mapPostgresError", () => {
  it("maps deadlock/serialization to retryable transient", () => {
    expect(mapPostgresError({ code: "40P01" })).toMatchObject({ code: "transient", retryable: true });
    expect(mapPostgresError({ code: "40001" })).toMatchObject({ code: "transient", retryable: true });
  });

  it("maps a reservation unique-violation to a terminal conflict (not retryable)", () => {
    const e = mapPostgresError({ code: "23505", constraint: "one_active_reservation_per_listing" });
    expect(e.code).toBe("conflict");
    expect(e.message).toBe("listing_already_reserved");
    expect(e.retryable).toBe(false);
  });

  it("maps a generic unique-violation to a conflict", () => {
    expect(mapPostgresError({ code: "23505", message: "duplicate key" })).toMatchObject({
      code: "conflict",
      message: "unique_violation",
      retryable: false,
    });
  });

  it("maps RLS/privilege denial to forbidden", () => {
    expect(mapPostgresError({ code: "42501" })).toMatchObject({ code: "forbidden" });
  });

  it("maps known raised messages (P0001) to typed errors", () => {
    expect(mapPostgresError({ code: "P0001", message: "not_authorized" })).toMatchObject({ code: "forbidden" });
    expect(mapPostgresError({ code: "P0001", message: "not_a_member" })).toMatchObject({
      code: "membership_required",
    });
    expect(mapPostgresError({ code: "P0001", message: "invalid_or_exhausted_invitation" })).toMatchObject({
      code: "invitation_invalid",
    });
    expect(mapPostgresError({ code: "P0001", message: "listing_already_reserved:abc" })).toMatchObject({
      code: "conflict",
      message: "listing_already_reserved",
    });
  });

  it("maps membership state + input errors to stable typed codes", () => {
    expect(mapPostgresError({ code: "P0001", message: "membership_suspended" })).toMatchObject({
      code: "membership_suspended",
    });
    expect(mapPostgresError({ code: "P0001", message: "membership_rejected" })).toMatchObject({
      code: "membership_rejected",
    });
    expect(mapPostgresError({ code: "P0001", message: "invalid_input:explanation" })).toMatchObject({
      code: "validation_failed",
    });
    expect(mapPostgresError({ code: "P0001", message: "method_not_enabled" })).toMatchObject({
      code: "forbidden",
      message: "verification_method_not_enabled",
    });
  });

  it("maps unknown raised messages to a conflict, and unknown SQLSTATE to internal", () => {
    expect(mapPostgresError({ code: "P0001", message: "some_new_rule" })).toMatchObject({ code: "conflict" });
    expect(mapPostgresError({ code: "XX000" })).toMatchObject({ code: "internal" });
  });
});
