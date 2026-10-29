import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "@/lib/access";

describe("company email access", () => {
  it("allows @inflooo.com", () => expect(isAllowedEmail("a@inflooo.com")).toBe(true));
  it("allows @makeitviral.com", () => expect(isAllowedEmail("B@MakeItViral.com")).toBe(true));
  it("rejects other domains", () => expect(isAllowedEmail("a@gmail.com")).toBe(false));
  it("rejects lookalike domains", () => expect(isAllowedEmail("a@inflooo.com.evil.io")).toBe(false));
});
