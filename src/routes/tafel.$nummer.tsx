import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, Check, ChefHat, Minus, Plus, Receipt, ShoppingBag, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { allergenInfo, cartTotal, euro, STATUS_LABEL, type CartLine } from "@/lib/menu";

export const Route = createFileRoute("/tafel/$nummer")({
  head: ({ params }) => ({
    meta: [
      { title: `Tafel ${params.nummer} – Bistro De Houder` },
      { name: "description", content: "Bekijk het menu en bestel rechtstreeks vanaf je gsm." },
      { property: "og:title", content: `Bestellen aan tafel ${params.nummer} – Bistro De Houder` },
      { property: "og:description", content: "Scan, kies en bestel. Je bestelling gaat meteen naar de keuken." },
    ],
  }),
  component: TablePage,
});

type Dish = { id: string; category_id: string; name: string; description: string; price: number; allergens: string[]; image_url: string | null };

function TablePage() {
  const { nummer } = Route.useParams();
  const table = Number(nummer);
  const qc = useQueryClient();

  const { data: menu } = useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const [s, c, d] = await Promise.all([
        supabase.from("settings").select("*").eq("id", 1).single(),
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("dishes").select("*").eq("available", true).order("sort_order"),
      ]);
      return { settings: s.data, categories: c.data ?? [], dishes: (d.data ?? []) as Dish[] };
    },
  });

  // Realtime: niet-beschikbare gerechten verdwijnen meteen
  useEffect(() => {
    const ch = supabase.channel("menu-live").on("postgres_changes", { event: "*", schema: "public", table: "dishes" }, () => qc.invalidateQueries({ queryKey: ["menu"] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [picked, setPicked] = useState<Dish | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const storageKey = `bestelling-tafel-${table}`;

  useEffect(() => { setOrderId(localStorage.getItem(storageKey)); }, [storageKey]);

  // drop cart lines whose dish disappeared
  useEffect(() => {
    if (!menu) return;
    const ids = new Set(menu.dishes.map((d) => d.id));
    setCart((c) => c.filter((l) => ids.has(l.dishId)));
  }, [menu]);

  const valid = Number.isInteger(table) && table >= 1 && (!menu?.settings || table <= menu.settings.table_count);
  const total = cartTotal(cart);
  const count = cart.reduce((s, l) => s + l.quantity, 0);

  async function sendRequest(type: "ober" | "rekening") {
    const { error } = await supabase.from("table_requests").insert({ table_number: table, type });
    if (error) toast.error("Melding versturen lukte niet.");
    else toast.success(type === "ober" ? "De ober komt eraan!" : "De rekening wordt gebracht.");
  }

  async function placeOrder() {
    const { data, error } = await supabase.rpc("place_order", {
      _table: table,
      _items: cart.map((l) => ({ dish_id: l.dishId, quantity: l.quantity, note: l.note })),
    });
    if (error || !data) { toast.error("Bestellen lukte niet. Probeer opnieuw."); return; }
    localStorage.setItem(storageKey, data);
    setOrderId(data);
    setCart([]);
    setCartOpen(false);
  }

  if (menu && !valid) {
    return <main className="flex min-h-screen items-center justify-center p-6 text-center"><div><h1 className="text-3xl font-semibold">Onbekende tafel</h1><p className="mt-2 text-muted-foreground">Scan de QR-code op je tafel opnieuw.</p></div></main>;
  }

  if (orderId) {
    return <OrderStatus orderId={orderId} table={table} name={menu?.settings?.restaurant_name} onNew={() => { localStorage.removeItem(storageKey); setOrderId(null); }} onRequest={sendRequest} />;
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl pb-36">
      <header className="bg-oak-gradient px-5 pb-6 pt-8 text-oak-foreground">
        <p className="text-sm font-medium opacity-90">Welkom bij</p>
        <h1 className="text-3xl font-semibold">{menu?.settings?.restaurant_name ?? "Bistro De Houder"}</h1>
        <div className="mt-3 inline-flex rounded-full bg-card px-3 py-1 text-sm font-semibold text-foreground">Tafel {table}</div>
      </header>

      <div className="flex gap-2 px-5 py-4">
        <Button variant="outline" className="flex-1 rounded-full" onClick={() => sendRequest("ober")}><Bell className="h-4 w-4" /> Ober roepen</Button>
        <Button variant="outline" className="flex-1 rounded-full" onClick={() => sendRequest("rekening")}><Receipt className="h-4 w-4" /> Rekening vragen</Button>
      </div>

      <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b bg-background/95 px-5 py-3 backdrop-blur">
        {menu?.categories.map((c) => (
          <a key={c.id} href={`#cat-${c.id}`} onClick={() => setActiveCat(c.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${activeCat === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {c.name}
          </a>
        ))}
      </nav>

      {!menu && <p className="p-8 text-center text-muted-foreground">Menu laden…</p>}

      {menu?.categories.map((c) => {
        const dishes = menu.dishes.filter((d) => d.category_id === c.id);
        if (!dishes.length) return null;
        return (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-16 px-5 pt-6">
            <h2 className="mb-3 text-2xl font-semibold">{c.name}</h2>
            <div className="space-y-3">
              {dishes.map((d) => {
                const inCart = cart.filter((l) => l.dishId === d.id).reduce((s, l) => s + l.quantity, 0);
                return (
                  <button key={d.id} onClick={() => setPicked(d)} className="flex w-full gap-4 rounded-2xl border bg-card p-4 text-left shadow-soft transition active:scale-[0.99]">
                    {d.image_url && <img src={d.image_url} alt={d.name} className="h-20 w-20 shrink-0 rounded-xl object-cover" loading="lazy" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-sans text-base font-semibold">{d.name}</h3>
                        <span className="shrink-0 font-semibold text-primary">{euro(d.price)}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {d.allergens.map((a) => {
                          const info = allergenInfo(a);
                          return <span key={a} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{info.icon} {info.label}</span>;
                        })}
                        {inCart > 0 && <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">{inCart} in mandje</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <AddDialog dish={picked} onClose={() => setPicked(null)} onAdd={(q, note) => {
        if (!picked) return;
        setCart((c) => {
          const i = c.findIndex((l) => l.dishId === picked.id && l.note === note);
          if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantity: l.quantity + q } : l));
          return [...c, { dishId: picked.id, name: picked.name, price: Number(picked.price), quantity: q, note }];
        });
        toast.success(`${picked.name} toegevoegd`);
        setPicked(null);
      }} />

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-xl p-4">
          <Button size="lg" className="h-14 w-full justify-between rounded-2xl text-base shadow-soft" onClick={() => setCartOpen(true)}>
            <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" /> Mandje ({count})</span>
            <span>{euro(total)}</span>
          </Button>
        </div>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[85vh] max-w-xl overflow-y-auto rounded-t-3xl">
          <SheetHeader><SheetTitle className="font-display text-2xl">Je bestelling</SheetTitle></SheetHeader>
          <div className="space-y-3 px-4">
            {cart.map((l, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{l.name}</p>
                  {l.note && <p className="text-sm italic text-muted-foreground">“{l.note}”</p>}
                  <p className="text-sm text-muted-foreground">{euro(l.price * l.quantity)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="rounded-full" aria-label="Minder" onClick={() => setCart((c) => c.flatMap((x, j) => (j === i ? (x.quantity > 1 ? [{ ...x, quantity: x.quantity - 1 }] : []) : [x])))}><Minus className="h-4 w-4" /></Button>
                  <span className="w-6 text-center font-semibold">{l.quantity}</span>
                  <Button size="icon" variant="outline" className="rounded-full" aria-label="Meer" onClick={() => setCart((c) => c.map((x, j) => (j === i ? { ...x, quantity: Math.min(50, x.quantity + 1) } : x)))}><Plus className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3 p-4">
            <div className="flex justify-between text-lg font-semibold"><span>Totaal</span><span>{euro(total)}</span></div>
            <Button size="lg" className="h-14 w-full rounded-2xl text-base" disabled={!count} onClick={placeOrder}>Bestelling plaatsen</Button>
            <p className="text-center text-xs text-muted-foreground">Je betaalt na de maaltijd. Dit is een demo.</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AddDialog({ dish, onClose, onAdd }: { dish: Dish | null; onClose: () => void; onAdd: (q: number, note: string) => void }) {
  const [q, setQ] = useState(1);
  const [note, setNote] = useState("");
  useEffect(() => { setQ(1); setNote(""); }, [dish?.id]);
  return (
    <Sheet open={!!dish} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-w-xl rounded-t-3xl">
        {dish && (
          <div className="space-y-4 p-4">
            {dish.image_url && <img src={dish.image_url} alt={dish.name} className="h-44 w-full rounded-2xl object-cover" />}
            <SheetHeader className="p-0"><SheetTitle className="font-display text-2xl">{dish.name}</SheetTitle></SheetHeader>
            <p className="text-muted-foreground">{dish.description}</p>
            <div className="flex flex-wrap gap-1">
              {dish.allergens.map((a) => { const i = allergenInfo(a); return <span key={a} className="rounded-full bg-muted px-2 py-0.5 text-xs">{i.icon} {i.label}</span>; })}
            </div>
            <Textarea placeholder="Opmerking (bv. zonder ui)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border p-1">
                <Button size="icon" variant="ghost" className="rounded-full" aria-label="Minder" onClick={() => setQ(Math.max(1, q - 1))}><Minus className="h-4 w-4" /></Button>
                <span className="w-6 text-center text-lg font-semibold">{q}</span>
                <Button size="icon" variant="ghost" className="rounded-full" aria-label="Meer" onClick={() => setQ(Math.min(50, q + 1))}><Plus className="h-4 w-4" /></Button>
              </div>
              <Button size="lg" className="h-12 flex-1 rounded-full" onClick={() => onAdd(q, note.trim())}>
                Toevoegen · {euro(Number(dish.price) * q)}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function OrderStatus({ orderId, table, name, onNew, onRequest }: { orderId: string; table: number; name?: string | undefined; onNew: () => void; onRequest: (t: "ober" | "rekening") => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle();
      return data;
    },
  });
  useEffect(() => {
    const ch = supabase.channel(`order-${orderId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, () => qc.invalidateQueries({ queryKey: ["order", orderId] })).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId, qc]);

  const prev = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prev.current && data?.status && prev.current !== data.status && data.status === "klaar") toast.success("Je bestelling is klaar!");
    prev.current = data?.status;
  }, [data?.status]);

  const steps = ["ontvangen", "in_bereiding", "klaar"];
  const idx = data ? steps.indexOf(data.status) : 0;
  const icons = [Check, ChefHat, Bell];

  return (
    <div className="mx-auto min-h-screen max-w-xl px-5 py-8">
      <p className="text-sm text-muted-foreground">{name ?? "Bistro De Houder"} · Tafel {table}</p>
      <h1 className="mt-1 text-3xl font-semibold">Bedankt voor je bestelling!</h1>
      <div className="mt-8 rounded-3xl border bg-card p-6 shadow-soft">
        <div className="space-y-5">
          {steps.map((s, i) => {
            const Icon = icons[i]!;
            const done = i <= idx;
            return (
              <div key={s} className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full transition ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"} ${i === idx ? "ring-4 ring-accent" : ""}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className={`text-lg font-semibold ${done ? "" : "text-muted-foreground"}`}>{STATUS_LABEL[s]}</p>
                  {i === idx && <p className="text-sm text-muted-foreground">{s === "klaar" ? "Je bestelling wordt zo gebracht." : s === "in_bereiding" ? "De keuken is ermee bezig." : "De keuken heeft je bestelling."}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {data && (
        <div className="mt-6 rounded-3xl border bg-card p-6">
          {data.order_items.map((it) => (
            <div key={it.id} className="flex justify-between py-1">
              <span>{it.quantity}× {it.dish_name}{it.note && <span className="text-sm italic text-muted-foreground"> – {it.note}</span>}</span>
              <span>{euro(Number(it.unit_price) * it.quantity)}</span>
            </div>
          ))}
          <div className="mt-3 flex justify-between border-t pt-3 font-semibold"><span>Totaal</span><span>{euro(data.total)}</span></div>
        </div>
      )}
      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button variant="outline" className="rounded-full" onClick={() => onRequest("ober")}><Bell className="h-4 w-4" /> Ober roepen</Button>
        <Button variant="outline" className="rounded-full" onClick={() => onRequest("rekening")}><Receipt className="h-4 w-4" /> Rekening vragen</Button>
      </div>
      <Button className="mt-3 h-12 w-full rounded-full" onClick={onNew}><X className="h-4 w-4" /> Nog iets bestellen</Button>
    </div>
  );
}
