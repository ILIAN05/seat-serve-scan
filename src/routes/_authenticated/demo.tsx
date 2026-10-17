import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Eraser, ExternalLink, RotateCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/hooks";
import { resetDemo, simulateRush } from "@/lib/demo";

export const Route = createFileRoute("/_authenticated/demo")({
  head: () => ({
    meta: [
      { title: "Demo – Bistro De Houder" },
      {
        name: "description",
        content: "Gast en keuken naast elkaar: zo werkt bestellen aan tafel.",
      },
    ],
  }),
  component: Demo,
});

const PHONE = { w: 390, h: 800 };
const PHONE_FRAME = { w: PHONE.w + 24, h: PHONE.h + 24 };
const KITCHEN = { w: 1280, h: 860 };

/** Schaalt een vaste-maat iframe zodat hij in de beschikbare ruimte past. */
function useFit(box: { w: number; h: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e!.contentRect;
      setScale(Math.max(0.2, Math.min(1, (width - 16) / box.w, (height - 16) / box.h)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [box.w, box.h]);
  return { ref, scale };
}

function Demo() {
  const { data: settings } = useSettings();
  const [table, setTable] = useState(7);
  const [running, setRunning] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const phone = useFit(PHONE_FRAME);
  const kitchen = useFit(KITCHEN);
  const demoOn = settings?.demo_mode ?? true;

  // De gsm opent de tafel met haar echte QR-link, zoals een gast die de code scant.
  const { data: code } = useQuery({
    queryKey: ["table-code", table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_codes")
        .select("code")
        .eq("table_number", table)
        .single();
      if (error) throw error;
      return data.code;
    },
  });
  const guestUrl = code ? `/tafel/${table}?k=${encodeURIComponent(code)}` : `/tafel/${table}`;

  async function rush() {
    setRunning(0);
    try {
      await simulateRush({ count: 6, delayMs: 3000, onProgress: setRunning });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(null);
    }
  }
  async function reset() {
    if (!confirm("Alle bestellingen en meldingen van vandaag verwijderen?")) return;
    try {
      await resetDemo();
      toast.success("Demo opgeruimd");
      setReloadKey((k) => k + 1);
    } catch {
      toast.error("Opruimen mislukt");
    }
  }

  return (
    <div className="flex h-screen flex-col bg-secondary">
      <header className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/beheer">
            <ArrowLeft className="h-4 w-4" /> Beheer
          </Link>
        </Button>
        <h1 className="mr-auto text-xl font-semibold">Demo: gast en keuken live</h1>
        <label className="flex items-center gap-2 text-sm">
          Tafel
          <select
            value={table}
            onChange={(e) => setTable(Number(e.target.value))}
            className="h-9 rounded-md border bg-card px-2"
          >
            {Array.from({ length: settings?.table_count ?? 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={rush} disabled={running !== null || !demoOn}>
          <Sparkles className="h-4 w-4" />{" "}
          {running !== null ? `Bestellingen komen binnen… ${running}/6` : "Drukke avond simuleren"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setReloadKey((k) => k + 1)}
          aria-label="Herladen"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={reset} disabled={!demoOn}>
          <Eraser className="h-4 w-4" /> Opruimen
        </Button>
      </header>
      {!demoOn && (
        <p className="border-b bg-status-new-soft px-4 py-2 text-sm">
          De demomodus staat uit: simuleren en opruimen zijn uitgeschakeld. Je kan hem aanzetten via
          Beheer → Instellingen.
        </p>
      )}

      <main className="grid min-h-0 flex-1 gap-6 p-4 md:grid-cols-[minmax(260px,420px)_1fr] md:p-6">
        <section className="flex min-h-0 flex-col items-center">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            Gsm van de gast · tafel {table}
            <a
              href={guestUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary"
              aria-label="Gastenpagina openen in nieuw tabblad"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </p>
          <div ref={phone.ref} className="flex min-h-0 w-full flex-1 justify-center">
            <div
              style={{ width: (PHONE.w + 24) * phone.scale, height: (PHONE.h + 24) * phone.scale }}
            >
              <div
                className="origin-top-left rounded-[2.5rem] bg-foreground p-3 shadow-2xl"
                style={{
                  width: PHONE.w + 24,
                  height: PHONE.h + 24,
                  transform: `scale(${phone.scale})`,
                }}
              >
                <iframe
                  key={`p-${table}-${reloadKey}-${code ?? ""}`}
                  title={`Gastenpagina tafel ${table}`}
                  src={guestUrl}
                  className="h-full w-full rounded-[2rem] bg-background"
                />
              </div>
            </div>
          </div>
        </section>
        <section className="flex min-h-0 flex-col">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            Tablet in de keuken
            <a
              href="/keuken"
              target="_blank"
              rel="noreferrer"
              className="text-primary"
              aria-label="Keukenscherm openen in nieuw tabblad"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </p>
          <div ref={kitchen.ref} className="min-h-0 flex-1">
            <div
              style={{ width: KITCHEN.w * kitchen.scale, height: KITCHEN.h * kitchen.scale }}
              className="box-content overflow-hidden rounded-2xl border-8 border-foreground bg-background shadow-2xl"
            >
              <iframe
                key={`k-${reloadKey}`}
                title="Keukenscherm"
                src="/keuken"
                className="origin-top-left"
                style={{
                  width: KITCHEN.w,
                  height: KITCHEN.h,
                  transform: `scale(${kitchen.scale})`,
                }}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
