import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChefHat, LogOut, MonitorPlay, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNow, useSettings } from "@/lib/hooks";
import {
  dayStats,
  euro,
  isOpenBill,
  ordersSince,
  readStore,
  startOfToday,
  writeStore,
} from "@/lib/menu";
import { Zaal } from "@/components/beheer/Zaal";
import { MenuEditor } from "@/components/beheer/MenuEditor";
import { QrTables } from "@/components/beheer/QrTables";
import { Stats } from "@/components/beheer/Stats";
import { SettingsPanel } from "@/components/beheer/SettingsPanel";
import type { AdminOrder } from "@/components/beheer/types";

export const Route = createFileRoute("/_authenticated/beheer")({
  head: () => ({
    meta: [
      { title: "Beheer – Bistro De Houder" },
      {
        name: "description",
        content: "Beheer menu, tafels, QR-codes en bekijk de omzet van vandaag.",
      },
      { property: "og:title", content: "Beheer – Bistro De Houder" },
      { property: "og:description", content: "Menu, tafels en omzet beheren." },
    ],
  }),
  component: Admin,
});

type Tab = "zaal" | "menu" | "tafels" | "cijfers" | "instellingen";

/** Korte uitleg bovenaan elk tabblad, zodat je zonder handleiding weet wat je er kan doen. */
const TAB_HINT: Record<Tab, string> = {
  zaal: "Alle tafels in één oogopslag. Tik op een tafel om haar bestellingen te zien, de rekening af te drukken of af te rekenen.",
  menu: "Pas gerechten en categorieën aan. Zet een gerecht op uitverkocht en het verdwijnt meteen van de gsm van je gasten.",
  tafels:
    "Stel het aantal tafels in en print per tafel een QR-code voor de tafelhouder. Met “Bekijk als gast” zie je wat je gasten zien.",
  cijfers: "Omzet, drukte per uur en populairste gerechten van vandaag.",
  instellingen: "Naam van je restaurant, bestellen pauzeren en de demomodus.",
};

function Admin() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  useNow(30_000); // ververst "x min geleden" in het zaaloverzicht
  const { data: settings } = useSettings();
  const { data } = useQuery({
    queryKey: ["admin"],
    queryFn: async () => {
      const start = ordersSince().toISOString();
      const [c, d, o, r] = await Promise.all([
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("dishes").select("*").order("sort_order"),
        supabase
          .from("orders")
          .select("*, order_items(*)")
          .gte("created_at", start)
          .order("created_at"),
        supabase.from("table_requests").select("*").eq("handled", false).order("created_at"),
      ]);
      const failed = [c, d, o, r].find((x) => x.error);
      if (failed?.error) throw failed.error;
      return {
        cats: c.data ?? [],
        dishes: d.data ?? [],
        orders: (o.data ?? []) as AdminOrder[],
        requests: r.data ?? [],
      };
    },
    refetchInterval: 20_000, // vangnet als de live-verbinding wegvalt
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
    qc.invalidateQueries({ queryKey: ["settings"] });
  };

  useEffect(() => {
    const ch = supabase
      .channel("beheer")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        setTimeout(() => qc.invalidateQueries({ queryKey: ["admin"] }), 600),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "table_requests" }, () =>
        qc.invalidateQueries({ queryKey: ["admin"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "dishes" }, () =>
        qc.invalidateQueries({ queryKey: ["admin"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: "/beheer" }, replace: true });
  }

  // Cijfers gaan over vandaag; de zaal toont ook tafels die over middernacht heen open staan.
  const todaysOrders = useMemo(() => {
    const start = startOfToday().getTime();
    return (data?.orders ?? []).filter((o) => Date.parse(o.created_at) >= start);
  }, [data?.orders]);
  const stats = useMemo(() => dayStats(todaysOrders), [todaysOrders]);
  const occupied = useMemo(
    () =>
      new Set(
        (data?.orders ?? [])
          .filter((o) => isOpenBill(o) && o.status !== "geannuleerd")
          .map((o) => o.table_number),
      ).size,
    [data?.orders],
  );
  const restaurant = settings?.restaurant_name ?? "Bistro De Houder";
  const openRequests = data?.requests.length ?? 0;
  const [tab, setTab] = useState<Tab>("zaal");
  const [guideHidden, setGuideHidden] = useState(true);
  useEffect(() => setGuideHidden(readStore<boolean>("startgids-verborgen", false)), []);
  function hideGuide() {
    setGuideHidden(true);
    writeStore("startgids-verborgen", true);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <div className="mb-2 h-1.5 w-12 rounded-full bg-oak-gradient" />
          <h1 className="text-4xl font-semibold">Beheer</h1>
          <p className="text-muted-foreground">
            {restaurant}
            {settings &&
              (settings.ordering_open ? (
                <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                  Bestellen open
                </span>
              ) : (
                <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                  Bestellen gepauzeerd
                </span>
              ))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/keuken">
              <ChefHat className="h-4 w-4" /> Keukenscherm
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/demo">
              <MonitorPlay className="h-4 w-4" /> Demo
            </Link>
          </Button>
          <Button variant="ghost" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Uitloggen
          </Button>
        </div>
      </header>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4 no-print">
        <Stat label="Omzet vandaag" value={euro(stats.revenue)} />
        <Stat label="Bestellingen vandaag" value={data ? String(stats.count) : "–"} />
        <Stat
          label="Bezette tafels"
          value={settings ? `${occupied} / ${settings.table_count}` : "–"}
        />
        <Stat
          label="Gem. bereidingstijd"
          value={stats.avgPrepMinutes === null ? "–" : `${stats.avgPrepMinutes} min`}
        />
      </div>

      {!guideHidden && settings && (
        <StartGuide demoMode={settings.demo_mode} onTab={setTab} onHide={hideGuide} />
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="no-print flex h-auto flex-wrap justify-start">
          <TabsTrigger value="zaal">
            Zaal
            {openRequests > 0 && (
              <span className="ml-1.5 rounded-full bg-oak px-1.5 text-xs text-oak-foreground">
                {openRequests}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="menu">Menu</TabsTrigger>
          <TabsTrigger value="tafels">QR-codes</TabsTrigger>
          <TabsTrigger value="cijfers">Cijfers</TabsTrigger>
          <TabsTrigger value="instellingen">Instellingen</TabsTrigger>
        </TabsList>
        <p className="mt-3 text-sm text-muted-foreground no-print">{TAB_HINT[tab]}</p>
        <TabsContent value="zaal">
          {data && settings && (
            <Zaal
              tableCount={settings.table_count}
              orders={data.orders}
              requests={data.requests}
              restaurant={restaurant}
              onChange={refresh}
            />
          )}
        </TabsContent>
        <TabsContent value="menu">
          {data && <MenuEditor cats={data.cats} dishes={data.dishes} onChange={refresh} />}
        </TabsContent>
        <TabsContent value="tafels">
          {settings && (
            <QrTables count={settings.table_count} restaurant={restaurant} onChange={refresh} />
          )}
        </TabsContent>
        <TabsContent value="cijfers">{data && <Stats orders={todaysOrders} />}</TabsContent>
        <TabsContent value="instellingen">
          {settings && <SettingsPanel settings={settings} onChange={refresh} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StartGuide({
  demoMode,
  onTab,
  onHide,
}: {
  demoMode: boolean;
  onTab: (t: Tab) => void;
  onHide: () => void;
}) {
  const steps: { title: string; text: string; action: React.ReactNode; done?: boolean }[] = [
    {
      title: "Kijk je menu na",
      text: "Gerechten, prijzen en allergenen. Uitverkocht? Eén tik en gasten zien het niet meer.",
      action: (
        <Button size="sm" variant="outline" onClick={() => onTab("menu")}>
          Naar menu
        </Button>
      ),
    },
    {
      title: "Print de QR-codes",
      text: "Stel het aantal tafels in en steek elke code in de tafelhouder.",
      action: (
        <Button size="sm" variant="outline" onClick={() => onTab("tafels")}>
          Naar QR-codes
        </Button>
      ),
    },
    {
      title: "Open het keukenscherm op de tablet",
      text: "Zet het geluid aan: nieuwe bestellingen en meldingen komen daar binnen.",
      action: (
        <Button size="sm" variant="outline" asChild>
          <Link to="/keuken">Keukenscherm</Link>
        </Button>
      ),
    },
    {
      title: "Zet de demomodus uit als je live gaat",
      text: "Dan kunnen bestellingen en betalingen niet meer gewist worden.",
      done: !demoMode,
      action: (
        <Button size="sm" variant="outline" onClick={() => onTab("instellingen")}>
          Naar instellingen
        </Button>
      ),
    },
  ];
  return (
    <section
      aria-label="Aan de slag"
      className="relative mb-8 rounded-2xl border bg-secondary/60 p-5 no-print"
    >
      <button
        onClick={onHide}
        aria-label="Startgids verbergen"
        className="absolute right-3 top-3 rounded-full p-2 text-muted-foreground hover:bg-card"
      >
        <X className="h-4 w-4" />
      </button>
      <h2 className="text-xl font-semibold">Aan de slag in 4 stappen</h2>
      <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 rounded-xl bg-card p-4">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-status-done text-primary-foreground" : "bg-accent text-accent-foreground"}`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <p className="font-semibold">{s.title}</p>
            <p className="flex-1 text-sm text-muted-foreground">{s.text}</p>
            <div>{s.action}</div>
          </li>
        ))}
      </ol>
      <Button variant="ghost" size="sm" className="mt-3" onClick={onHide}>
        Ik ken de weg, verberg deze gids
      </Button>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-soft">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
