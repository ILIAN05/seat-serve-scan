import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALLERGENS, allergenInfo, euro } from "@/lib/menu";
import type { Cat, Dish } from "./types";

/** Verplaatst element `i` één plaats en schrijft de nieuwe volgorde (1, 2, 3, …) weg voor alles wat veranderde. */
async function move<T extends { id: string; sort_order: number }>(
  table: "dishes" | "categories",
  list: T[],
  i: number,
  dir: -1 | 1,
) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  const changes = next
    .map((x, k) => ({ id: x.id, sort_order: k + 1, before: x.sort_order }))
    .filter((x) => x.sort_order !== x.before);
  const results = await Promise.all(
    changes.map((c) => supabase.from(table).update({ sort_order: c.sort_order }).eq("id", c.id)),
  );
  if (results.some((r) => r.error)) toast.error("Volgorde aanpassen mislukt");
}

export function MenuEditor({
  cats,
  dishes,
  onChange,
}: {
  cats: Cat[];
  dishes: Dish[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState<Partial<Dish> | null>(null);
  const [newCat, setNewCat] = useState("");

  async function addCat() {
    if (!newCat.trim()) return;
    const { error } = await supabase.from("categories").insert({
      name: newCat.trim(),
      sort_order: Math.max(0, ...cats.map((c) => c.sort_order)) + 1,
    });
    if (error) {
      toast.error("Categorie toevoegen mislukt");
      return;
    }
    setNewCat("");
    onChange();
  }
  async function renameCat(c: Cat) {
    const name = prompt("Nieuwe naam voor categorie", c.name);
    if (!name?.trim()) return;
    await supabase.from("categories").update({ name: name.trim() }).eq("id", c.id);
    onChange();
  }
  async function delCat(c: Cat) {
    if (!confirm(`Categorie "${c.name}" en alle gerechten erin verwijderen?`)) return;
    await supabase.from("categories").delete().eq("id", c.id);
    onChange();
  }
  async function toggle(d: Dish, v: boolean) {
    const { error } = await supabase.from("dishes").update({ available: v }).eq("id", d.id);
    if (error) {
      toast.error("Wijzigen mislukt");
      return;
    }
    toast.success(
      v
        ? `${d.name} staat weer op het menu`
        : `${d.name} is uitverkocht: gasten zien het niet meer`,
    );
    onChange();
  }
  async function delDish(d: Dish) {
    if (!confirm(`"${d.name}" verwijderen?`)) return;
    await supabase.from("dishes").delete().eq("id", d.id);
    onChange();
  }

  return (
    <div className="space-y-8 pt-4">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Nieuwe categorie"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCat()}
          className="max-w-xs"
        />
        <Button variant="outline" onClick={addCat}>
          <Plus className="h-4 w-4" /> Categorie
        </Button>
        <Button
          onClick={() =>
            setEditing({
              category_id: cats[0]?.id ?? "",
              allergens: [],
              available: true,
              price: 0,
              name: "",
              description: "",
            })
          }
          disabled={!cats.length}
        >
          <Plus className="h-4 w-4" /> Gerecht
        </Button>
      </div>

      {cats.map((c, ci) => {
        const list = dishes.filter((d) => d.category_id === c.id);
        return (
          <section key={c.id}>
            <div className="mb-3 flex flex-wrap items-center gap-1">
              <h2 className="mr-2 text-2xl font-semibold">{c.name}</h2>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Categorie hoger"
                disabled={ci === 0}
                onClick={async () => {
                  await move("categories", cats, ci, -1);
                  onChange();
                }}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Categorie lager"
                disabled={ci === cats.length - 1}
                onClick={async () => {
                  await move("categories", cats, ci, 1);
                  onChange();
                }}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Categorie hernoemen"
                onClick={() => renameCat(c)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Categorie verwijderen"
                onClick={() => delCat(c)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="divide-y rounded-2xl border bg-card">
              {list.map((d, di) => (
                <div
                  key={d.id}
                  className={`flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap ${d.available ? "" : "opacity-60"}`}
                >
                  <div className="flex flex-col">
                    <button
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      aria-label={`${d.name} hoger`}
                      disabled={di === 0}
                      onClick={async () => {
                        await move("dishes", list, di, -1);
                        onChange();
                      }}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                      aria-label={`${d.name} lager`}
                      disabled={di === list.length - 1}
                      onClick={async () => {
                        await move("dishes", list, di, 1);
                        onChange();
                      }}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </div>
                  {d.image_url && (
                    <img src={d.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {d.name}{" "}
                      <span className="font-normal text-muted-foreground">· {euro(d.price)}</span>
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {d.allergens.map((a) => allergenInfo(a).label).join(", ") ||
                        "Geen allergenen"}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={d.available} onCheckedChange={(v) => toggle(d, v)} />{" "}
                    {d.available ? "Beschikbaar" : "Uitverkocht"}
                  </label>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${d.name} bewerken`}
                    onClick={() => setEditing(d)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`${d.name} verwijderen`}
                    onClick={() => delDish(d)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {!list.length && (
                <p className="p-4 text-sm text-muted-foreground">Nog geen gerechten.</p>
              )}
            </div>
          </section>
        );
      })}

      <DishDialog
        dish={editing}
        cats={cats}
        dishes={dishes}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onChange();
        }}
      />
    </div>
  );
}

function DishDialog({
  dish,
  cats,
  dishes,
  onClose,
  onSaved,
}: {
  dish: Partial<Dish> | null;
  cats: Cat[];
  dishes: Dish[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Dish>>({});
  useEffect(() => {
    if (dish) setF(dish);
  }, [dish]);
  const set = (p: Partial<Dish>) => setF((x) => ({ ...x, ...p }));

  async function save() {
    if (!f.name?.trim() || !f.category_id) {
      toast.error("Naam en categorie zijn verplicht");
      return;
    }
    const price = Math.round((Number(f.price) || 0) * 100) / 100;
    if (price < 0) {
      toast.error("De prijs kan niet negatief zijn");
      return;
    }
    const row = {
      name: f.name.trim(),
      description: f.description?.trim() ?? "",
      price,
      allergens: f.allergens ?? [],
      image_url: f.image_url?.trim() || null,
      available: f.available ?? true,
      category_id: f.category_id,
    };
    const movedCategory = f.id && dishes.find((d) => d.id === f.id)?.category_id !== f.category_id;
    const sortOrder =
      Math.max(
        0,
        ...dishes.filter((d) => d.category_id === f.category_id).map((d) => d.sort_order),
      ) + 1;
    const { error } = f.id
      ? await supabase
          .from("dishes")
          .update(movedCategory ? { ...row, sort_order: sortOrder } : row)
          .eq("id", f.id)
      : await supabase.from("dishes").insert({ ...row, sort_order: sortOrder });
    if (error) {
      toast.error("Opslaan mislukt");
      return;
    }
    toast.success("Opgeslagen");
    onSaved();
  }

  return (
    <Dialog open={!!dish} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {f.id ? "Gerecht bewerken" : "Nieuw gerecht"}
          </DialogTitle>
          <DialogDescription>
            Wijzigingen zijn meteen zichtbaar op de gsm's van je gasten.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="d-name">Naam</Label>
            <Input
              id="d-name"
              value={f.name ?? ""}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="d-desc">Beschrijving</Label>
            <Textarea
              id="d-desc"
              value={f.description ?? ""}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="d-price">Prijs (€)</Label>
              <Input
                id="d-price"
                type="number"
                inputMode="decimal"
                step="0.10"
                min="0"
                value={f.price ?? 0}
                onChange={(e) => set({ price: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label>Categorie</Label>
              <Select value={f.category_id ?? ""} onValueChange={(v) => set({ category_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="d-img">Foto (link naar afbeelding, optioneel)</Label>
            <Input
              id="d-img"
              placeholder="https://…"
              value={f.image_url ?? ""}
              onChange={(e) => set({ image_url: e.target.value })}
            />
            {f.image_url?.startsWith("http") && (
              <img
                src={f.image_url}
                alt="Voorbeeld"
                className="mt-2 h-24 w-24 rounded-lg object-cover"
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Allergenen</Label>
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((a) => {
                const on = f.allergens?.includes(a.key);
                return (
                  <button
                    key={a.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set({
                        allergens: on
                          ? f.allergens!.filter((x) => x !== a.key)
                          : [...(f.allergens ?? []), a.key],
                      })
                    }
                    className={`rounded-full border px-3 py-1 text-sm transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}
                  >
                    {a.icon} {a.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2">
            <Switch checked={f.available ?? true} onCheckedChange={(v) => set({ available: v })} />{" "}
            Beschikbaar
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={save}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
