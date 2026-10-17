import { supabase } from "@/integrations/supabase/client";

type DemoDish = { id: string; name: string; category_id: string };

const NOTES = [
  "",
  "",
  "",
  "",
  "zonder ui",
  "saus apart",
  "goed doorbakken",
  "extra mayonaise",
  "glutenvrij indien mogelijk",
  "kindportie",
];
const pickOne = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

/** Stelt een geloofwaardige bestelling samen: een hoofdgerecht, soms een voorgerecht/dessert, en drankjes. */
export function randomOrder(dishes: DemoDish[], categories: { id: string; name: string }[]) {
  const byCat = (re: RegExp) => {
    const ids = new Set(categories.filter((c) => re.test(c.name)).map((c) => c.id));
    return dishes.filter((d) => ids.has(d.category_id));
  };
  const mains = byCat(/hoofd/i),
    starters = byCat(/voor/i),
    desserts = byCat(/dessert/i),
    drinks = byCat(/drank/i);
  const pool = dishes.length ? dishes : [];
  const people = 1 + Math.floor(Math.random() * 4);
  const lines = new Map<string, { dish_id: string; quantity: number; note: string }>();
  const add = (d: DemoDish | undefined, q = 1, note = "") => {
    if (!d) return;
    const key = `${d.id}|${note}`;
    const cur = lines.get(key);
    lines.set(key, { dish_id: d.id, quantity: Math.min(50, (cur?.quantity ?? 0) + q), note });
  };
  const roll = Math.random();
  if (roll < 0.2 && desserts.length) {
    for (let i = 0; i < people; i++) add(pickOne(desserts));
  } else {
    if (starters.length && Math.random() < 0.4) add(pickOne(starters), Math.max(1, people - 1));
    for (let i = 0; i < people; i++) add(pickOne(mains.length ? mains : pool), 1, pickOne(NOTES));
  }
  if (drinks.length) add(pickOne(drinks), people);
  return [...lines.values()];
}

/**
 * Simuleert een drukke avond: plaatst `count` bestellingen aan willekeurige tafels,
 * met een pauze ertussen zodat je ze live op het keukenscherm ziet binnenkomen.
 */
export async function simulateRush({
  count = 6,
  delayMs = 2500,
  onProgress,
}: { count?: number; delayMs?: number; onProgress?: (done: number) => void } = {}) {
  const [{ data: settings }, { data: dishes }, { data: categories }] = await Promise.all([
    supabase.from("settings").select("table_count, ordering_open").eq("id", 1).single(),
    supabase.from("dishes").select("id, name, category_id").eq("available", true),
    supabase.from("categories").select("id, name"),
  ]);
  if (!settings || !dishes?.length || !categories)
    throw new Error("Geen menu gevonden om te bestellen.");
  if (!settings.ordering_open) throw new Error("Bestellen is gepauzeerd. Zet het eerst weer open.");
  let done = 0;
  for (let i = 0; i < count; i++) {
    const table = 1 + Math.floor(Math.random() * settings.table_count);
    const { error } = await supabase.rpc("place_order", {
      _table: table,
      _items: randomOrder(dishes, categories),
    });
    if (error) throw new Error(error.message);
    if (Math.random() < 0.25)
      await supabase.rpc("request_service", {
        _table: 1 + Math.floor(Math.random() * settings.table_count),
        _type: Math.random() < 0.5 ? "ober" : "rekening",
      });
    onProgress?.(++done);
    if (i < count - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return done;
}

/** Verwijdert alle bestellingen, betalingen en tafelmeldingen van vandaag en zet bestellen weer open. */
export async function resetDemo() {
  const { error } = await supabase.rpc("reset_demo");
  if (error) throw new Error("Opruimen mislukt");
}
