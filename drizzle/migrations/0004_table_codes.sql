-- Professioneel prototype:
--  * geheime code per tafel in de QR-code (wie enkel het tafelnummer kent, kan niet bestellen of meekijken)
--  * ruimere bestellimiet per tafel (meerdere gsm's aan één tafel)
--  * demomodus: "demo opruimen" en de publieke demotafel werken enkel als die aan staat
--  * personeel schrijft bestellingen, meldingen en betalingen enkel nog via de databasefuncties
--  * afgevinkte gerechten in de keuken worden op de server bewaard (alle tablets zien hetzelfde)

alter table public.settings add column if not exists demo_mode boolean not null default true;
alter table public.settings drop constraint if exists settings_table_count_check;
alter table public.settings add constraint settings_table_count_check check (table_count between 1 and 200);

alter table public.order_items add column if not exists done boolean not null default false;

-- ---------- Tafelcodes ----------

create or replace function public.new_table_code() returns text language sql volatile set search_path = public as $$
  select left(replace(gen_random_uuid()::text, '-', ''), 20)
$$;

create table if not exists public.table_codes (
  table_number int primary key check (table_number between 1 and 200),
  code text not null default public.new_table_code(),
  updated_at timestamptz not null default now()
);
grant select on public.table_codes to authenticated;
grant all on public.table_codes to service_role;
alter table public.table_codes enable row level security;
drop policy if exists "staff read table codes" on public.table_codes;
create policy "staff read table codes" on public.table_codes for select to authenticated
  using (public.has_role(auth.uid(), 'staff'));

create or replace function public.sync_table_codes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into table_codes (table_number)
    select generate_series(1, new.table_count)
    on conflict (table_number) do nothing;
  return new;
end $$;
drop trigger if exists settings_sync_table_codes on public.settings;
create trigger settings_sync_table_codes after insert or update of table_count on public.settings
  for each row execute function public.sync_table_codes();
insert into public.table_codes (table_number)
  select generate_series(1, (select table_count from public.settings where id = 1))
  on conflict (table_number) do nothing;

/** Controleert tafelnummer en tafelcode. Personeel heeft geen code nodig. */
create or replace function public.check_table_access(_table integer, _code text)
returns void language plpgsql stable security definer set search_path = public as $$
declare _max int;
begin
  select table_count into _max from settings where id = 1;
  if _table is null or _table < 1 or _table > _max then raise exception 'Ongeldige tafel'; end if;
  if public.has_role(auth.uid(), 'staff') then return; end if;
  if _code is null or not exists (select 1 from table_codes where table_number = _table and code = _code) then
    raise exception 'Ongeldige tafelcode';
  end if;
end $$;
revoke execute on function public.check_table_access(integer, text) from public, anon, authenticated;

create or replace function public.regenerate_table_code(_table integer)
returns text language plpgsql security definer set search_path = public as $$
declare _code text;
begin
  if not public.has_role(auth.uid(), 'staff') then raise exception 'Geen toegang'; end if;
  update table_codes set code = public.new_table_code(), updated_at = now()
    where table_number = _table returning code into _code;
  if _code is null then raise exception 'Ongeldige tafel'; end if;
  return _code;
end $$;
revoke execute on function public.regenerate_table_code(integer) from public, anon;
grant execute on function public.regenerate_table_code(integer) to authenticated;

/** In demomodus mag iedereen één demotafel openen (voor de startpagina). */
create or replace function public.demo_guest_link()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare _table int; _code text;
begin
  if not (select demo_mode from settings where id = 1) then raise exception 'Demomodus staat uit'; end if;
  select least(7, table_count) into _table from settings where id = 1;
  select code into _code from table_codes where table_number = _table;
  return jsonb_build_object('table', _table, 'code', _code);
end $$;
grant execute on function public.demo_guest_link() to anon, authenticated;

-- ---------- Gastfuncties met tafelcode ----------

drop function if exists public.place_order(integer, jsonb, text[]);
drop function if exists public.place_order(integer, jsonb);
create function public.place_order(_table integer, _items jsonb, _allergies text[] default '{}', _code text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid; _it jsonb; _d record; _total numeric := 0; _open boolean; _qty int; _sum int := 0;
begin
  perform public.check_table_access(_table, _code);
  select ordering_open into _open from settings where id = 1;
  if not _open then raise exception 'Bestellen is momenteel gesloten'; end if;
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then raise exception 'Leeg mandje'; end if;
  if jsonb_array_length(_items) > 40 then raise exception 'Te veel regels'; end if;
  _allergies := coalesce(_allergies, '{}');
  if not _allergies <@ array['gluten','schaaldieren','eieren','vis','pinda','soja','melk','noten','selderij','mosterd','sesam','sulfiet','lupine','weekdieren'] then
    raise exception 'Onbekend allergeen'; end if;
  if not public.has_role(auth.uid(), 'staff') and
     (select count(*) from orders where table_number = _table and created_at > now() - interval '10 minutes') >= 12 then
    raise exception 'Te veel bestellingen: wacht even';
  end if;
  insert into orders(table_number, allergies) values (_table, _allergies) returning id into _id;
  for _it in select * from jsonb_array_elements(_items) loop
    begin _qty := (_it->>'quantity')::int; exception when others then raise exception 'Ongeldig aantal'; end;
    if _qty is null or _qty < 1 or _qty > 20 then raise exception 'Ongeldig aantal'; end if;
    _sum := _sum + _qty;
    if _sum > 60 then raise exception 'Ongeldig aantal'; end if;
    begin
      select * into _d from dishes where id = (_it->>'dish_id')::uuid and available;
    exception when others then raise exception 'Gerecht niet beschikbaar'; end;
    if not found then raise exception 'Gerecht niet beschikbaar'; end if;
    insert into order_items(order_id, dish_id, dish_name, unit_price, quantity, note)
      values (_id, _d.id, _d.name, _d.price, _qty, nullif(btrim(left(coalesce(_it->>'note',''),200)),''));
    _total := _total + _d.price * _qty;
  end loop;
  update orders set total = _total where id = _id;
  return _id;
end $$;
grant execute on function public.place_order(integer, jsonb, text[], text) to anon, authenticated;

drop function if exists public.table_bill(integer);
create function public.table_bill(_table integer, _code text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.check_table_access(_table, _code);
  return (
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
    where o.table_number = _table and o.paid_at is null and o.created_at > now() - interval '12 hours'
  );
end $$;
grant execute on function public.table_bill(integer, text) to anon, authenticated;

drop function if exists public.request_service(integer, text);
create function public.request_service(_table integer, _type text, _code text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  perform public.check_table_access(_table, _code);
  if _type not in ('ober','rekening') then raise exception 'Ongeldige melding'; end if;
  select id into _id from table_requests where table_number = _table and type = _type and not handled limit 1;
  if _id is not null then return _id; end if;
  if not public.has_role(auth.uid(), 'staff') and
     (select count(*) from table_requests where table_number = _table and created_at > now() - interval '10 minutes') >= 6 then
    raise exception 'Te veel meldingen: wacht even';
  end if;
  insert into table_requests(table_number, type) values (_table, _type) returning id into _id;
  return _id;
end $$;
grant execute on function public.request_service(integer, text, text) to anon, authenticated;

-- ---------- Personeelsfuncties ----------

create or replace function public.set_item_done(_item uuid, _done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare _order uuid;
begin
  if not public.has_role(auth.uid(), 'staff') then raise exception 'Geen toegang'; end if;
  update order_items set done = coalesce(_done, false) where id = _item returning order_id into _order;
  if _order is null then raise exception 'Gerecht niet gevonden'; end if;
  update orders set updated_at = now() where id = _order; -- seint de andere schermen via realtime
end $$;
revoke execute on function public.set_item_done(uuid, boolean) from public, anon;
grant execute on function public.set_item_done(uuid, boolean) to authenticated;

create or replace function public.reset_demo()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'staff') then raise exception 'Geen toegang'; end if;
  if not (select demo_mode from settings where id = 1) then raise exception 'Demomodus staat uit'; end if;
  delete from payments where created_at >= date_trunc('day', now());
  delete from table_requests where created_at >= date_trunc('day', now());
  delete from order_items where order_id in (select id from orders where created_at >= date_trunc('day', now()));
  delete from orders where created_at >= date_trunc('day', now());
  update settings set ordering_open = true where id = 1;
end $$;
revoke execute on function public.reset_demo() from public, anon;
grant execute on function public.reset_demo() to authenticated;

-- ---------- Enkel nog schrijven via functies ----------

drop policy if exists "staff update orders" on public.orders;
drop policy if exists "staff delete orders" on public.orders;
drop policy if exists "staff update requests" on public.table_requests;
drop policy if exists "staff delete requests" on public.table_requests;
revoke insert, update, delete, truncate on public.orders, public.order_items, public.table_requests, public.payments from anon, authenticated;

-- ---------- Realtime ----------

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories') then
    alter publication supabase_realtime add table public.categories;
  end if;
end $$;
