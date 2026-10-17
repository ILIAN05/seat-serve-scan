import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, Printer, Receipt, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  billLines,
  billTotal,
  euro,
  isOpenBill,
  minutesSince,
  duurLabel,
  STATUS_LABEL,
  tijd,
  type BillOrder,
} from "@/lib/menu";
import type { AdminOrder, AdminRequest } from "./types";

type Method = "kaart" | "cash" | "payconiq";
const METHOD_LABEL: Record<Method, string> = { kaart: "Kaart", cash: "Cash", payconiq: "Payconiq" };

type TableState = {
  table: number;
  orders: AdminOrder[];
  requests: AdminRequest[];
  total: number;
  since: string | null;
};

export function Zaal({
  tableCount,
  orders,
  requests,
  restaurant,
  onChange,
}: {
  tableCount: number;
  orders: AdminOrder[];
  requests: AdminRequest[];
  restaurant: string;
  onChange: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const tables = useMemo<TableState[]>(
    () =>
      Array.from({ length: tableCount }, (_, i) => {
        const t = i + 1;
        const own = orders.filter((o) => o.table_number === t && isOpenBill(o));
        return {
          table: t,
          orders: own,
          requests: requests.filter((r) => r.table_number === t),
          total: billTotal(own),
          since: own[0]?.created_at ?? null,
        };
      }),
    [tableCount, orders, requests],
  );
  const busy = tables.filter((t) => t.orders.length);
  const current = tables.find((t) => t.table === selected) ?? null;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">
          {busy.length} van {tableCount} tafels bezet · openstaand{" "}
          {euro(busy.reduce((s, t) => s + t.total, 0))}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded border-2 border-dashed" /> Vrij
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded border-2 border-primary/40 bg-card" /> Bezet
          </span>
          <span className="flex items-center gap-1.5">
            <Bell className="h-4 w-4 text-oak" /> Ober geroepen
          </span>
          <span className="flex items-center gap-1.5">
            <Receipt className="h-4 w-4 text-oak" /> Vraagt de rekening
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {tables.map((t) => {
          const occupied = t.orders.length > 0;
          const cooking = t.orders.filter(
            (o) => o.status === "ontvangen" || o.status === "in_bereiding",
          ).length;
          const wantsBill = t.requests.some((r) => r.type === "rekening");
          const wantsWaiter = t.requests.some((r) => r.type === "ober");
          return (
            <button
              key={t.table}
              onClick={() => setSelected(t.table)}
              className={`relative flex min-h-32 flex-col rounded-2xl border-2 p-4 text-left transition hover:-translate-y-0.5 ${wantsBill || wantsWaiter ? "border-oak bg-card shadow-soft" : occupied ? "border-primary/40 bg-card shadow-soft" : "border-dashed bg-transparent"}`}
            >
              <div className="flex items-start justify-between">
                <span className="font-display text-2xl font-semibold">Tafel {t.table}</span>
                <span className="flex gap-1">
                  {wantsWaiter && <Bell className="h-5 w-5 text-oak" aria-label="Ober geroepen" />}
                  {wantsBill && (
                    <Receipt className="h-5 w-5 text-oak" aria-label="Vraagt de rekening" />
                  )}
                </span>
              </div>
              {occupied ? (
                <>
                  <span className="mt-auto text-xl font-semibold">{euro(t.total)}</span>
                  <span className="text-sm text-muted-foreground">
                    {cooking ? `${cooking} in de keuken` : "alles klaar"} ·{" "}
                    {duurLabel(minutesSince(t.since!))}
                  </span>
                </>
              ) : (
                <span className="mt-auto text-sm text-muted-foreground">Vrij</span>
              )}
            </button>
          );
        })}
      </div>
      <TableDialog
        state={current}
        restaurant={restaurant}
        onClose={() => setSelected(null)}
        onChange={onChange}
      />
    </div>
  );
}

function TableDialog({
  state,
  restaurant,
  onClose,
  onChange,
}: {
  state: TableState | null;
  restaurant: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const lines = state
    ? billLines(
        state.orders.map((o) => ({
          id: o.id,
          status: o.status as BillOrder["status"],
          total: Number(o.total),
          created_at: o.created_at,
          items: o.order_items.map((i) => ({ ...i, unit_price: Number(i.unit_price) })),
        })),
      )
    : [];
  const stillCooking = state?.orders.some(
    (o) => o.status === "ontvangen" || o.status === "in_bereiding",
  );

  const [method, setMethod] = useState<Method>("kaart");

  async function settle() {
    if (!state) return;
    if (stillCooking && !confirm("Er zijn nog bestellingen in de keuken. Toch afrekenen?")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("settle_table", {
      _table: state.table,
      _method: method,
    });
    setBusy(false);
    if (error) {
      toast.error(
        /niets af te rekenen/i.test(error.message)
          ? "Deze tafel heeft niets meer openstaan."
          : "Afrekenen mislukt. Probeer opnieuw.",
      );
      onChange();
      return;
    }
    // Het bedrag komt van de server: dat is wat in het betalingslog staat.
    const amount = Number((data as { amount?: number | string } | null)?.amount ?? state.total);
    toast.success(
      `Tafel ${state.table} afgerekend met ${METHOD_LABEL[method]} (${euro(amount)}). De tafel is weer vrij.`,
    );
    onChange();
    onClose();
  }

  async function handleRequests() {
    if (!state) return;
    const { error } = await supabase.rpc("handle_requests", { _table: state.table });
    if (error) toast.error("Afhandelen mislukt. Probeer opnieuw.");
    onChange();
  }

  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto print:max-h-none print:border-0 print:shadow-none">
        {state && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-3xl">Tafel {state.table}</DialogTitle>
              <DialogDescription>
                {state.orders.length
                  ? `${state.orders.length} bestelling${state.orders.length === 1 ? "" : "en"} sinds ${tijd(state.since!)}`
                  : "Deze tafel is vrij."}
              </DialogDescription>
            </DialogHeader>

            {state.requests.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-oak bg-secondary p-3 no-print">
                <span className="text-sm">
                  {state.requests
                    .map(
                      (r) =>
                        (r.type === "ober" ? "Ober geroepen" : "Vraagt de rekening") +
                        ` (${tijd(r.created_at)})`,
                    )
                    .join(" · ")}
                </span>
                <Button size="sm" variant="outline" onClick={handleRequests}>
                  Afgehandeld
                </Button>
              </div>
            )}

            {state.orders.length > 0 && (
              <>
                <div className="space-y-2 no-print">
                  {state.orders.map((o) => (
                    <div
                      key={o.id}
                      className={`rounded-xl border p-3 text-sm ${o.status === "geannuleerd" ? "opacity-50" : ""}`}
                    >
                      <div className="mb-1 flex justify-between font-semibold">
                        <span>{tijd(o.created_at)}</span>
                        <span>{STATUS_LABEL[o.status]}</span>
                      </div>
                      {o.order_items.map((i) => (
                        <p key={i.id}>
                          {i.quantity}× {i.dish_name}
                          {i.note ? (
                            <span className="italic text-muted-foreground"> – {i.note}</span>
                          ) : null}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border p-4" id="rekening">
                  <p className="hidden text-center font-display text-xl print:block">
                    {restaurant}
                  </p>
                  <p className="mb-2 hidden text-center text-sm print:block">
                    Tafel {state.table} · {new Date().toLocaleString("nl-BE")}
                  </p>
                  {lines.map((l) => (
                    <div key={`${l.name}-${l.unit}`} className="flex justify-between py-0.5">
                      <span>
                        {l.quantity}× {l.name}
                      </span>
                      <span>{euro(l.unit * l.quantity)}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex justify-between border-t pt-2 text-lg font-semibold">
                    <span>Totaal</span>
                    <span>{euro(state.total)}</span>
                  </div>
                </div>
              </>
            )}

            <DialogFooter className="gap-2 no-print">
              {state.orders.length > 0 && (
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Afdrukken
                </Button>
              )}
              {state.orders.length > 0 && (
                <div
                  className="flex gap-1 rounded-lg border p-1"
                  role="radiogroup"
                  aria-label="Betaalmethode"
                >
                  {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant={method === m ? "default" : "ghost"}
                      role="radio"
                      aria-checked={method === m}
                      onClick={() => setMethod(m)}
                    >
                      {METHOD_LABEL[m]}
                    </Button>
                  ))}
                </div>
              )}
              {state.orders.length > 0 && (
                <Button onClick={settle} disabled={busy}>
                  <Wallet className="h-4 w-4" /> Afrekenen · {euro(state.total)}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
