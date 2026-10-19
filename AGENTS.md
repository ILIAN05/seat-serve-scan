<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Orders are placed only via the `place_order` database function so prices come from the database, not the browser.
- Staff = users with the `staff` role in `user_roles` (checked via `has_role`); customers are anonymous. Signup is disabled in the UI.
- Every table has a secret code in `table_codes` (staff-only). QR codes link to `/tafel/:nummer?k=<code>`; `place_order`, `table_bill` and `request_service` take `_code` and reject a wrong one (staff need no code). Why: knowing a table number must not let anyone order for, or read the bill of, that table. Staff can issue a new code per table (`regenerate_table_code`); the old QR then stops working.
- Guests read their table's running bill via the `table_bill(_table, _code)` database function (not by selecting `orders` directly), so `orders` read access can later be restricted to staff without breaking the guest page.
- Order statuses: `ontvangen` → `in_bereiding` → `klaar`, or `geannuleerd`. `paid_at` marks a table as settled ("afgerekend"); `ready_at` is set by a trigger.
- Realtime is a nice-to-have: every screen also polls, so it keeps working if the realtime connection drops.
- All state changes (status, requests, settling, ticking off dishes, demo reset) go through security-definer database functions (`set_order_status`, `request_service`, `handle_requests`, `settle_table`, `set_item_done`, `reset_demo`) that check the staff role, allowed transitions and rate limits. `orders`, `order_items`, `table_requests` and `payments` have no insert/update/delete grants for anon or authenticated at all. Why: one server-side place for rules, and a payment log nobody can edit from the browser.
- Limits live in the database and are mirrored in `src/lib/menu.ts` (`MAX_PER_LINE` 20, `MAX_PER_ORDER` 60, 12 orders per table per 10 min). A table's bill is its unpaid orders of the last 12 hours (`BILL_WINDOW_HOURS`); keep both sides equal.
- `settings.demo_mode` gates everything demo-only: `reset_demo`, the public demo table on the start page (`demo_guest_link`) and the rush simulator. Turn it off for a real restaurant.
- Settling records a row in `payments` with an amount computed in the database. Why: the till/POS export needs a trustworthy payment log.
- Kitchen and floor management reuse the same table checkout dialog so payment methods, bill totals and settlement behavior stay consistent.
- The till integration is the read-only route `/api/public/kassa`, authenticated with the `POS_API_KEY` bearer secret. Why: external systems have no staff session.
