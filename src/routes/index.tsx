import { createFileRoute, Link } from "@tanstack/react-router";
import { ChefHat, QrCode, Settings } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bistro De Houder – Bestellen aan tafel" },
      { name: "description", content: "Scan de QR-code op je tafel, bekijk het menu en bestel meteen vanaf je gsm." },
      { property: "og:title", content: "Bistro De Houder – Bestellen aan tafel" },
      { property: "og:description", content: "Scan, kies en bestel vanaf je gsm. Je bestelling gaat rechtstreeks naar de keuken." },
    ],
  }),
  component: Index,
});

function Index() {
  const tiles = [
    { to: "/tafel/$nummer" as const, params: { nummer: "7" }, icon: QrCode, title: "Klantenpagina", text: "Zo ziet een gast het menu na het scannen (tafel 7)." },
    { to: "/keuken" as const, icon: ChefHat, title: "Keukenscherm", text: "Live binnenkomende bestellingen en meldingen." },
    { to: "/beheer" as const, icon: Settings, title: "Beheer", text: "Menu, tafels, QR-codes en omzet van vandaag." },
  ];
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <div className="mb-3 h-2 w-16 rounded-full bg-oak-gradient" />
      <h1 className="text-5xl font-semibold tracking-tight md:text-6xl">Bistro De Houder</h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Scan de QR-code op je tafel, kies rustig uit het menu en bestel meteen vanaf je gsm.
      </p>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.title} to={t.to} params={"params" in t ? t.params : undefined} className="group rounded-2xl border bg-card p-6 shadow-soft transition hover:-translate-y-0.5">
            <div className="mb-4 inline-flex rounded-xl bg-accent p-3 text-accent-foreground"><t.icon className="h-6 w-6" /></div>
            <h2 className="text-xl font-semibold">{t.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.text}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
