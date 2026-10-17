import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ChefHat,
  MonitorPlay,
  QrCode,
  ScanLine,
  Settings,
  ShoppingBag,
  Utensils,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bistro De Houder – Bestellen aan tafel" },
      {
        name: "description",
        content: "Scan de QR-code op je tafel, bekijk het menu en bestel meteen vanaf je gsm.",
      },
      { property: "og:title", content: "Bistro De Houder – Bestellen aan tafel" },
      {
        property: "og:description",
        content:
          "Scan, kies en bestel vanaf je gsm. Je bestelling gaat rechtstreeks naar de keuken.",
      },
    ],
  }),
  component: Index,
});

const STEPS = [
  {
    icon: ScanLine,
    title: "Scan",
    text: "De gast scant de QR-code in de tafelhouder. Geen app nodig.",
  },
  {
    icon: ShoppingBag,
    title: "Bestel",
    text: "Menu met allergenen, opmerkingen per gerecht en live status.",
  },
  {
    icon: ChefHat,
    title: "Bereid",
    text: "De bestelling verschijnt meteen op de tablet in de keuken, met geluid.",
  },
  {
    icon: Utensils,
    title: "Reken af",
    text: "De zaal ziet per tafel wat open staat en rekent af met één tik.",
  },
];

function Index() {
  // In demomodus geeft de server de QR-link van één demotafel vrij; anders verdwijnt die tegel.
  const { data: demo } = useQuery({
    queryKey: ["demo-guest-link"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("demo_guest_link");
      if (error) return null;
      return data as { table: number; code: string };
    },
  });
  const guestTile = demo
    ? [
        {
          to: "/tafel/$nummer" as const,
          params: { nummer: String(demo.table) },
          search: { k: demo.code },
          icon: QrCode,
          title: "Gast",
          text: `Zo ziet een gast het menu na het scannen (tafel ${demo.table}).`,
        },
      ]
    : [];
  const tiles = [
    ...guestTile,
    {
      to: "/keuken" as const,
      icon: ChefHat,
      title: "Keuken",
      text: "Live binnenkomende bestellingen, timers en meldingen.",
    },
    {
      to: "/beheer" as const,
      icon: Settings,
      title: "Beheer",
      text: "Zaaloverzicht, afrekenen, menu, QR-codes en cijfers.",
    },
    {
      to: "/demo" as const,
      icon: MonitorPlay,
      title: "Demo",
      text: "Gast en keuken naast elkaar, met een gesimuleerde drukke avond.",
    },
  ];
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <div className="mb-3 h-2 w-16 rounded-full bg-oak-gradient" />
      <h1 className="text-5xl font-semibold tracking-tight md:text-6xl">Bistro De Houder</h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Scan de QR-code op je tafel, kies rustig uit het menu en bestel meteen vanaf je gsm. De
        keuken krijgt je bestelling live binnen.
      </p>

      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-2xl bg-secondary/60 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-card text-foreground">
                {i + 1}
              </span>
              <s.icon className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
          </li>
        ))}
      </ol>

      <h2 className="mt-14 text-2xl font-semibold">Probeer het zelf</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.title}
            to={t.to}
            params={("params" in t ? t.params : {}) as never}
            search={("search" in t ? t.search : {}) as never}
            className="group rounded-2xl border bg-card p-6 shadow-soft transition hover:-translate-y-0.5"
          >
            <div className="mb-4 inline-flex rounded-xl bg-accent p-3 text-accent-foreground">
              <t.icon className="h-6 w-6" />
            </div>
            <h3 className="font-sans text-xl font-semibold">{t.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t.text}</p>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Keuken, beheer en demo vragen een personeelslogin.
      </p>
    </main>
  );
}
