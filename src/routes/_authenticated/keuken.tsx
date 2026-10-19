import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  Check,
  ChefHat,
  Maximize,
  Minimize,
  PauseCircle,
  PlayCircle,
  Receipt,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNow, useSettings, useWakeLock } from "@/lib/hooks";
import {
  allergenInfo,
  billTotal,
  duurLabel,
  euro,
  isOpenBill,
  isKitchenOpenOrder,
  minutesSince,
  ordersSince,
  STATUS_LABEL,
  tijd,
} from "@/lib/menu";
import type { Tables } from "@/integrations/supabase/types";
import { TableDialog } from "@/components/beheer/Zaal";

export const Route = createFileRoute("/_authenticated/keuken")({
  head: () => ({
    meta: [
      { title: "Keukenscherm – Bistro De Houder" },
      { name: "description", content: "Live overzicht van bestellingen en tafelmeldingen." },
      { property: "og:title", content: "Keukenscherm – Bistro De Houder" },
      { property: "og:description", content: "Live bestellingen voor de keuken." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Kitchen,
});

type Order = Tables<"orders"> & { order_items: Tables<"order_items">[] };

function beep(ctx: AudioContext, double = true) {
  const play = (t: number, f: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    o.type = "sine";
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.4);
  };
  const n = ctx.currentTime;
  play(n, 880);
  if (double) play(n + 0.4, 1175);
}

const statusStyle: Record<string, string> = {
  ontvangen: "border-status-new bg-status-new-soft",
  in_bereiding: "border-status-busy bg-status-busy-soft",
  klaar: "border-status-done bg-status-done-soft",
  geannuleerd: "border-border bg-muted",
};
const badgeStyle: Record<string, string> = {
  ontvangen: "bg-status-new text-primary-foreground",
  in_bereiding: "bg-status-busy text-primary-foreground",
  klaar: "bg-status-done text-primary-foreground",
};

function Kitchen() {
  const qc = useQueryClient();
  const now = useNow(15_000);
  const { data: settings } = useSettings();
  const lateAfter = settings?.late_after_minutes ?? 15;

  const audio = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [checkoutTable, setCheckoutTable] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const awake = useWakeLock(sound);

  const { data: ordersData } = useQuery({
    queryKey: ["kitchen-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .gte("created_at", ordersSince().toISOString())
        .order("created_at");
      if (error) throw error;
      return data as Order[];
    },
    refetchInterval: 15_000, // vangnet als de live-verbinding wegvalt
  });
  const { data: requestsData } = useQuery({
    queryKey: ["kitchen-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_requests")
        .select("*")
        .eq("handled", false)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: 15_000,
  });

  const orders = useMemo(() => ordersData ?? [], [ordersData]);
  const requests = useMemo(() => requestsData ?? [], [requestsData]);

  // Realtime: elke wijziging laat de lijsten opnieuw ophalen
  useEffect(() => {
    const ch = supabase
      .channel("kitchen")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (p) => {
        // de gerechten worden net na de bestelling ingevoegd
        setTimeout(
          () => qc.invalidateQueries({ queryKey: ["kitchen-orders"] }),
          p.eventType === "INSERT" ? 600 : 0,
        );
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "table_requests" }, () =>
        qc.invalidateQueries({ queryKey: ["kitchen-requests"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Nieuwe bestellingen en meldingen detecteren (werkt ook als realtime wegvalt en we op polling draaien)
  const knownOrders = useRef<Set<string> | null>(null);
  const knownRequests = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ordersData) return; // eerste lading: niets als nieuw markeren
    const ids = new Set(orders.map((o) => o.id));
    if (knownOrders.current) {
      const added = orders
        .filter((o) => !knownOrders.current!.has(o.id) && o.status === "ontvangen")
        .map((o) => o.id);
      if (added.length) {
        setFresh((s) => new Set([...s, ...added]));
        setTimeout(
          () =>
            setFresh((s) => {
              const n = new Set(s);
              added.forEach((id) => n.delete(id));
              return n;
            }),
          15_000,
        );
        if (audio.current && sound) beep(audio.current);
      }
    }
    knownOrders.current = ids;
  }, [orders, ordersData, sound]);
  useEffect(() => {
    if (!requestsData) return;
    const ids = new Set(requests.map((r) => r.id));
    if (
      knownRequests.current &&
      requests.some((r) => !knownRequests.current!.has(r.id)) &&
      audio.current &&
      sound
    )
      beep(audio.current, false);
    knownRequests.current = ids;
  }, [requests, requestsData, sound]);

  // Gerechten afvinken: bewaard op de server, zodat elke tablet in de keuken hetzelfde ziet
  async function toggleItem(item: Tables<"order_items">) {
    const done = !item.done;
    qc.setQueryData<Order[]>(["kitchen-orders"], (list) =>
      list?.map((o) => ({
        ...o,
        order_items: o.order_items.map((i) => (i.id === item.id ? { ...i, done } : i)),
      })),
    );
    const { error } = await supabase.rpc("set_item_done", { _item: item.id, _done: done });
    if (error) toast.error("Afvinken mislukt. Probeer opnieuw.");
    qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
  }

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleSound() {
    if (!audio.current) audio.current = new AudioContext();
    if (sound) {
      setSound(false);
      void audio.current.suspend();
    } else {
      void audio.current.resume();
      beep(audio.current, false);
      setSound(true);
    }
  }

  async function setStatus(o: Order, status: string, undoable = false) {
    const previous = o.status;
    const { error } = await supabase.rpc("set_order_status", { _id: o.id, _status: status });
    if (error) {
      toast.error("Status wijzigen mislukt. Probeer opnieuw.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
    if (undoable) {
      toast.success(`Tafel ${o.table_number}: ${STATUS_LABEL[status]?.toLowerCase()}`, {
        action: {
          label: "Ongedaan maken",
          onClick: () => {
            void supabase
              .rpc("set_order_status", { _id: o.id, _status: previous })
              .then(({ error: undoError }) => {
                if (undoError) toast.error("Ongedaan maken mislukt.");
                qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
              });
          },
        },
        duration: 6000,
      });
    }
  }

  async function handle(table: number) {
    const { error } = await supabase.rpc("handle_requests", { _table: table });
    if (error) toast.error("Afhandelen mislukt. Probeer opnieuw.");
    qc.invalidateQueries({ queryKey: ["kitchen-requests"] });
  }

  async function toggleOrdering() {
    if (!settings) return;
    const { error } = await supabase
      .from("settings")
      .update({ ordering_open: !settings.ordering_open })
      .eq("id", 1);
    if (error) {
      toast.error("Wijzigen mislukt");
      return;
    }
    qc.invalidateQueries({ queryKey: ["settings"] });
    toast.success(
      settings.ordering_open
        ? "Bestellen gepauzeerd: gasten kunnen even niet bestellen"
        : "Bestellen staat weer open",
    );
  }

  const open = orders.filter(isKitchenOpenOrder);
  const done = orders
    .filter((o) => o.status === "klaar" || o.status === "geannuleerd")
    .reverse()
    .slice(0, 40);
  const lateCount = open.filter((o) => minutesSince(o.created_at, now) >= lateAfter).length;
  const tableTotals = useMemo(() => {
    const m = new Map<number, number>();
    for (const o of orders.filter((x) => isOpenBill(x)))
      m.set(o.table_number, (m.get(o.table_number) ?? 0) + billTotal([o]));
    return m;
  }, [orders]);
  const toCancel = orders.find((o) => o.id === cancelId);
  const checkoutOrders = orders.filter((o) => o.table_number === checkoutTable && isOpenBill(o, now));
  const checkoutState = checkoutTable === null ? null : {
    table: checkoutTable,
    orders: checkoutOrders,
    requests: requests.filter((r) => r.table_number === checkoutTable),
    total: billTotal(checkoutOrders),
    since: checkoutOrders[0]?.created_at ?? null,
  };
  function refreshCheckout() {
    void qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
    void qc.invalidateQueries({ queryKey: ["kitchen-requests"] });
    void qc.invalidateQueries({ queryKey: ["admin"] });
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold">Keuken</h1>
          <p className="text-lg text-muted-foreground">
            {open.length} openstaande bestelling{open.length === 1 ? "" : "en"}
            {lateCount > 0 && (
              <span className="font-semibold text-destructive">
                {" "}
                · {lateCount} wacht{lateCount === 1 ? "" : "en"} langer dan {lateAfter} min
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            variant={settings?.ordering_open === false ? "destructive" : "outline"}
            onClick={toggleOrdering}
            disabled={!settings}
          >
            {settings?.ordering_open === false ? (
              <>
                <PlayCircle className="h-5 w-5" /> Bestellen hervatten
              </>
            ) : (
              <>
                <PauseCircle className="h-5 w-5" /> Bestellen pauzeren
              </>
            )}
          </Button>
          <Button size="lg" variant={sound ? "default" : "outline"} onClick={toggleSound}>
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}{" "}
            {sound ? "Geluid aan" : "Geluid inschakelen"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            aria-label={fullscreen ? "Volledig scherm verlaten" : "Volledig scherm"}
            onClick={() =>
              (document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen()
              ).catch(() => {})
            }
          >
            {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/beheer">Beheer</Link>
          </Button>
        </div>
      </header>

      {!sound && (
        <button
          onClick={toggleSound}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border-2 border-status-new bg-status-new-soft px-5 py-3 text-left"
        >
          <VolumeX className="h-6 w-6 shrink-0 text-status-new" />
          <span className="text-lg">
            <strong>Geluid staat uit.</strong> Tik hier om meldingen te horen en het scherm wakker
            te houden.
          </span>
        </button>
      )}
      {settings?.ordering_open === false && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-destructive bg-destructive/5 px-5 py-3 text-lg">
          <PauseCircle className="h-6 w-6 text-destructive" />{" "}
          <span>
            <strong>Bestellen is gepauzeerd.</strong> Gasten kunnen het menu zien maar niet
            bestellen.
          </span>
        </div>
      )}

      {requests.length > 0 && (
        <section className="mb-6 flex flex-wrap gap-3" aria-label="Tafelmeldingen">
          {requests.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-4 rounded-2xl border-2 border-oak bg-card px-5 py-4 shadow-soft animate-new-order"
            >
              {r.type === "ober" ? (
                <Bell className="h-7 w-7 text-oak" />
              ) : (
                <Receipt className="h-7 w-7 text-oak" />
              )}
              <div>
                <p className="text-xl font-bold">Tafel {r.table_number}</p>
                <p className="text-muted-foreground">
                  {r.type === "ober"
                    ? "Ober geroepen"
                    : `Vraagt de rekening${tableTotals.get(r.table_number) ? ` · ${euro(tableTotals.get(r.table_number)!)}` : ""}`}{" "}
                  · {duurLabel(minutesSince(r.created_at, now))}
                </p>
              </div>
              <Button size="lg" onClick={() => handle(r.table_number)}>
                <Check className="h-5 w-5" /> Afgehandeld
              </Button>
              {r.type === "rekening" && tableTotals.has(r.table_number) && (
                <Button size="lg" variant="outline" onClick={() => setCheckoutTable(r.table_number)}>
                  <Wallet className="h-5 w-5" /> Afrekenen
                </Button>
              )}
            </div>
          ))}
        </section>
      )}

      <div
        className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-base text-muted-foreground"
        aria-label="Legende"
      >
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded border-2 border-status-new bg-status-new-soft" /> Nieuw
          binnen
        </span>
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded border-2 border-status-busy bg-status-busy-soft" /> In
          bereiding
        </span>
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded ring-4 ring-destructive/60" /> Wacht langer dan{" "}
          {lateAfter} min
        </span>
        <span className="flex items-center gap-2">
          <Check className="h-4 w-4" /> Tik op een gerecht om het af te vinken
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section
          className="grid content-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]"
          aria-label="Openstaande bestellingen"
        >
          {open.length === 0 && (
            <p className="col-span-full rounded-2xl border border-dashed p-12 text-center text-xl text-muted-foreground">
              Geen openstaande bestellingen. Nieuwe bestellingen verschijnen hier vanzelf
              {sound ? ", met een geluidssignaal." : "."}
            </p>
          )}
          {open.map((o) => {
            const mins = minutesSince(o.created_at, now);
            const late = mins >= lateAfter;
            const allChecked = o.order_items.length > 0 && o.order_items.every((i) => i.done);
            return (
              <article
                key={o.id}
                className={`flex flex-col rounded-2xl border-2 p-5 shadow-soft ${statusStyle[o.status]} ${fresh.has(o.id) ? "animate-new-order" : ""} ${late ? "ring-4 ring-destructive/60" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-3xl font-bold xl:text-4xl">
                      Tafel {o.table_number}
                    </p>
                    <p
                      className={`flex items-center gap-1 whitespace-nowrap text-lg ${late ? "font-bold text-destructive" : "text-muted-foreground"}`}
                    >
                      <Timer className="h-4 w-4" /> {tijd(o.created_at)} · {duurLabel(mins)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${badgeStyle[o.status]}`}
                  >
                    {fresh.has(o.id) ? "NIEUW" : STATUS_LABEL[o.status]}
                  </span>
                </div>
                {o.allergies.length > 0 && (
                  <p className="mt-3 rounded-lg bg-destructive px-3 py-2 text-base font-bold text-destructive-foreground">
                    ⚠ Allergie: {o.allergies.map((a) => allergenInfo(a)?.label ?? a).join(", ")}
                  </p>
                )}
                <ul className="my-4 flex-1 space-y-1 text-xl">
                  {o.order_items.map((it) => {
                    const on = it.done;
                    return (
                      <li key={it.id}>
                        <button
                          onClick={() => toggleItem(it)}
                          className="flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left hover:bg-card/60"
                          aria-pressed={on}
                        >
                          <span
                            className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${on ? "border-status-done bg-status-done text-primary-foreground" : "border-foreground/30 bg-card"}`}
                          >
                            {on && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className={on ? "text-muted-foreground line-through" : ""}>
                            <span className="font-bold">{it.quantity}×</span> {it.dish_name}
                            {it.note && (
                              <span className="block text-base font-semibold text-destructive no-underline">
                                ↳ {it.note}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {/* Eén grote knop voor de volgende stap; "meteen klaar" (bv. drankjes) als tweede keuze */}
                {o.status === "ontvangen" ? (
                  <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
                    <Button
                      size="lg"
                      className="h-14 text-base"
                      onClick={() => setStatus(o, "in_bereiding")}
                    >
                      <ChefHat className="h-5 w-5" /> Start bereiding
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-14 bg-card text-base"
                      onClick={() => setStatus(o, "klaar", true)}
                    >
                      <Check className="h-5 w-5" /> Klaar
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    className={`h-14 w-full text-base ${allChecked ? "animate-pulse" : ""}`}
                    onClick={() => setStatus(o, "klaar", true)}
                  >
                    <Check className="h-5 w-5" /> Klaar om op te dienen
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => setCheckoutTable(o.table_number)}
                >
                  <Wallet className="h-4 w-4" /> Afrekenen · {euro(tableTotals.get(o.table_number) ?? 0)}
                </Button>
                <button
                  className="mt-2 inline-flex items-center justify-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => setCancelId(o.id)}
                >
                  <X className="h-3.5 w-3.5" /> Bestelling annuleren
                </button>
              </article>
            );
          })}
        </section>
        <aside aria-label="Afgerond vandaag">
          <h2 className="mb-3 text-2xl font-semibold">Afgerond vandaag</h2>
          <div className="space-y-2">
            {done.length === 0 && <p className="text-muted-foreground">Nog niets afgerond.</p>}
            {done.map((o) => (
              <div key={o.id} className={`rounded-xl border p-3 ${statusStyle[o.status]}`}>
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span className={o.status === "geannuleerd" ? "line-through" : ""}>
                    Tafel {o.table_number}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {o.status === "geannuleerd"
                      ? "geannuleerd"
                      : `klaar ${tijd(o.ready_at ?? o.updated_at)}`}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {o.order_items.map((i) => `${i.quantity}× ${i.dish_name}`).join(", ")}
                </p>
                {o.paid_at ? (
                  <p className="mt-2 text-sm font-medium text-status-done">Afgerekend</p>
                ) : isOpenBill(o, now) ? (
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => setCheckoutTable(o.table_number)}>
                    <Wallet className="h-4 w-4" /> Afrekenen · {euro(tableTotals.get(o.table_number) ?? 0)}
                  </Button>
                ) : null}
                {!o.paid_at && (
                  <button
                    className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                    onClick={() => setStatus(o, "in_bereiding")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Terugzetten
                  </button>
                )}
              </div>
            ))}
          </div>
          {sound && (
            <p className="mt-6 text-xs text-muted-foreground">
              {awake
                ? "Scherm blijft aan zolang deze pagina open is."
                : "Tip: zet de automatische schermvergrendeling van de tablet uit."}
            </p>
          )}
        </aside>
      </div>

      <TableDialog
        state={checkoutState}
        restaurant={settings?.restaurant_name ?? "Bistro De Houder"}
        onClose={() => setCheckoutTable(null)}
        onChange={refreshCheckout}
      />
      <AlertDialog open={!!toCancel} onOpenChange={(o) => !o && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Bestelling van tafel {toCancel?.table_number} annuleren?
            </AlertDialogTitle>
            <AlertDialogDescription>
              De gast ziet op zijn gsm dat de bestelling geannuleerd is. Het bedrag komt niet op de
              rekening. Je kan dit later terugzetten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Niet annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toCancel) void setStatus(toCancel, "geannuleerd", true);
                setCancelId(null);
              }}
            >
              Annuleren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
