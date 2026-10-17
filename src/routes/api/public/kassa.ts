import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

/**
 * Kassakoppeling (alleen-lezen). Een kassasysteem haalt hier bestellingen en
 * betalingen op. Vereist de header `Authorization: Bearer <POS_API_KEY>`.
 * GET /api/public/kassa?since=2026-10-17T00:00:00Z
 */
function authorized(request: Request) {
  const key = process.env["POS_API_KEY"];
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!key || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/public/kassa")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Niet geautoriseerd" }, 401);
        const url = new URL(request.url);
        const sinceRaw = url.searchParams.get("since");
        const since = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 24 * 3600_000);
        if (Number.isNaN(since.getTime())) return json({ error: "Ongeldige 'since'-datum" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [orders, payments] = await Promise.all([
          supabaseAdmin
            .from("orders")
            .select(
              "id, table_number, status, total, allergies, created_at, ready_at, paid_at, order_items(dish_name, unit_price, quantity, note)",
            )
            .gte("created_at", since.toISOString())
            .order("created_at")
            .limit(1000),
          supabaseAdmin
            .from("payments")
            .select("id, table_number, amount, method, order_ids, created_at")
            .gte("created_at", since.toISOString())
            .order("created_at")
            .limit(1000),
        ]);
        if (orders.error || payments.error) {
          console.error(orders.error ?? payments.error);
          return json({ error: "Gegevens ophalen mislukt" }, 500);
        }
        return json({ since: since.toISOString(), orders: orders.data, payments: payments.data });
      },
    },
  },
});
