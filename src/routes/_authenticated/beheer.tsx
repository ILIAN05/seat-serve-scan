import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, LogOut, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALLERGENS, allergenInfo, euro } from "@/lib/menu";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/beheer")({
  head: () => ({
    meta: [
      { title: "Beheer – Bistro De Houder" },
      { name: "description", content: "Beheer menu, tafels, QR-codes en bekijk de omzet van vandaag." },
      { property: "og:title", content: "Beheer – Bistro De Houder" },
      { property: "og:description", content: "Menu, tafels en omzet beheren." },
    ],
  }),
  component: Admin,
});

type Dish = Tables<"dishes">;
type Cat = Tables<"categories">;

function Admin() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["admin"],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const [s, c, d, o] = await Promise.all([
        supabase.from("settings").select("*").eq("id", 1).single(),
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("dishes").select("*").order("sort_order"),
        supabase.from("orders").select("total").gte("created_at", start.toISOString()),
      ]);
      return { settings: s.data, cats: c.data ?? [], dishes: d.data ?? [], orders: o.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin"] });

  async function signOut() {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: "/beheer" }, replace: true });
  }

  const revenue = data?.orders.reduce((s, o) => s + Number(o.total), 0) ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <div className="mb-2 h-1.5 w-12 rounded-full bg-oak-gradient" />
          <h1 className="text-4xl font-semibold">Beheer</h1>
          <p className="text-muted-foreground">{data?.settings?.restaurant_name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/keuken">Keukenscherm</Link></Button>
          <Button variant="ghost" onClick={signOut}><LogOut className="h-4 w-4" /> Uitloggen</Button>
        </div>
      </header>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 no-print">
        <Stat label="Bestellingen vandaag" value={String(data?.orders.length ?? "–")} />
        <Stat label="Omzet vandaag" value={euro(revenue)} />
      </div>

      <Tabs defaultValue="menu">
        <TabsList className="no-print">
          <TabsTrigger value="menu">Menu</TabsTrigger>
          <TabsTrigger value="tafels">Tafels & QR-codes</TabsTrigger>
        </TabsList>
        <TabsContent value="menu">{data && <MenuEditor cats={data.cats} dishes={data.dishes} onChange={refresh} />}</TabsContent>
        <TabsContent value="tafels">{data?.settings && <Tables count={data.settings.table_count} onChange={refresh} />}</TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-soft">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-4xl font-semibold">{value}</p>
    </div>
  );
}

function MenuEditor({ cats, dishes, onChange }: { cats: Cat[]; dishes: Dish[]; onChange: () => void }) {
  const [editing, setEditing] = useState<Partial<Dish> | null>(null);
  const [newCat, setNewCat] = useState("");

  async function addCat() {
    if (!newCat.trim()) return;
    const { error } = await supabase.from("categories").insert({ name: newCat.trim(), sort_order: cats.length + 1 });
    if (error) { toast.error("Categorie toevoegen mislukt"); return; }
    setNewCat(""); onChange();
  }
  async function renameCat(c: Cat) {
    const name = prompt("Nieuwe naam voor categorie", c.name);
    if (!name?.trim()) return;
    await supabase.from("categories").update({ name: name.trim() }).eq("id", c.id); onChange();
  }
  async function delCat(c: Cat) {
    if (!confirm(`Categorie "${c.name}" en alle gerechten erin verwijderen?`)) return;
    await supabase.from("categories").delete().eq("id", c.id); onChange();
  }
  async function toggle(d: Dish, v: boolean) {
    await supabase.from("dishes").update({ available: v }).eq("id", d.id); onChange();
  }
  async function delDish(d: Dish) {
    if (!confirm(`"${d.name}" verwijderen?`)) return;
    await supabase.from("dishes").delete().eq("id", d.id); onChange();
  }

  return (
    <div className="space-y-8 pt-4">
      <div className="flex gap-2">
        <Input placeholder="Nieuwe categorie" value={newCat} onChange={(e) => setNewCat(e.target.value)} className="max-w-xs" />
        <Button variant="outline" onClick={addCat}><Plus className="h-4 w-4" /> Categorie</Button>
        <Button onClick={() => setEditing({ category_id: cats[0]?.id ?? "", allergens: [], available: true, price: 0, name: "", description: "" })} disabled={!cats.length}><Plus className="h-4 w-4" /> Gerecht</Button>
      </div>

      {cats.map((c) => (
        <section key={c.id}>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-2xl font-semibold">{c.name}</h2>
            <Button size="icon" variant="ghost" aria-label="Categorie hernoemen" onClick={() => renameCat(c)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Categorie verwijderen" onClick={() => delCat(c)}><Trash2 className="h-4 w-4" /></Button>
          </div>
          <div className="divide-y rounded-2xl border bg-card">
            {dishes.filter((d) => d.category_id === c.id).map((d) => (
              <div key={d.id} className={`flex items-center gap-4 p-4 ${d.available ? "" : "opacity-60"}`}>
                {d.image_url && <img src={d.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{d.name} <span className="font-normal text-muted-foreground">· {euro(d.price)}</span></p>
                  <p className="truncate text-sm text-muted-foreground">{d.allergens.map((a) => allergenInfo(a).label).join(", ") || "Geen allergenen"}</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={d.available} onCheckedChange={(v) => toggle(d, v)} /> {d.available ? "Beschikbaar" : "Niet beschikbaar"}
                </label>
                <Button size="icon" variant="ghost" aria-label="Bewerken" onClick={() => setEditing(d)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Verwijderen" onClick={() => delDish(d)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {!dishes.some((d) => d.category_id === c.id) && <p className="p-4 text-sm text-muted-foreground">Nog geen gerechten.</p>}
          </div>
        </section>
      ))}

      <DishDialog dish={editing} cats={cats} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChange(); }} />
    </div>
  );
}

function DishDialog({ dish, cats, onClose, onSaved }: { dish: Partial<Dish> | null; cats: Cat[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Dish>>({});
  useEffect(() => { if (dish) setF(dish); }, [dish]);
  const set = (p: Partial<Dish>) => setF((x) => ({ ...x, ...p }));

  async function save() {
    if (!f.name?.trim() || !f.category_id) { toast.error("Naam en categorie zijn verplicht"); return; }
    const row = { name: f.name.trim(), description: f.description ?? "", price: Number(f.price) || 0, allergens: f.allergens ?? [], image_url: f.image_url?.trim() || null, available: f.available ?? true, category_id: f.category_id };
    const { error } = f.id ? await supabase.from("dishes").update(row).eq("id", f.id) : await supabase.from("dishes").insert(row);
    if (error) { toast.error("Opslaan mislukt"); return; }
    toast.success("Opgeslagen"); onSaved();
  }

  return (
    <Dialog open={!!dish} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl">{f.id ? "Gerecht bewerken" : "Nieuw gerecht"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1"><Label>Naam</Label><Input value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="space-y-1"><Label>Beschrijving</Label><Textarea value={f.description ?? ""} onChange={(e) => set({ description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Prijs (€)</Label><Input type="number" step="0.10" min="0" value={f.price ?? 0} onChange={(e) => set({ price: Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label>Categorie</Label>
              <Select value={f.category_id ?? ""} onValueChange={(v) => set({ category_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Foto (link naar afbeelding, optioneel)</Label><Input placeholder="https://…" value={f.image_url ?? ""} onChange={(e) => set({ image_url: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Allergenen</Label>
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((a) => {
                const on = f.allergens?.includes(a.key);
                return (
                  <button key={a.key} type="button" onClick={() => set({ allergens: on ? f.allergens!.filter((x) => x !== a.key) : [...(f.allergens ?? []), a.key] })}
                    className={`rounded-full border px-3 py-1 text-sm transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
                    {a.icon} {a.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2"><Switch checked={f.available ?? true} onCheckedChange={(v) => set({ available: v })} /> Beschikbaar</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Annuleren</Button><Button onClick={save}>Opslaan</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Tables({ count, onChange }: { count: number; onChange: () => void }) {
  const [n, setN] = useState(count);
  const [codes, setCodes] = useState<string[]>([]);
  useEffect(() => {
    const origin = window.location.origin;
    import("qrcode").then(({ default: QRCode }) => Promise.all(Array.from({ length: count }, (_, i) => QRCode.toDataURL(`${origin}/tafel/${i + 1}`, { width: 600, margin: 2, color: { dark: "#3b2a1a", light: "#ffffff" } })))).then(setCodes);
  }, [count]);

  async function save() {
    const v = Math.max(1, Math.min(200, Math.round(n)));
    const { error } = await supabase.from("settings").update({ table_count: v }).eq("id", 1);
    if (error) { toast.error("Opslaan mislukt"); return; }
    toast.success(`Aantal tafels: ${v}`); onChange();
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-end gap-3 no-print">
        <div className="space-y-1"><Label>Aantal tafels</Label><Input type="number" min={1} max={200} value={n} onChange={(e) => setN(Number(e.target.value))} className="w-32" /></div>
        <Button onClick={save}>Opslaan</Button>
        <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Alles printen</Button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
        {codes.map((src, i) => (
          <div key={i} className="flex flex-col items-center rounded-2xl border bg-card p-4 text-center break-inside-avoid">
            <p className="font-display text-sm text-muted-foreground">Bistro De Houder</p>
            <img src={src} alt={`QR-code tafel ${i + 1}`} className="my-2 w-full max-w-48" />
            <p className="font-display text-2xl font-semibold">Tafel {i + 1}</p>
            <p className="text-xs text-muted-foreground">Scan & bestel</p>
            <div className="mt-3 flex gap-1 no-print">
              <Button size="sm" variant="outline" asChild><a href={src} download={`tafel-${i + 1}.png`}><Download className="h-4 w-4" /> PNG</a></Button>
              <Button size="sm" variant="ghost" asChild><Link to="/tafel/$nummer" params={{ nummer: String(i + 1) }} target="_blank">Open</Link></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
