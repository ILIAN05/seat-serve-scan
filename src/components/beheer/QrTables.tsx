import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, Printer, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Publiek adres van de app, ook als beheer in een preview geopend wordt. */
const PUBLIC_ORIGIN = "https://seat-serve-scan.lovable.app";

const isPreview = (origin: string) =>
  /lovableproject\.com|id-preview--|localhost|127\.0\.0\.1/.test(origin);

/** Link die in de QR-code van een tafel komt. */
const tableUrl = (origin: string, table: number, code: string) =>
  `${origin}/tafel/${table}?k=${encodeURIComponent(code)}`;

export function QrTables({
  count,
  restaurant,
  onChange,
}: {
  count: number;
  restaurant: string;
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const [n, setN] = useState(count);
  const [origin, setOrigin] = useState(PUBLIC_ORIGIN);
  const [images, setImages] = useState<Record<number, string>>({});
  useEffect(() => setN(count), [count]);
  useEffect(() => {
    const own = window.location.origin;
    setOrigin(isPreview(own) ? PUBLIC_ORIGIN : own);
  }, []);

  const { data: codes } = useQuery({
    queryKey: ["table-codes", count],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_codes")
        .select("table_number, code")
        .lte("table_number", count)
        .order("table_number");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!codes) return;
    let cancelled = false;
    import("qrcode")
      .then(({ default: QRCode }) =>
        Promise.all(
          codes.map(async (c) => {
            const src = await QRCode.toDataURL(tableUrl(origin, c.table_number, c.code), {
              width: 600,
              margin: 2,
              errorCorrectionLevel: "M",
              color: { dark: "#3b2a1a", light: "#ffffff" },
            });
            return [c.table_number, src] as const;
          }),
        ),
      )
      .then((pairs) => !cancelled && setImages(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [codes, origin]);

  async function save() {
    const v = Math.max(1, Math.min(200, Math.round(n)));
    const { error } = await supabase.from("settings").update({ table_count: v }).eq("id", 1);
    if (error) {
      toast.error("Opslaan mislukt");
      return;
    }
    toast.success(`Aantal tafels: ${v}`);
    onChange();
  }

  async function regenerate(table: number) {
    if (
      !confirm(
        `Nieuwe QR-code voor tafel ${table} maken? De huidige code van deze tafel werkt daarna niet meer: print de nieuwe en vervang hem in de tafelhouder.`,
      )
    )
      return;
    const { error } = await supabase.rpc("regenerate_table_code", { _table: table });
    if (error) {
      toast.error("Nieuwe code maken mislukt");
      return;
    }
    toast.success(`Tafel ${table} heeft een nieuwe QR-code`);
    qc.invalidateQueries({ queryKey: ["table-codes"] });
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-end gap-3 no-print">
        <div className="space-y-1">
          <Label htmlFor="tafels">Aantal tafels</Label>
          <Input
            id="tafels"
            type="number"
            min={1}
            max={200}
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            className="w-32"
          />
        </div>
        <Button onClick={save} disabled={n === count}>
          Opslaan
        </Button>
        <Button variant="outline" onClick={() => window.print()} disabled={!codes}>
          <Printer className="h-4 w-4" /> Alle QR-codes printen
        </Button>
      </div>
      <div className="space-y-1 text-sm text-muted-foreground no-print">
        <p>
          Print de codes en steek ze in de tafelhouders. Elke code bevat een geheime tafelcode:
          alleen wie aan de tafel zit, kan bestellen of de rekening van die tafel zien.
        </p>
        <p>
          Codes verwijzen naar <span className="font-medium text-foreground">{origin}</span>. Ligt
          een code ergens rond of werd ze gefotografeerd? Maak voor die tafel een nieuwe.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
        {(codes ?? []).map(({ table_number: t }) => {
          const src = images[t];
          return (
            <div
              key={t}
              className="flex flex-col items-center rounded-2xl border bg-card p-4 text-center break-inside-avoid"
            >
              <p className="font-display text-sm text-muted-foreground">{restaurant}</p>
              {src ? (
                <img src={src} alt={`QR-code tafel ${t}`} className="my-2 w-full max-w-48" />
              ) : (
                <div className="my-2 aspect-square w-full max-w-48 animate-pulse rounded-lg bg-muted" />
              )}
              <p className="font-display text-2xl font-semibold">Tafel {t}</p>
              <p className="text-xs text-muted-foreground">
                Scan met de camera van je gsm en bestel
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-1 no-print">
                <Button size="sm" variant="outline" asChild disabled={!src}>
                  <a href={src} download={`tafel-${t}.png`}>
                    <Download className="h-4 w-4" /> PNG
                  </a>
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <Link
                    to="/tafel/$nummer"
                    params={{ nummer: String(t) }}
                    search={{ k: codes!.find((c) => c.table_number === t)!.code }}
                    target="_blank"
                  >
                    Bekijk als gast
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Nieuwe QR-code voor tafel ${t}`}
                  title="Maak een nieuwe code als de oude ergens rondslingert"
                  onClick={() => regenerate(t)}
                >
                  <RefreshCw className="h-4 w-4" /> Nieuwe code
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
