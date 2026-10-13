import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Bell, Receipt, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, tijd } from "@/lib/menu";

export const Route = createFileRoute("/_authenticated/keuken")({
  head: () => ({
    meta: [
      { title: "Keukenscherm – Bistro De Houder" },
      { name: "description", content: "Live overzicht van bestellingen en tafelmeldingen." },
      { property: "og:title", content: "Keukenscherm – Bistro De Houder" },
      { property: "og:description", content: "Live bestellingen voor de keuken." },
    ],
  }),
  component: Kitchen,
});

function beep(ctx: AudioContext, double = true) {
  const play = (t: number, f: number) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = f; o.type = "sine";
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.4);
  };
  const n = ctx.currentTime; play(n, 880); if (double) play(n + 0.4, 1175);
}

const statusStyle: Record<string, string> = {
  ontvangen: "border-status-new bg-status-new-soft",
  in_bereiding: "border-status-busy bg-status-busy-soft",
  klaar: "border-status-done bg-status-done-soft",
};
const badgeStyle: Record<string, string> = {
  ontvangen: "bg-status-new text-primary-foreground",
  in_bereiding: "bg-status-busy text-primary-foreground",
  klaar: "bg-status-done text-primary-foreground",
};

function Kitchen() {
  const qc = useQueryClient();
  const audio = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { data: orders = [] } = useQuery({
    queryKey: ["kitchen-orders"],
    queryFn: async () => (await supabase.from("orders").select("*, order_items(*)").gte("created_at", start.toISOString()).order("created_at")).data ?? [],
    refetchInterval: 30_000, // vangnet als de live-verbinding wegvalt
  });
  const { data: requests = [] } = useQuery({
    queryKey: ["kitchen-requests"],
    queryFn: async () => (await supabase.from("table_requests").select("*").eq("handled", false).order("created_at")).data ?? [],
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const ch = supabase.channel("kitchen")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (p) => {
        const id = (p.new as { id: string }).id;
        setFresh((s) => new Set(s).add(id));
        setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(id); return n; }), 15000);
        if (audio.current) beep(audio.current);
        // items worden net na de order ingevoegd
        setTimeout(() => qc.invalidateQueries({ queryKey: ["kitchen-orders"] }), 600);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () => qc.invalidateQueries({ queryKey: ["kitchen-orders"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "table_requests" }, (p) => {
        if (p.eventType === "INSERT" && audio.current) beep(audio.current, false);
        qc.invalidateQueries({ queryKey: ["kitchen-requests"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function setStatus(id: string, status: string) {
    await supabase.from("orders").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["kitchen-orders"] });
  }
  async function handle(id: string) {
    await supabase.from("table_requests").update({ handled: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["kitchen-requests"] });
  }

  const open = orders.filter((o) => o.status !== "klaar");
  const done = orders.filter((o) => o.status === "klaar").reverse();

  return (
    <div className="min-h-screen p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-semibold">Keuken</h1>
          <p className="text-lg text-muted-foreground">{open.length} openstaande bestelling{open.length === 1 ? "" : "en"}</p>
        </div>
        <div className="flex gap-2">
          <Button size="lg" variant={sound ? "default" : "outline"} onClick={() => {
            if (!audio.current) audio.current = new AudioContext();
            if (sound) { setSound(false); audio.current.suspend(); } else { audio.current.resume(); beep(audio.current, false); setSound(true); }
          }}>
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />} {sound ? "Geluid aan" : "Geluid inschakelen"}
          </Button>
          <Button size="lg" variant="outline" asChild><Link to="/beheer">Beheer</Link></Button>
        </div>
      </header>

      {requests.length > 0 && (
        <section className="mb-6 flex flex-wrap gap-3">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center gap-4 rounded-2xl border-2 border-oak bg-card px-5 py-4 shadow-soft animate-new-order">
              {r.type === "ober" ? <Bell className="h-7 w-7 text-oak" /> : <Receipt className="h-7 w-7 text-oak" />}
              <div>
                <p className="text-xl font-bold">Tafel {r.table_number}</p>
                <p className="text-muted-foreground">{r.type === "ober" ? "Ober geroepen" : "Vraagt de rekening"} · {tijd(r.created_at)}</p>
              </div>
              <Button size="lg" onClick={() => handle(r.id)}>Afgehandeld</Button>
            </div>
          ))}
        </section>
      )}

      <div className="grid grid-cols-[1fr_320px] gap-6">
        <section className="grid content-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {open.length === 0 && <p className="col-span-full rounded-2xl border border-dashed p-12 text-center text-xl text-muted-foreground">Geen openstaande bestellingen</p>}
          {open.map((o) => (
            <article key={o.id} className={`flex flex-col rounded-2xl border-2 p-5 shadow-soft ${statusStyle[o.status]} ${fresh.has(o.id) ? "animate-new-order" : ""}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-4xl font-bold">Tafel {o.table_number}</p>
                  <p className="text-lg text-muted-foreground">{tijd(o.created_at)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${badgeStyle[o.status]}`}>{fresh.has(o.id) ? "NIEUW" : STATUS_LABEL[o.status]}</span>
              </div>
              <ul className="my-4 flex-1 space-y-2 text-xl">
                {o.order_items.map((it) => (
                  <li key={it.id}>
                    <span className="font-bold">{it.quantity}×</span> {it.dish_name}
                    {it.note && <p className="ml-8 text-base font-semibold text-destructive">↳ {it.note}</p>}
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <Button size="lg" variant="outline" className="h-14 text-base" disabled={o.status === "in_bereiding"} onClick={() => setStatus(o.id, "in_bereiding")}>In bereiding</Button>
                <Button size="lg" className="h-14 text-base" onClick={() => setStatus(o.id, "klaar")}>Klaar</Button>
              </div>
            </article>
          ))}
        </section>
        <aside>
          <h2 className="mb-3 text-2xl font-semibold">Afgerond vandaag</h2>
          <div className="space-y-2">
            {done.length === 0 && <p className="text-muted-foreground">Nog niets afgerond.</p>}
            {done.map((o) => (
              <div key={o.id} className={`rounded-xl border p-3 ${statusStyle["klaar"]}`}>
                <div className="flex justify-between font-semibold"><span>Tafel {o.table_number}</span><span>{tijd(o.updated_at)}</span></div>
                <p className="text-sm text-muted-foreground">{o.order_items.map((i) => `${i.quantity}× ${i.dish_name}`).join(", ")}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
