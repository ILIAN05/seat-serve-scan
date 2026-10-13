import { useMemo } from "react";
import { dayStats, euro } from "@/lib/menu";
import type { AdminOrder } from "./types";

export function Stats({ orders }: { orders: AdminOrder[] }) {
  const s = useMemo(() => dayStats(orders), [orders]);
  const maxHour = Math.max(1, ...s.perHour.map((h) => h.revenue));
  const maxQty = Math.max(1, ...s.topDishes.map((d) => d.quantity));

  if (!orders.length)
    return (
      <p className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
        Nog geen bestellingen vandaag. Tip: simuleer een drukke avond via Instellingen.
      </p>
    );

  return (
    <div className="grid gap-6 pt-4 lg:grid-cols-2">
      <section className="rounded-2xl border bg-card p-6">
        <h3 className="mb-1 text-xl font-semibold">Omzet per uur</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Op basis van het tijdstip van bestellen
        </p>
        <div
          className="flex h-48 items-end gap-2"
          role="img"
          aria-label="Staafdiagram van de omzet per uur"
        >
          {s.perHour.map((h) => (
            <div
              key={h.hour}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="text-xs font-medium tabular-nums">
                {h.revenue ? euro(h.revenue).replace(",00", "") : ""}
              </span>
              <div
                className="w-full max-w-12 rounded-t-md bg-chart-2"
                style={{ height: `${(h.revenue / maxHour) * 100}%`, minHeight: h.revenue ? 4 : 0 }}
              />
              <span className="text-xs text-muted-foreground">
                {String(h.hour).padStart(2, "0")}u
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-6">
        <h3 className="mb-4 text-xl font-semibold">Populairste gerechten</h3>
        <ol className="space-y-3">
          {s.topDishes.slice(0, 8).map((d, i) => (
            <li key={d.name}>
              <div className="flex justify-between text-sm">
                <span>
                  <span className="text-muted-foreground">{i + 1}.</span> {d.name}
                </span>
                <span className="tabular-nums">
                  {d.quantity}× · {euro(d.revenue)}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-chart-1"
                  style={{ width: `${(d.quantity / maxQty) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="grid grid-cols-2 gap-4 rounded-2xl border bg-card p-6 sm:grid-cols-4 lg:col-span-2">
        <Kpi label="Gemiddeld per bestelling" value={euro(s.average)} />
        <Kpi
          label="Gem. bereidingstijd"
          value={s.avgPrepMinutes === null ? "–" : `${s.avgPrepMinutes} min`}
        />
        <Kpi label="Bestellingen" value={String(s.count)} />
        <Kpi label="Geannuleerd" value={String(s.cancelled)} />
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
