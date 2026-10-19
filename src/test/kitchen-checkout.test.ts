import { describe, expect, it } from "vitest";
import { isKitchenOpenOrder } from "@/lib/menu";

describe("afrekenen in de keuken", () => {
  it("verwijdert afgerekende bestellingen uit de bewerkbare keukenlijst", () => {
    for (const status of ["ontvangen", "in_bereiding"]) {
      expect(isKitchenOpenOrder({ status, paid_at: null })).toBe(true);
      expect(isKitchenOpenOrder({ status, paid_at: "2026-10-19T06:00:00Z" })).toBe(false);
    }
    expect(isKitchenOpenOrder({ status: "klaar", paid_at: null })).toBe(false);
    expect(isKitchenOpenOrder({ status: "geannuleerd", paid_at: null })).toBe(false);
  });
});