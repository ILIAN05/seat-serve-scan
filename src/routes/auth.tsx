import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect:
      typeof s["redirect"] === "string" &&
      s["redirect"].startsWith("/") &&
      !s["redirect"].startsWith("//")
        ? s["redirect"]
        : "/keuken",
  }),
  head: () => ({
    meta: [
      { title: "Inloggen personeel – Bistro De Houder" },
      { name: "description", content: "Log in voor het keukenscherm en het beheer." },
      { property: "og:title", content: "Inloggen personeel – Bistro De Houder" },
      { property: "og:description", content: "Toegang voor keuken en beheer." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("Inloggen mislukt. Controleer je e-mail en wachtwoord.");
      return;
    }
    navigate({ to: redirect });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-3xl border bg-card p-8 shadow-soft"
      >
        <div>
          <div className="mb-3 h-1.5 w-12 rounded-full bg-oak-gradient" />
          <h1 className="text-3xl font-semibold">Inloggen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Alleen voor personeel van Bistro De Houder. Daarna ga je naar{" "}
            {redirect.startsWith("/beheer")
              ? "het beheer"
              : redirect.startsWith("/demo")
                ? "de demo"
                : "het keukenscherm"}
            .
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">Wachtwoord</Label>
          <Input
            id="pw"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy ? "Bezig met inloggen…" : "Inloggen"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Geen account of wachtwoord vergeten? Vraag het aan de eigenaar van het restaurant.
        </p>
        <p className="text-center text-sm">
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            Terug naar de startpagina
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Ben je gast? Dan heb je geen login nodig: scan de QR-code op je tafel.
        </p>
      </form>
    </main>
  );
}
