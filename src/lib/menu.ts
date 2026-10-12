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

export const STATUS_LABEL: Record<string, string> = {
  ontvangen: "Ontvangen",
  in_bereiding: "In bereiding",
  klaar: "Klaar",
};

export const tijd = (iso: string) =>
  new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });

export type CartLine = { dishId: string; name: string; price: number; quantity: number; note: string };

export const cartTotal = (lines: CartLine[]) =>
  Math.round(lines.reduce((s, l) => s + l.price * l.quantity, 0) * 100) / 100;
