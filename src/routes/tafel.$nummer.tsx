import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bell,
  Check,
  ChefHat,
  Clock,
  Minus,
  Plus,
  Receipt,
  ShieldAlert,
  ShoppingBag,
  Utensils,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSettings } from "@/lib/hooks";
import {
  ALLERGENS,
  addToCart,
  allergenInfo,
  billLines,
  billTotal,
  cartCount,
  cartTotal,
  euro,
  MAX_PER_LINE,
  MAX_PER_ORDER,
  orderErrorMessage,
  parseBill,
  pruneCart,
  readStore,
  STATUS_LABEL,
  tijd,
  writeStore,
  type BillOrder,
  type CartLine,
} from "@/lib/menu";

type TableSearch = { k?: string };

export const Route = createFileRoute("/tafel/$nummer")({
  // `k` is de geheime tafelcode uit de QR-code. Zonder geldige code kan een gast niet bestellen.
  validateSearch: (s: Record<string, unknown>): TableSearch =>
    typeof s["k"] === "string" && /^[a-z0-9]{1,64}$/i.test(s["k"]) ? { k: s["k"] } : {},
  head: ({ params }) => ({
    meta: [
      { title: `Tafel ${params.nummer} – Bistro De Houder` },
      { name: "description", content: "Bekijk het menu en bestel rechtstreeks vanaf je gsm." },
      { property: "og:title", content: `Bestellen aan tafel ${params.nummer} – Bistro De Houder` },
      {
        property: "og:description",
        content: "Scan, kies en bestel. Je bestelling gaat meteen naar de keuken.",
      },
    ],
  }),
  component: TablePage,
});

type Dish = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  allergens: string[];
  image_url: string | null;
};
type RequestType = "ober" | "rekening";
const REQUEST_COOLDOWN_MS = 60_000;

function TablePage() {
  const { nummer } = Route.useParams();
  const { k: code } = Route.useSearch();
  const codeArg = code ? { _code: code } : {};
  const table = Number(nummer);
  const qc = useQueryClient();
  const { data: settings } = useSettings();

  const { data: menu } = useQuery({
    queryKey: ["menu"],
    queryFn: async () => {
      const [c, d] = await Promise.all([
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("dishes").select("*").eq("available", true).order("sort_order"),
      ]);
      if (c.error) throw c.error;
      if (d.error) throw d.error;
      return { categories: c.data, dishes: d.data as Dish[] };
    },
    // Live-updates bereiken gasten niet wanneer een gerecht onzichtbaar wordt (uitverkocht),
    // dus het menu wordt ook regelmatig opnieuw opgehaald.
    refetchInterval: 30_000,
  });

  const valid =
    Number.isInteger(table) && table >= 1 && (!settings || table <= settings.table_count);
  const orderingOpen = settings?.ordering_open ?? true;
  const restaurant = settings?.restaurant_name ?? "Bistro De Houder";

  // Lopende rekening van deze tafel (alle gsm's aan tafel zien hetzelfde)
  // Gasten mogen de tabel met bestellingen niet lezen (dus ook geen live-updates ervan krijgen);
  // de status komt via `table_bill`, vaker opgehaald zolang er iets in de keuken is.
  const { data: bill = [], error: billError } = useQuery({
    queryKey: ["bill", table, code],
    enabled: valid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("table_bill", { _table: table, ...codeArg });
      if (error) throw new Error(error.message);
      return parseBill(data);
    },
    retry: (n, e) => !/tafelcode/i.test(e.message) && n < 3,
    refetchInterval: (q) => {
      if (q.state.error) return false;
      const open = (q.state.data ?? []).some(
        (o) => o.status === "ontvangen" || o.status === "in_bereiding",
      );
      return open ? 8_000 : 20_000;
    },
  });
  const [codeRejected, setCodeRejected] = useState(false);
  const badCode = codeRejected || /tafelcode/i.test(billError?.message ?? "");

  // Realtime: menu (een gerecht dat weer beschikbaar wordt, nieuwe categorieën)
  useEffect(() => {
    const ch = supabase
      .channel(`tafel-${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dishes" }, () =>
        qc.invalidateQueries({ queryKey: ["menu"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () =>
        qc.invalidateQueries({ queryKey: ["menu"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, table]);

  // Mandje en allergiefilter bewaren op dit toestel (overleeft herladen)
  const cartKey = `mandje-tafel-${table}`;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setCart(readStore<CartLine[]>(cartKey, []));
    setAvoid(readStore<string[]>("allergiefilter", []));
    setLoaded(true);
  }, [cartKey]);
  useEffect(() => {
    if (loaded) writeStore(cartKey, cart.length ? cart : null);
  }, [cart, cartKey, loaded]);
  useEffect(() => {
    if (loaded) writeStore("allergiefilter", avoid.length ? avoid : null);
  }, [avoid, loaded]);

  // Gerechten die intussen uitverkocht zijn uit het mandje halen, met melding
  useEffect(() => {
    if (!menu || !loaded) return;
    const { kept, removed } = pruneCart(cart, new Set(menu.dishes.map((d) => d.id)));
    if (removed.length) {
      setCart(kept);
      toast.warning(
        `${removed.join(", ")} ${removed.length === 1 ? "is" : "zijn"} net uitverkocht en werd${removed.length === 1 ? "" : "en"} uit je mandje gehaald.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, loaded]);

  // Melding wanneer een bestelling van deze tafel klaar is
  const seen = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!bill) return;
    const prev = seen.current;
    if (prev) {
      for (const o of bill) {
        const before = prev.get(o.id);
        if (before && before !== o.status && o.status === "klaar") {
          toast.success(`Je bestelling van ${tijd(o.created_at)} is klaar en wordt zo gebracht!`);
          try {
            navigator.vibrate?.(200);
          } catch {
            /* niet ondersteund */
          }
        }
        if (before && before !== o.status && o.status === "geannuleerd")
          toast.error(
            `Je bestelling van ${tijd(o.created_at)} werd geannuleerd. Vraag de ober om meer uitleg.`,
          );
      }
    }
    seen.current = new Map(bill.map((o) => [o.id, o.status]));
  }, [bill]);

  const [cartOpen, setCartOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [picked, setPicked] = useState<Dish | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState<Partial<Record<RequestType, number | undefined>>>({});

  // Actieve categorie volgen tijdens het scrollen
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    const sections = menu.categories
      .map((c) => document.getElementById(`cat-${c.id}`))
      .filter(Boolean) as HTMLElement[];
    if (!sections.length || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveCat(top.target.id.replace("cat-", ""));
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [menu]);
  useEffect(() => {
    if (!activeCat) return;
    navRef.current
      ?.querySelector(`[data-cat="${activeCat}"]`)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeCat]);

  const total = cartTotal(cart);
  const count = cartCount(cart);
  const tooMany = count > MAX_PER_ORDER;
  const tableTotal = billTotal(bill);
  const openOrders = bill.filter((o) => o.status === "ontvangen" || o.status === "in_bereiding");

  async function sendRequest(type: RequestType) {
    const { error } = await supabase.rpc("request_service", {
      _table: table,
      _type: type,
      ...codeArg,
    });
    if (error) {
      if (/tafelcode/i.test(error.message)) return setCodeRejected(true);
      toast.error(
        /te veel/i.test(error.message)
          ? "Je hebt al meerdere meldingen gestuurd. Wacht even, de ober komt eraan."
          : "Melding versturen lukte niet. Probeer opnieuw.",
      );
      return;
    }
    setCooldown((c) => ({ ...c, [type]: Date.now() }));
    setTimeout(() => setCooldown((c) => ({ ...c, [type]: undefined })), REQUEST_COOLDOWN_MS);
    toast.success(
      type === "ober"
        ? "De ober is verwittigd en komt zo naar je tafel."
        : "De rekening wordt naar je tafel gebracht.",
    );
  }

  async function placeOrder() {
    if (busy || !cart.length || tooMany) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("place_order", {
      _table: table,
      _items: cart.map((l) => ({ dish_id: l.dishId, quantity: l.quantity, note: l.note })),
      _allergies: avoid,
      ...codeArg,
    });
    setBusy(false);
    if (error && /tafelcode/i.test(error.message)) return setCodeRejected(true);
    if (error || !data) {
      toast.error(orderErrorMessage(error?.message));
      qc.invalidateQueries({ queryKey: ["menu"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
      return;
    }
    setCart([]);
    setCartOpen(false);
    setTableOpen(true);
    toast.success("Je bestelling is doorgestuurd naar de keuken!");
    qc.invalidateQueries({ queryKey: ["bill", table, code] });
  }

  if ((settings && !valid) || badCode) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-3xl font-semibold">
            {badCode ? "QR-code niet geldig" : "Onbekende tafel"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {badCode
              ? "Deze link hoort niet (meer) bij een tafel. Scan de QR-code op je tafel opnieuw of vraag het aan onze medewerkers."
              : "Scan de QR-code op je tafel opnieuw."}
          </p>
        </div>
      </main>
    );
  }

  const avoidSet = new Set(avoid);
  const conflicts = (d: Dish) => d.allergens.filter((a) => avoidSet.has(a));

  return (
    <div className="mx-auto min-h-screen max-w-xl pb-36">
      <header className="bg-oak-gradient px-5 pb-6 pt-8 text-oak-foreground">
        <p className="text-sm font-medium opacity-90">Welkom bij</p>
        <h1 className="text-3xl font-semibold">{restaurant}</h1>
        <div className="mt-3 inline-flex rounded-full bg-card px-3 py-1 text-sm font-semibold text-foreground">
          Tafel {table}
        </div>
      </header>

      {!orderingOpen && (
        <div
          role="status"
          className="mx-5 mt-4 flex items-start gap-3 rounded-2xl border border-status-new bg-status-new-soft p-4"
        >
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-status-new" />
          <div>
            <p className="font-semibold">Bestellen is even gepauzeerd</p>
            <p className="text-sm text-muted-foreground">
              De keuken neemt op dit moment geen nieuwe bestellingen aan. Je kan het menu wel
              bekijken of de ober roepen.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 px-5 pt-4">
        <RequestButton type="ober" cooldown={cooldown.ober} onClick={() => sendRequest("ober")} />
        <RequestButton
          type="rekening"
          cooldown={cooldown.rekening}
          onClick={() => sendRequest("rekening")}
        />
      </div>

      <div className="px-5 pt-3">
        <button
          onClick={() => setFilterOpen(true)}
          className={`flex w-full items-center gap-2 rounded-xl border px-4 py-2.5 text-left text-sm ${avoid.length ? "border-destructive/40 bg-destructive/5" : "bg-card"}`}
        >
          <ShieldAlert
            className={`h-4 w-4 shrink-0 ${avoid.length ? "text-destructive" : "text-muted-foreground"}`}
          />
          {avoid.length ? (
            <span>
              <span className="font-semibold">Allergiefilter actief:</span>{" "}
              {avoid.map((a) => allergenInfo(a).label.toLowerCase()).join(", ")}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Allergie of intolerantie? Stel je filter in
            </span>
          )}
        </button>
      </div>

      <nav
        ref={navRef}
        className="sticky top-0 z-10 mt-4 flex gap-2 overflow-x-auto border-b bg-background/95 px-5 py-3 backdrop-blur [scrollbar-width:none]"
      >
        {menu?.categories.map((c) => (
          <a
            key={c.id}
            data-cat={c.id}
            href={`#cat-${c.id}`}
            onClick={() => setActiveCat(c.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${activeCat === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
          >
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
                const inCart = cart
                  .filter((l) => l.dishId === d.id)
                  .reduce((s, l) => s + l.quantity, 0);
                const bad = conflicts(d);
                return (
                  <button
                    key={d.id}
                    onClick={() => setPicked(d)}
                    className={`flex w-full gap-4 rounded-2xl border bg-card p-4 text-left shadow-soft transition active:scale-[0.99] ${bad.length ? "opacity-60" : ""}`}
                  >
                    {d.image_url && (
                      <img
                        src={d.image_url}
                        alt={d.name}
                        className="h-20 w-20 shrink-0 rounded-xl object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-sans text-base font-semibold">{d.name}</h3>
                        <span className="shrink-0 font-semibold text-primary">{euro(d.price)}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
                      {bad.length > 0 && (
                        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" /> Bevat{" "}
                          {bad.map((a) => allergenInfo(a).label.toLowerCase()).join(", ")}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {d.allergens.map((a) => {
                          const info = allergenInfo(a);
                          return (
                            <span
                              key={a}
                              className={`rounded-full px-2 py-0.5 text-xs ${avoidSet.has(a) ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}
                            >
                              {info.icon} {info.label}
                            </span>
                          );
                        })}
                        {inCart > 0 && (
                          <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                            {inCart} in mandje
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {menu && (
        <p className="px-5 pt-8 text-center text-xs text-muted-foreground">
          Allergeneninformatie volgens de 14 wettelijke allergenen. Twijfel je? Vraag het aan onze
          medewerkers.
        </p>
      )}

      <AddDialog
        dish={picked}
        conflicts={picked ? conflicts(picked) : []}
        onClose={() => setPicked(null)}
        onAdd={(q, note) => {
          if (!picked) return;
          setCart((c) =>
            addToCart(c, {
              dishId: picked.id,
              name: picked.name,
              price: Number(picked.price),
              quantity: q,
              note,
            }),
          );
          toast.success(`${picked.name} toegevoegd`);
          setPicked(null);
        }}
      />

      {(count > 0 || bill.length > 0) && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl gap-2 p-4">
          {bill.length > 0 && (
            <Button
              size="lg"
              variant={count > 0 ? "secondary" : "default"}
              className={`h-14 rounded-2xl text-base shadow-soft ${count > 0 ? "px-4" : "w-full justify-between"}`}
              onClick={() => setTableOpen(true)}
              aria-label="Jouw tafel"
            >
              <span className="flex items-center gap-2">
                <Utensils className="h-5 w-5" />
                {count === 0 && (
                  <span>
                    Jouw tafel ·{" "}
                    {openOrders.length ? `${openOrders.length} in bereiding` : "alles klaar"}
                  </span>
                )}
              </span>
              {count === 0 && <span>{euro(tableTotal)}</span>}
            </Button>
          )}
          {count > 0 && (
            <Button
              size="lg"
              className="h-14 flex-1 justify-between rounded-2xl text-base shadow-soft"
              onClick={() => setCartOpen(true)}
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" /> Mandje ({count})
              </span>
              <span>{euro(total)}</span>
            </Button>
          )}
        </div>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85vh] max-w-xl overflow-y-auto rounded-t-3xl"
        >
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">Je bestelling</SheetTitle>
            <SheetDescription>
              Voor tafel {table}. Pas aantallen aan of plaats je bestelling.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4">
            {cart.map((l, i) => (
              <div
                key={`${l.dishId}-${l.note}`}
                className="flex items-center gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{l.name}</p>
                  {l.note && <p className="text-sm italic text-muted-foreground">“{l.note}”</p>}
                  <p className="text-sm text-muted-foreground">{euro(l.price * l.quantity)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    className="rounded-full"
                    aria-label={`Eén ${l.name} minder`}
                    onClick={() =>
                      setCart((c) =>
                        c.flatMap((x, j) =>
                          j === i
                            ? x.quantity > 1
                              ? [{ ...x, quantity: x.quantity - 1 }]
                              : []
                            : [x],
                        ),
                      )
                    }
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-6 text-center font-semibold">{l.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="rounded-full"
                    aria-label={`Eén ${l.name} meer`}
                    onClick={() =>
                      setCart((c) =>
                        c.map((x, j) =>
                          j === i ? { ...x, quantity: Math.min(MAX_PER_LINE, x.quantity + 1) } : x,
                        ),
                      )
                    }
                    disabled={l.quantity >= MAX_PER_LINE}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {!cart.length && (
              <p className="py-6 text-center text-muted-foreground">Je mandje is leeg.</p>
            )}
          </div>
          <div className="space-y-3 p-4">
            <div className="flex justify-between text-lg font-semibold">
              <span>Totaal</span>
              <span>{euro(total)}</span>
            </div>
            {!orderingOpen && (
              <p className="text-center text-sm font-medium text-status-new">
                Bestellen is momenteel gepauzeerd.
              </p>
            )}
            {tooMany && (
              <p className="text-center text-sm font-medium text-destructive">
                Maximaal {MAX_PER_ORDER} stuks per bestelling. Verdeel je bestelling in twee rondes.
              </p>
            )}
            <Button
              size="lg"
              className="h-14 w-full rounded-2xl text-base"
              disabled={!count || busy || !orderingOpen || tooMany}
              onClick={placeOrder}
            >
              {busy ? "Bezig met versturen…" : "Bestelling plaatsen"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Je betaalt na de maaltijd.</p>
          </div>
        </SheetContent>
      </Sheet>

      <TableSheet
        open={tableOpen}
        onOpenChange={setTableOpen}
        table={table}
        orders={bill}
        total={tableTotal}
        cooldown={cooldown}
        onRequest={sendRequest}
      />
      <AllergenSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={avoid}
        onChange={setAvoid}
      />
    </div>
  );
}

function RequestButton({
  type,
  cooldown,
  onClick,
}: {
  type: RequestType;
  cooldown?: number | undefined;
  onClick: () => void;
}) {
  const sent = !!cooldown;
  const Icon = sent ? Check : type === "ober" ? Bell : Receipt;
  const label = sent
    ? type === "ober"
      ? "Ober verwittigd"
      : "Rekening gevraagd"
    : type === "ober"
      ? "Ober roepen"
      : "Rekening vragen";
  return (
    <Button
      variant="outline"
      className={`rounded-full ${sent ? "border-primary text-primary" : ""}`}
      disabled={sent}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" /> {label}
    </Button>
  );
}

function AddDialog({
  dish,
  conflicts,
  onClose,
  onAdd,
}: {
  dish: Dish | null;
  conflicts: string[];
  onClose: () => void;
  onAdd: (q: number, note: string) => void;
}) {
  const [q, setQ] = useState(1);
  const [note, setNote] = useState("");
  useEffect(() => {
    setQ(1);
    setNote("");
  }, [dish?.id]);
  return (
    <Sheet open={!!dish} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-w-xl rounded-t-3xl">
        {dish && (
          <div className="space-y-4 p-4">
            {dish.image_url && (
              <img
                src={dish.image_url}
                alt={dish.name}
                className="h-44 w-full rounded-2xl object-cover"
              />
            )}
            <SheetHeader className="p-0">
              <SheetTitle className="font-display text-2xl">{dish.name}</SheetTitle>
              <SheetDescription>{dish.description}</SheetDescription>
            </SheetHeader>
            {conflicts.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>
                  Dit gerecht bevat{" "}
                  <strong>
                    {conflicts.map((a) => allergenInfo(a).label.toLowerCase()).join(", ")}
                  </strong>
                  , waarvoor je een filter instelde.
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {dish.allergens.map((a) => {
                const i = allergenInfo(a);
                return (
                  <span key={a} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {i.icon} {i.label}
                  </span>
                );
              })}
            </div>
            <Textarea
              placeholder="Opmerking voor de keuken (bv. zonder ui, saus apart)"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border p-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full"
                  aria-label="Minder"
                  onClick={() => setQ(Math.max(1, q - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-6 text-center text-lg font-semibold">{q}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full"
                  aria-label="Meer"
                  onClick={() => setQ(Math.min(MAX_PER_LINE, q + 1))}
                  disabled={q >= MAX_PER_LINE}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Button
                size="lg"
                className="h-12 flex-1 rounded-full"
                onClick={() => onAdd(q, note.trim())}
              >
                Toevoegen · {euro(Number(dish.price) * q)}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

const STEPS = ["ontvangen", "in_bereiding", "klaar"] as const;
const STEP_ICONS = [Check, ChefHat, Bell];

function TableSheet({
  open,
  onOpenChange,
  table,
  orders,
  total,
  cooldown,
  onRequest,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  table: number;
  orders: BillOrder[];
  total: number;
  cooldown: Partial<Record<RequestType, number | undefined>>;
  onRequest: (t: RequestType) => void;
}) {
  const lines = useMemo(() => billLines(orders), [orders]);
  const [view, setView] = useState<"status" | "rekening">("status");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90vh] max-w-xl overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Tafel {table}</SheetTitle>
          <SheetDescription>Alle bestellingen van deze tafel, live bijgewerkt.</SheetDescription>
        </SheetHeader>
        <div className="mx-4 grid grid-cols-2 rounded-full bg-muted p-1 text-sm font-semibold">
          {(["status", "rekening"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full py-2 transition ${view === v ? "bg-card shadow-soft" : "text-muted-foreground"}`}
            >
              {v === "status" ? "Bestellingen" : "Rekening"}
            </button>
          ))}
        </div>

        {view === "status" ? (
          <div className="space-y-3 p-4">
            {!orders.length && (
              <p className="py-6 text-center text-muted-foreground">
                Nog geen bestellingen aan deze tafel.
              </p>
            )}
            {[...orders].reverse().map((o) => {
              const idx = STEPS.indexOf(o.status as (typeof STEPS)[number]);
              const cancelled = o.status === "geannuleerd";
              return (
                <div
                  key={o.id}
                  className={`rounded-2xl border bg-card p-4 ${cancelled ? "opacity-60" : ""}`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Besteld om {tijd(o.created_at)}</p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cancelled ? "bg-destructive/10 text-destructive" : o.status === "klaar" ? "bg-status-done text-primary-foreground" : o.status === "in_bereiding" ? "bg-status-busy text-primary-foreground" : "bg-status-new text-primary-foreground"}`}
                    >
                      {STATUS_LABEL[o.status]}
                    </span>
                  </div>
                  {!cancelled && (
                    <div
                      className="mb-3 flex items-center gap-1"
                      aria-label={`Status: ${STATUS_LABEL[o.status]}`}
                    >
                      {STEPS.map((s, i) => {
                        const Icon = STEP_ICONS[i]!;
                        const done = i <= idx;
                        return (
                          <div key={s} className="flex flex-1 items-center gap-1">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"} ${i === idx && s !== "klaar" ? "animate-pulse" : ""}`}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            {i < STEPS.length - 1 && (
                              <div
                                className={`h-1 flex-1 rounded-full ${i < idx ? "bg-primary" : "bg-muted"}`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <ul className="space-y-0.5 text-sm">
                    {o.items.map((it) => (
                      <li key={it.id}>
                        {it.quantity}× {it.dish_name}
                        {it.note && (
                          <span className="italic text-muted-foreground"> – {it.note}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4">
            <div className="rounded-2xl border bg-card p-4">
              {lines.map((l) => (
                <div key={`${l.name}-${l.unit}`} className="flex justify-between py-1">
                  <span>
                    {l.quantity}× {l.name}
                  </span>
                  <span>{euro(l.unit * l.quantity)}</span>
                </div>
              ))}
              {!lines.length && (
                <p className="py-2 text-center text-muted-foreground">Nog niets op de rekening.</p>
              )}
              <div className="mt-3 flex justify-between border-t pt-3 text-lg font-semibold">
                <span>Totaal tafel</span>
                <span>{euro(total)}</span>
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Je betaalt aan tafel of aan de toog.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 px-4 pb-6">
          <RequestButton type="ober" cooldown={cooldown.ober} onClick={() => onRequest("ober")} />
          <RequestButton
            type="rekening"
            cooldown={cooldown.rekening}
            onClick={() => onRequest("rekening")}
          />
          <Button className="col-span-2 h-12 rounded-full" onClick={() => onOpenChange(false)}>
            Verder kijken in het menu
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AllergenSheet({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85vh] max-w-xl overflow-y-auto rounded-t-3xl"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Allergieën</SheetTitle>
          <SheetDescription>
            Duid aan wat je wil vermijden. Gerechten die het bevatten, krijgen een waarschuwing.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-wrap gap-2 px-4">
          {ALLERGENS.map((a) => {
            const on = value.includes(a.key);
            return (
              <button
                key={a.key}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? value.filter((x) => x !== a.key) : [...value, a.key])}
                className={`rounded-full border px-3 py-2 text-sm transition ${on ? "border-destructive bg-destructive text-destructive-foreground" : "bg-card"}`}
              >
                {a.icon} {a.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 p-4">
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            onClick={() => onChange([])}
            disabled={!value.length}
          >
            Wissen
          </Button>
          <Button className="flex-1 rounded-full" onClick={() => onOpenChange(false)}>
            Klaar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
