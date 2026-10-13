import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function QrTables({
  count,
  restaurant,
  onChange,
}: {
  count: number;
  restaurant: string;
  onChange: () => void;
}) {
  const [n, setN] = useState(count);
  const [codes, setCodes] = useState<string[]>([]);
  useEffect(() => setN(count), [count]);
  useEffect(() => {
    const origin = window.location.origin;
    import("qrcode")
      .then(({ default: QRCode }) =>
        Promise.all(
          Array.from({ length: count }, (_, i) =>
            QRCode.toDataURL(`${origin}/tafel/${i + 1}`, {
              width: 600,
              margin: 2,
              color: { dark: "#3b2a1a", light: "#ffffff" },
            }),
          ),
        ),
      )
      .then(setCodes);
  }, [count]);

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
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Alles printen
        </Button>
      </div>
      <p className="text-sm text-muted-foreground no-print">
        Print de codes en steek ze in de tafelhouders. Elke code opent het menu voor die tafel.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
        {codes.map((src, i) => (
          <div
            key={i}
            className="flex flex-col items-center rounded-2xl border bg-card p-4 text-center break-inside-avoid"
          >
            <p className="font-display text-sm text-muted-foreground">{restaurant}</p>
            <img src={src} alt={`QR-code tafel ${i + 1}`} className="my-2 w-full max-w-48" />
            <p className="font-display text-2xl font-semibold">Tafel {i + 1}</p>
            <p className="text-xs text-muted-foreground">Scan & bestel</p>
            <div className="mt-3 flex gap-1 no-print">
              <Button size="sm" variant="outline" asChild>
                <a href={src} download={`tafel-${i + 1}.png`}>
                  <Download className="h-4 w-4" /> PNG
                </a>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link to="/tafel/$nummer" params={{ nummer: String(i + 1) }} target="_blank">
                  Open
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
