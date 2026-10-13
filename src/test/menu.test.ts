import { describe, expect, it } from "vitest";
import {
  addToCart,
  billLines,
  billTotal,
  dayStats,
  minutesSince,
  orderErrorMessage,
  parseBill,
  pruneCart,
  type CartLine,
} from "@/lib/menu";
import { randomOrder } from "@/lib/demo";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  dishId: "a",
  name: "Stoofvlees",
  price: 22.5,
  quantity: 1,
  note: "",
  ...over,
});

describe("mandje", () => {
  it("telt hetzelfde gerecht met dezelfde opmerking samen, met maximum 50", () => {
    let cart = addToCart([], line());
    cart = addToCart(cart, line({ quantity: 2 }));
    expect(cart).toHaveLength(1);
    expect(cart[0]!.quantity).toBe(3);
    cart = addToCart(cart, line({ quantity: 60 }));
    expect(cart[0]!.quantity).toBe(50);
  });
  it("houdt een andere opmerking apart", () => {
    const cart = addToCart(addToCart([], line()), line({ note: "zonder ui" }));
    expect(cart).toHaveLength(2);
  });
  it("haalt uitverkochte gerechten weg en meldt welke", () => {
    const { kept, removed } = pruneCart(
      [
        line(),
        line({ dishId: "b", name: "Wafel" }),
        line({ dishId: "b", name: "Wafel", note: "x" }),
      ],
      new Set(["a"]),
    );
    expect(kept.map((l) => l.dishId)).toEqual(["a"]);
    expect(removed).toEqual(["Wafel"]);
  });
});

describe("rekening", () => {
  const bill = parseBill([
    {
      id: "1",
      status: "klaar",
      total: "36.00",
      created_at: "2026-10-13T18:00:00Z",
      items: [
        { id: "i1", dish_name: "Mosselen", unit_price: "27.00", quantity: 1, note: null },
        { id: "i2", dish_name: "Spa Rood", unit_price: "4.50", quantity: 2, note: null },
      ],
    },
    {
      id: "2",
      status: "geannuleerd",
      total: "9.00",
      created_at: "2026-10-13T18:10:00Z",
      items: [{ id: "i3", dish_name: "Spa Rood", unit_price: "4.50", quantity: 2, note: null }],
    },
    {
      id: "3",
      status: "ontvangen",
      total: "4.50",
      created_at: "2026-10-13T18:20:00Z",
      items: [{ id: "i4", dish_name: "Spa Rood", unit_price: "4.50", quantity: 1, note: "koud" }],
    },
  ]);
  it("rekent geannuleerde bestellingen niet mee", () => {
    expect(billTotal(bill)).toBe(40.5);
  });
  it("voegt dezelfde gerechten samen over rondes heen", () => {
    expect(billLines(bill)).toEqual([
      { name: "Mosselen", unit: 27, quantity: 1 },
      { name: "Spa Rood", unit: 4.5, quantity: 3 },
    ]);
  });
  it("geeft een lege lijst bij onverwachte data", () => {
    expect(parseBill(null)).toEqual([]);
  });
});

describe("statistieken", () => {
  it("berekent omzet, gemiddelde, bereidingstijd en toppers", () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 13, h, m).toISOString();
    const s = dayStats([
      {
        status: "klaar",
        total: 30,
        created_at: at(18),
        ready_at: at(18, 10),
        order_items: [
          { dish_name: "Stoofvlees", quantity: 1, unit_price: 22.5 },
          { dish_name: "Tripel", quantity: 1, unit_price: 7.5 },
        ],
      },
      {
        status: "klaar",
        total: 45,
        created_at: at(20),
        ready_at: at(20, 20),
        order_items: [{ dish_name: "Stoofvlees", quantity: 2, unit_price: 22.5 }],
      },
      {
        status: "geannuleerd",
        total: 99,
        created_at: at(19),
        order_items: [{ dish_name: "Kreeft", quantity: 1, unit_price: 99 }],
      },
    ]);
    expect(s.revenue).toBe(75);
    expect(s.count).toBe(2);
    expect(s.cancelled).toBe(1);
    expect(s.average).toBe(37.5);
    expect(s.avgPrepMinutes).toBe(15);
    expect(s.perHour.map((h) => h.hour)).toEqual([18, 19, 20]);
    expect(s.perHour[1]!.revenue).toBe(0);
    expect(s.topDishes[0]).toEqual({ name: "Stoofvlees", quantity: 3, revenue: 67.5 });
  });
});

describe("hulpfuncties", () => {
  it("minuten sinds een tijdstip, nooit negatief", () => {
    const now = Date.parse("2026-10-13T18:30:00Z");
    expect(minutesSince("2026-10-13T18:12:30Z", now)).toBe(17);
    expect(minutesSince("2026-10-13T19:00:00Z", now)).toBe(0);
  });
  it("vertaalt databasefouten naar gewone taal", () => {
    expect(orderErrorMessage("Bestellen is momenteel gesloten")).toMatch(/geen bestellingen/);
    expect(orderErrorMessage("Gerecht niet beschikbaar")).toMatch(/uitverkocht/);
    expect(orderErrorMessage(undefined)).toMatch(/Probeer opnieuw/);
  });
  it("demo-bestellingen bevatten altijd iets en geldige aantallen", () => {
    const cats = [
      { id: "h", name: "Hoofdgerechten" },
      { id: "d", name: "Dranken" },
      { id: "x", name: "Desserts" },
    ];
    const dishes = [
      { id: "1", name: "A", category_id: "h" },
      { id: "2", name: "B", category_id: "d" },
      { id: "3", name: "C", category_id: "x" },
    ];
    for (let i = 0; i < 50; i++) {
      const o = randomOrder(dishes, cats);
      expect(o.length).toBeGreaterThan(0);
      for (const l of o) expect(l.quantity).toBeGreaterThanOrEqual(1);
    }
  });
});
