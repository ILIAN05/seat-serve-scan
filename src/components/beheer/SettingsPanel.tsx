import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Eraser, MonitorPlay, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { resetDemo, simulateRush } from "@/lib/demo";
import type { Tables } from "@/integrations/supabase/types";

export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: Tables<"settings">;
  onChange: () => void;
}) {
  const [name, setName] = useState(settings.restaurant_name);
  const [late, setLate] = useState(settings.late_after_minutes);
  const [running, setRunning] = useState<number | null>(null);
  useEffect(() => {
    setName(settings.restaurant_name);
    setLate(settings.late_after_minutes);
  }, [settings.restaurant_name, settings.late_after_minutes]);

  async function update(patch: Partial<Tables<"settings">>, message: string) {
    const { error } = await supabase.from("settings").update(patch).eq("id", 1);
    if (error) {
      toast.error("Opslaan mislukt");
      return;
    }
    toast.success(message);
    onChange();
  }

  async function rush(count: number) {
    setRunning(0);
    try {
      await simulateRush({ count, onProgress: setRunning });
      toast.success(`${count} demobestellingen geplaatst`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(null);
      onChange();
    }
  }

  async function reset() {
    if (
      !confirm(
        "Alle bestellingen en tafelmeldingen van vandaag verwijderen? Handig om de demo opnieuw te starten.",
      )
    )
      return;
    try {
      await resetDemo();
      toast.success("Demo-data van vandaag verwijderd");
    } catch {
      toast.error("Opruimen mislukt. Probeer opnieuw.");
    }
    onChange();
  }

  return (
    <div className="grid gap-6 pt-4 lg:grid-cols-2">
      <section className="space-y-5 rounded-2xl border bg-card p-6">
        <h3 className="text-xl font-semibold">Restaurant</h3>
        <div className="space-y-1">
          <Label htmlFor="r-name">Naam van het restaurant</Label>
          <div className="flex gap-2">
            <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} />
            <Button
              disabled={!name.trim() || name.trim() === settings.restaurant_name}
              onClick={() => update({ restaurant_name: name.trim() }, "Naam opgeslagen")}
            >
              Opslaan
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Verschijnt op de gsm van de gast en op de QR-codes.
          </p>
        </div>
        <label className="flex items-start gap-3">
          <Switch
            className="mt-0.5"
            checked={settings.ordering_open}
            onCheckedChange={(v) =>
              update({ ordering_open: v }, v ? "Bestellen staat open" : "Bestellen gepauzeerd")
            }
          />
          <span>
            <span className="font-medium">Gasten kunnen bestellen</span>
            <span className="block text-sm text-muted-foreground">
              Zet uit bij sluitingstijd of wanneer de keuken het niet meer bijhoudt. Gasten zien dan
              een melding.
            </span>
          </span>
        </label>
        <div className="space-y-1">
          <Label htmlFor="r-late">Bestelling markeren als "te lang" na (minuten)</Label>
          <div className="flex gap-2">
            <Input
              id="r-late"
              type="number"
              min={1}
              max={120}
              value={late}
              onChange={(e) => setLate(Number(e.target.value))}
              className="w-28"
            />
            <Button
              variant="outline"
              disabled={late === settings.late_after_minutes || late < 1 || late > 120}
              onClick={() => update({ late_after_minutes: Math.round(late) }, "Opgeslagen")}
            >
              Opslaan
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border bg-card p-6">
        <h3 className="text-xl font-semibold">Demo</h3>
        <label className="flex items-start gap-3">
          <Switch
            className="mt-0.5"
            checked={settings.demo_mode}
            onCheckedChange={(v) =>
              update({ demo_mode: v }, v ? "Demomodus staat aan" : "Demomodus staat uit")
            }
          />
          <span>
            <span className="font-medium">Demomodus</span>
            <span className="block text-sm text-muted-foreground">
              Laat bezoekers van de startpagina een demotafel openen en staat simuleren en opruimen
              toe. Zet uit zodra het restaurant echt draait: dan kunnen bestellingen en betalingen
              niet meer gewist worden.
            </span>
          </span>
        </label>
        {settings.demo_mode && (
          <p className="text-sm text-muted-foreground">
            Handig om aan een restaurant te tonen: open het keukenscherm en laat bestellingen
            binnenstromen.
          </p>
        )}
        <div className={`flex flex-wrap gap-2 ${settings.demo_mode ? "" : "hidden"}`}>
          <Button onClick={() => rush(6)} disabled={running !== null}>
            <Sparkles className="h-4 w-4" />{" "}
            {running !== null ? `Bezig… ${running}/6` : "Drukke avond simuleren"}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/demo">
              <MonitorPlay className="h-4 w-4" /> Demo-weergave
            </Link>
          </Button>
          <Button variant="outline" onClick={reset}>
            <Eraser className="h-4 w-4" /> Demo opruimen
          </Button>
        </div>
      </section>
    </div>
  );
}
