export const ALLERGENS: { key: string; label: string; icon: string }[] = [
  { key: "gluten", label: "Gluten", icon: "🌾" },
  { key: "schaaldieren", label: "Schaaldieren", icon: "🦐" },
  { key: "eieren", label: "Eieren", icon: "🥚" },
  { key: "vis", label: "Vis", icon: "🐟" },
  { key: "pinda", label: "Pinda's", icon: "🥜" },
  { key: "soja", label: "Soja", icon: "🫘" },
  { key: "melk", label: "Melk", icon: "🥛" },
  { key: "noten", label: "Noten", icon: "🌰" },
  { key: "selderij", label: "Selderij", icon: "🥬" },
  { key: "mosterd", label: "Mosterd", icon: "🟡" },
  { key: "sesam", label: "Sesam", icon: "⚪" },
  { key: "sulfiet", label: "Sulfiet", icon: "🍷" },
  { key: "lupine", label: "Lupine", icon: "🌼" },
  { key: "weekdieren", label: "Weekdieren", icon: "🐚" },
];

export const allergenInfo = (key: string) =>
  ALLERGENS.find((a) => a.key === key) ?? { key, label: key, icon: "•" };

export const euro = (n: number | string) =>
  new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(Number(n));

export type OrderStatus = "ontvangen" | "in_bereiding" | "klaar" | "geannuleerd";

export const STATUS_LABEL: Record<string, string> = {
  ontvangen: "Ontvangen",
  in_bereiding: "In bereiding",
  klaar: "Klaar",
  geannuleerd: "Geannuleerd",
};

export const tijd = (iso: string) =>
  new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });

/** Hele minuten tussen een tijdstip en nu (nooit negatief). */
export const minutesSince = (iso: string, now: number = Date.now()) =>
  Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));

export const duurLabel = (min: number) =>
  min < 1 ? "net binnen" : min < 60 ? `${min} min` : `${Math.floor(min / 60)} u ${min % 60} min`;

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export type CartLine = {
  dishId: string;
  name: string;
  price: number;
  quantity: number;
  note: string;
};

export const cartTotal = (lines: CartLine[]) =>
  Math.round(lines.reduce((s, l) => s + l.price * l.quantity, 0) * 100) / 100;

/** Voegt een regel toe aan het mandje; zelfde gerecht met dezelfde opmerking wordt samengeteld (max 50). */
export function addToCart(cart: CartLine[], line: CartLine): CartLine[] {
  const i = cart.findIndex((l) => l.dishId === line.dishId && l.note === line.note);
  if (i < 0) return [...cart, { ...line, quantity: Math.min(50, line.quantity) }];
  return cart.map((l, j) =>
    j === i ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l,
  );
}

/** Houdt enkel regels over waarvan het gerecht nog beschikbaar is; geeft ook de namen van wat wegviel terug. */
export function pruneCart(cart: CartLine[], availableIds: Set<string>) {
  const kept = cart.filter((l) => availableIds.has(l.dishId));
  const removed = [...new Set(cart.filter((l) => !availableIds.has(l.dishId)).map((l) => l.name))];
  return { kept, removed };
}

// ---------- Lopende rekening van een tafel (resultaat van de RPC table_bill) ----------

export type BillItem = {
  id: string;
  dish_name: string;
  unit_price: number;
  quantity: number;
  note: string | null;
};
export type BillOrder = {
  id: string;
  status: OrderStatus;
  total: number;
  created_at: string;
  items: BillItem[];
};

export function parseBill(json: unknown): BillOrder[] {
  if (!Array.isArray(json)) return [];
  return json.map((o) => ({
    ...o,
    total: Number(o.total),
    items: (o.items ?? []).map((i: BillItem) => ({ ...i, unit_price: Number(i.unit_price) })),
  }));
}

/** Totaal van de tafel, zonder geannuleerde bestellingen. */
export const billTotal = (orders: { status: string; total: number | string }[]) =>
  Math.round(
    orders.filter((o) => o.status !== "geannuleerd").reduce((s, o) => s + Number(o.total), 0) * 100,
  ) / 100;

/** Alle gerechten van de tafel samengevoegd per naam + prijs, voor een overzichtelijke rekening. */
export function billLines(orders: BillOrder[]) {
  const map = new Map<string, { name: string; unit: number; quantity: number }>();
  for (const o of orders) {
    if (o.status === "geannuleerd") continue;
    for (const i of o.items) {
      const key = `${i.dish_name}|${i.unit_price}`;
      const cur = map.get(key) ?? { name: i.dish_name, unit: i.unit_price, quantity: 0 };
      cur.quantity += i.quantity;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
}

// ---------- Statistieken ----------

type StatOrder = {
  status: string;
  total: number | string;
  created_at: string;
  ready_at?: string | null;
  order_items: { dish_name: string; quantity: number; unit_price: number | string }[];
};

export function dayStats(orders: StatOrder[]) {
  const valid = orders.filter((o) => o.status !== "geannuleerd");
  const revenue = billTotal(valid);
  const perHour = new Map<number, number>();
  const dishes = new Map<string, { name: string; quantity: number; revenue: number }>();
  const prep: number[] = [];
  for (const o of valid) {
    const h = new Date(o.created_at).getHours();
    perHour.set(h, (perHour.get(h) ?? 0) + Number(o.total));
    if (o.ready_at)
      prep.push((new Date(o.ready_at).getTime() - new Date(o.created_at).getTime()) / 60_000);
    for (const i of o.order_items) {
      const d = dishes.get(i.dish_name) ?? { name: i.dish_name, quantity: 0, revenue: 0 };
      d.quantity += i.quantity;
      d.revenue += i.quantity * Number(i.unit_price);
      dishes.set(i.dish_name, d);
    }
  }
  const hours = [...perHour.keys()];
  const from = hours.length ? Math.min(...hours) : 0;
  const to = hours.length ? Math.max(...hours) : -1;
  return {
    count: valid.length,
    cancelled: orders.length - valid.length,
    revenue,
    average: valid.length ? Math.round((revenue / valid.length) * 100) / 100 : 0,
    avgPrepMinutes: prep.length ? Math.round(prep.reduce((a, b) => a + b, 0) / prep.length) : null,
    perHour: Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => ({
      hour: from + k,
      revenue: Math.round((perHour.get(from + k) ?? 0) * 100) / 100,
    })),
    topDishes: [...dishes.values()].sort(
      (a, b) => b.quantity - a.quantity || b.revenue - a.revenue,
    ),
  };
}

// ---------- Veilige browseropslag (kan ontbreken of falen in privévensters) ----------

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStore(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* opslag niet beschikbaar: geen probleem, de app werkt verder */
  }
}

/** Vertaalt databasefouten naar begrijpelijke tekst voor gasten. */
export function orderErrorMessage(message: string | undefined) {
  if (!message) return "Bestellen lukte niet. Probeer opnieuw.";
  if (/gesloten/i.test(message)) return "De keuken neemt momenteel geen bestellingen aan.";
  if (/niet beschikbaar/i.test(message))
    return "Een gerecht in je mandje is net uitverkocht. Kijk je mandje even na.";
  if (/te veel bestellingen/i.test(message))
    return "Je tafel heeft net veel bestellingen geplaatst. Wacht even of roep de ober.";
  if (/ongeldig aantal|te veel regels/i.test(message))
    return "Je mandje is te groot. Verdeel je bestelling of vraag de ober.";
  if (/ongeldige tafel/i.test(message)) return "Deze tafel bestaat niet. Scan de QR-code opnieuw.";
  return "Bestellen lukte niet. Probeer opnieuw.";
}
