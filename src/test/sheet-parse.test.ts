import { describe, expect, it } from "vitest";
import { parseSheetDate, parseSheetRows } from "@/lib/sheet-parse";

const header = ["Created Time", "Are You a", "monthly marketing budget", "where is your brand based", "Full Name", "Phone Number", "SaleUp Lead ID", "CRM Status"];

describe("sheet parsing", () => {
  it("reads MM-DD-YY dates", () => {
    expect(parseSheetDate("10-20-26")).toBe("2026-10-20");
  });
  it("drops duplicate lead IDs so repeated syncs don't double-import", () => {
    const rows = parseSheetRows([
      header,
      ["10-20-26", "brand", "under_₹25,000", "Hyd", "A", "91", "SL-1", "New Lead"],
      ["10-20-26", "brand", "under_₹25,000", "Hyd", "A", "91", "SL-1", "New Lead"],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].budget).toBe("under ₹25,000");
  });
});
