import { describe, expect, it } from "vitest";
import { parseBusinessTime, toBusinessInput } from "@/lib/time";

describe("business time (Fiji)", () => {
  it("parses form values as Fiji local time", () => {
    expect(parseBusinessTime("2026-10-06T09:30")?.toISOString()).toBe("2026-10-05T21:30:00.000Z");
    expect(parseBusinessTime("2026-10-06")?.toISOString()).toBe("2026-10-05T12:00:00.000Z");
    expect(parseBusinessTime("2026-10-06", { endOfDay: true })?.toISOString()).toBe("2026-10-06T11:59:59.999Z");
  });
  it("rejects junk", () => {
    expect(parseBusinessTime("06/10/2026")).toBeNull();
    expect(parseBusinessTime("")).toBeNull();
  });
  it("round-trips through input formatting", () => {
    const d = new Date("2026-10-05T21:30:00Z");
    expect(toBusinessInput(d)).toBe("2026-10-06T09:30");
    expect(toBusinessInput(d, true)).toBe("2026-10-06");
    expect(toBusinessInput(null)).toBe("");
  });
});
