alter table public.settings add column if not exists ordering_open boolean not null default true;
alter table public.settings add column if not exists late_after_minutes int not null default 15;
alter table public.settings drop constraint if exists settings_late_after_minutes_check;
alter table public.settings add constraint settings_late_after_minutes_check check (late_after_minutes between 1 and 120);

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('ontvangen','in_bereiding','klaar','geannuleerd'));
alter table public.orders add column if not exists ready_at timestamptz;
alter table public.orders add column if not exists paid_at timestamptz;

create index if not exists orders_created_at_idx on public.orders (created_at);
create index if not exists orders_unpaid_table_idx on public.orders (table_number) where paid_at is null;
create index if not exists order_items_order_id_idx on public.order_items (order_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  if new.status = 'klaar' and old.status is distinct from 'klaar' then
    new.ready_at = now();
  elsif new.status <> 'klaar' then
    new.ready_at = null;
  end if;
  return new;
end $$;

create or replace function public.place_order(_table int, _items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid; _it jsonb; _d record; _total numeric := 0; _max int; _open boolean;
begin
  select table_count, ordering_open into _max, _open from settings where id = 1;
  if not _open then raise exception 'Bestellen is momenteel gesloten'; end if;
  if _table < 1 or _table > _max then raise exception 'Ongeldige tafel'; end if;
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then raise exception 'Leeg mandje'; end if;
  if jsonb_array_length(_items) > 60 then raise exception 'Te veel regels'; end if;
  insert into orders(table_number) values (_table) returning id into _id;
  for _it in select * from jsonb_array_elements(_items) loop
    select * into _d from dishes where id = (_it->>'dish_id')::uuid and available;
    if not found then raise exception 'Gerecht niet beschikbaar'; end if;
    if (_it->>'quantity')::int < 1 or (_it->>'quantity')::int > 50 then raise exception 'Ongeldig aantal'; end if;
    insert into order_items(order_id, dish_id, dish_name, unit_price, quantity, note)
      values (_id, _d.id, _d.name, _d.price, (_it->>'quantity')::int, nullif(left(coalesce(_it->>'note',''),200),''));
    _total := _total + _d.price * (_it->>'quantity')::int;
  end loop;
  update orders set total = _total where id = _id;
  return _id;
end $$;
grant execute on function public.place_order(int, jsonb) to anon, authenticated;

create or replace function public.table_bill(_table int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'status', o.status, 'total', o.total, 'created_at', o.created_at,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', i.id, 'dish_name', i.dish_name, 'unit_price', i.unit_price, 'quantity', i.quantity, 'note', i.note
        ) order by i.dish_name), '[]'::jsonb)
        from order_items i where i.order_id = o.id
      )
    ) order by o.created_at), '[]'::jsonb)
  from orders o
  where o.table_number = _table and o.paid_at is null and o.created_at > now() - interval '12 hours';
$$;
grant execute on function public.table_bill(int) to anon, authenticated;

alter publication supabase_realtime add table public.settings;