import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { ChefHat, LogOut, MonitorPlay } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNow, useSettings } from "@/lib/hooks";
import { dayStats, euro, startOfToday } from "@/lib/menu";
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

function Admin() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  useNow(30_000); // ververst "x min geleden" in het zaaloverzicht
  const { data: settings } = useSettings();
  const { data } = useQuery({
    queryKey: ["admin"],
    queryFn: async () => {
      const start = startOfToday().toISOString();
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

  const stats = useMemo(() => dayStats(data?.orders ?? []), [data?.orders]);
  const occupied = useMemo(
    () =>
      new Set(
        (data?.orders ?? [])
          .filter((o) => !o.paid_at && o.status !== "geannuleerd")
          .map((o) => o.table_number),
      ).size,
    [data?.orders],
  );
  const restaurant = settings?.restaurant_name ?? "Bistro De Houder";
  const openRequests = data?.requests.length ?? 0;

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

      <Tabs defaultValue="zaal">
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
        <TabsContent value="cijfers">{data && <Stats orders={data.orders} />}</TabsContent>
        <TabsContent value="instellingen">
          {settings && <SettingsPanel settings={settings} onChange={refresh} />}
        </TabsContent>
      </Tabs>
    </div>
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
