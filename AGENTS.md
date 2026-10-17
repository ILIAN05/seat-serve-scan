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
- Guests read their table's running bill via the `table_bill(_table)` database function (not by selecting `orders` directly), so `orders` read access can later be restricted to staff without breaking the guest page.
- Order statuses: `ontvangen` → `in_bereiding` → `klaar`, or `geannuleerd`. `paid_at` marks a table as settled ("afgerekend"); `ready_at` is set by a trigger.
- Realtime is a nice-to-have: every screen also polls, so it keeps working if the realtime connection drops.
- All state changes (status, requests, settling, demo reset) go through security-definer database functions (`set_order_status`, `request_service`, `handle_requests`, `settle_table`, `reset_demo`) that check the staff role, allowed transitions and rate limits; the browser never writes `orders`/`table_requests` directly. Why: one server-side place for rules.
- Settling records a row in `payments` with an amount computed in the database. Why: the till/POS export needs a trustworthy payment log.
- The till integration is the read-only route `/api/public/kassa`, authenticated with the `POS_API_KEY` bearer secret. Why: external systems have no staff session.
