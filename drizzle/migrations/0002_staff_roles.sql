create type public.app_role as enum ('staff');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

insert into public.user_roles (user_id, role) select id, 'staff' from auth.users on conflict do nothing;

drop policy "staff write categories" on public.categories;
create policy "staff write categories" on public.categories for all to authenticated
  using (public.has_role(auth.uid(), 'staff')) with check (public.has_role(auth.uid(), 'staff'));

drop policy "staff all dishes" on public.dishes;
create policy "staff all dishes" on public.dishes for all to authenticated
  using (public.has_role(auth.uid(), 'staff')) with check (public.has_role(auth.uid(), 'staff'));
create policy "signed-in read available dishes" on public.dishes for select to authenticated using (available);

drop policy "public read orders" on public.orders;
drop policy "staff update orders" on public.orders;
drop policy "staff delete orders" on public.orders;
create policy "staff read orders" on public.orders for select to authenticated using (public.has_role(auth.uid(), 'staff'));
create policy "staff update orders" on public.orders for update to authenticated
  using (public.has_role(auth.uid(), 'staff')) with check (public.has_role(auth.uid(), 'staff'));
create policy "staff delete orders" on public.orders for delete to authenticated using (public.has_role(auth.uid(), 'staff'));

drop policy "public read order items" on public.order_items;
create policy "staff read order items" on public.order_items for select to authenticated using (public.has_role(auth.uid(), 'staff'));

drop policy "staff update settings" on public.settings;
create policy "staff update settings" on public.settings for update to authenticated
  using (public.has_role(auth.uid(), 'staff')) with check (public.has_role(auth.uid(), 'staff'));

drop policy "staff read requests" on public.table_requests;
drop policy "staff update requests" on public.table_requests;
drop policy "staff delete requests" on public.table_requests;
create policy "staff read requests" on public.table_requests for select to authenticated using (public.has_role(auth.uid(), 'staff'));
create policy "staff update requests" on public.table_requests for update to authenticated
  using (public.has_role(auth.uid(), 'staff')) with check (public.has_role(auth.uid(), 'staff'));
create policy "staff delete requests" on public.table_requests for delete to authenticated using (public.has_role(auth.uid(), 'staff'));