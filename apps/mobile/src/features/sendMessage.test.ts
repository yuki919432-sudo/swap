import { describe, it, expect } from "vitest";
import { assessMessage } from "./sendMessage";

const CONV = "11111111-1111-1111-1111-111111111111";
const uni = { institutionType: "university" as const };

describe("assessMessage (local moderation before send)", () => {
  it("allows an ordinary message", () => {
    const a = assessMessage(CONV, "Is the lamp still available?", uni);
    expect(a.moderation.outcome).toBe("allow");
    expect(a.canSend).toBe(true);
  });

  it("blocks a message that trips a universal prohibition and never marks it sendable", () => {
    const a = assessMessage(CONV, "want to buy a handgun off you", uni);
    expect(a.moderation.outcome).toBe("block");
    expect(a.canSend).toBe(false);
  });

  it("warns (and withholds) a message leaking contact info", () => {
    const a = assessMessage(CONV, "text me at 415 555 2671", uni);
    expect(a.moderation.outcome).toBe("warn");
    expect(a.canSend).toBe(false);
  });

  it("escalates a safety concern and withholds it", () => {
    const a = assessMessage(CONV, "[[severe_threat_test]]", uni);
    expect(a.moderation.outcome).toBe("escalate");
    expect(a.canSend).toBe(false);
  });

  it("rejects an empty message as invalid", () => {
    const a = assessMessage(CONV, "   ", uni);
    expect(a.canSend).toBe(false);
  });
});
