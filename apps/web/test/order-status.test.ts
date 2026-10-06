import { describe, expect, it } from "vitest";
import { HOLDS_STOCK, canTransition, nextStatuses, statusLabel } from "@/server/orders/status";

describe("order state machine", () => {
  it("follows the happy path", () => {
    const path = ["SUBMITTED", "CONFIRMED", "PROCESSING", "READY", "DISPATCHED", "COMPLETED"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it("can't skip steps or go backwards", () => {
    expect(canTransition("SUBMITTED", "DISPATCHED")).toBe(false);
    expect(canTransition("READY", "PROCESSING")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
  });
  it("can't cancel after dispatch", () => {
    expect(canTransition("DISPATCHED", "CANCELLED")).toBe(false);
    expect(canTransition("PARTIALLY_FULFILLED", "CANCELLED")).toBe(false);
  });
  it("holds and resumes", () => {
    expect(canTransition("PROCESSING", "ON_HOLD")).toBe(true);
    expect(nextStatuses("ON_HOLD")).toContain("PROCESSING");
  });
  it("labels every status and terminal states have no exits", () => {
    expect(Object.keys(statusLabel)).toHaveLength(12);
    expect(nextStatuses("CANCELLED")).toEqual([]);
    expect(HOLDS_STOCK).not.toContain("DISPATCHED");
  });
});
