alter table public.orders add column if not exists allergies text[] not null default '{}';

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  table_number int not null,
  amount numeric not null check (amount >= 0),
  method text not null check (method in ('cash','kaart','payconiq')),
  order_ids uuid[] not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "staff read payments" on public.payments for select to authenticated using (public.has_role(auth.uid(), 'staff'));
create index payments_created_at_idx on public.payments (created_at);
create index table_requests_table_idx on public.table_requests (table_number, created_at);

-- Validatie van menu-invoer
create or replace function public.validate_dish() returns trigger language plpgsql set search_path = public as $$
begin
  new.name := btrim(new.name);
  if length(new.name) < 1 or length(new.name) > 120 then raise exception 'Naam moet tussen 1 en 120 tekens zijn'; end if;
  if length(new.description) > 500 then raise exception 'Beschrijving is te lang (max. 500 tekens)'; end if;
  if new.price < 0 or new.price > 1000 then raise exception 'Prijs moet tussen 0 en 1000 euro liggen'; end if;
  new.price := round(new.price, 2);
  if not new.allergens <@ array['gluten','schaaldieren','eieren','vis','pinda','soja','melk','noten','selderij','mosterd','sesam','sulfiet','lupine','weekdieren'] then
    raise exception 'Onbekend allergeen'; end if;
  if new.image_url is not null and new.image_url <> '' and new.image_url !~ '^https?://' then raise exception 'Foto-URL moet met http(s):// beginnen'; end if;
  return new;
end $$;
create trigger dishes_validate before insert or update on public.dishes for each row execute function public.validate_dish();

create or replace function public.validate_category() returns trigger language plpgsql set search_path = public as $$
begin
  new.name := btrim(new.name);
  if length(new.name) < 1 or length(new.name) > 60 then raise exception 'Categorienaam moet tussen 1 en 60 tekens zijn'; end if;
  return new;
end $$;
create trigger categories_validate before insert or update on public.categories for each row execute function public.validate_category();

-- Bestellen met misbruikbeperking en allergieën
drop function if exists public.place_order(integer, jsonb);
create function public.place_order(_table integer, _items jsonb, _allergies text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid; _it jsonb; _d record; _total numeric := 0; _max int; _open boolean; _qty int; _sum int := 0;
begin
  select table_count, ordering_open into _max, _open from settings where id = 1;
  if not _open then raise exception 'Bestellen is momenteel gesloten'; end if;
  if _table is null or _table < 1 or _table > _max then raise exception 'Ongeldige tafel'; end if;
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then raise exception 'Leeg mandje'; end if;
  if jsonb_array_length(_items) > 40 then raise exception 'Te veel regels'; end if;
  _allergies := coalesce(_allergies, '{}');
  if not _allergies <@ array['gluten','schaaldieren','eieren','vis','pinda','soja','melk','noten','selderij','mosterd','sesam','sulfiet','lupine','weekdieren'] then
    raise exception 'Onbekend allergeen'; end if;
  if not public.has_role(auth.uid(), 'staff') and
     (select count(*) from orders where table_number = _table and created_at > now() - interval '10 minutes') >= 5 then
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
grant execute on function public.place_order(integer, jsonb, text[]) to anon, authenticated;

-- Ober/rekening via server, met dubbel-check en limiet
drop policy if exists "anyone create request" on public.table_requests;
create or replace function public.request_service(_table integer, _type text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _max int; _id uuid;
begin
  select table_count into _max from settings where id = 1;
  if _table is null or _table < 1 or _table > _max then raise exception 'Ongeldige tafel'; end if;
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
grant execute on function public.request_service(integer, text) to anon, authenticated;

-- Statuswijziging met toegelaten overgangen
create or replace function public.set_order_status(_id uuid, _status text)
returns void language plpgsql security definer set search_path = public as $$
declare _cur text; _paid timestamptz;
begin
  if not public.has_role(auth.uid(), 'staff') then raise exception 'Geen toegang'; end if;
  select status, paid_at into _cur, _paid from orders where id = _id for update;
  if not found then raise exception 'Bestelling niet gevonden'; end if;
  if _paid is not null then raise exception 'Bestelling is al afgerekend'; end if;
  if _cur = _status then return; end if;
  if not ((_cur = 'ontvangen' and _status in ('in_bereiding','klaar','geannuleerd'))
       or (_cur = 'in_bereiding' and _status in ('ontvangen','klaar','geannuleerd'))
       or (_cur = 'klaar' and _status in ('in_bereiding','ontvangen'))
       or (_cur = 'geannuleerd' and _status in ('ontvangen','in_bereiding'))) then
    raise exception 'Ongeldige statuswijziging';
  end if;
  update orders set status = _status where id = _id;
end $$;
grant execute on function public.set_order_status(uuid, text) to authenticated;

create or replace function public.handle_requests(_table integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'staff') then raise exception 'Geen toegang'; end if;
  update table_requests set handled = true where table_number = _table and not handled;
end $$;
grant execute on function public.handle_requests(integer) to authenticated;

-- Afrekenen: bedrag wordt op de server berekend en als betaling vastgelegd
create or replace function public.settle_table(_table integer, _method text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _ids uuid[]; _amount numeric; _pid uuid;
begin
  if not public.has_role(auth.uid(), 'staff') then raise exception 'Geen toegang'; end if;
  if _method not in ('cash','kaart','payconiq') then raise exception 'Ongeldige betaalmethode'; end if;
  select coalesce(array_agg(id), '{}'), coalesce(sum(total) filter (where status <> 'geannuleerd'), 0)
    into _ids, _amount
    from orders where table_number = _table and paid_at is null and created_at > now() - interval '12 hours';
  if cardinality(_ids) = 0 then raise exception 'Niets af te rekenen'; end if;
  update orders set paid_at = now() where id = any(_ids);
  update table_requests set handled = true where table_number = _table and not handled;
  insert into payments(table_number, amount, method, order_ids, created_by)
    values (_table, _amount, _method, _ids, auth.uid()) returning id into _pid;
  return jsonb_build_object('payment_id', _pid, 'amount', _amount);
end $$;
grant execute on function public.settle_table(integer, text) to authenticated;

create or replace function public.reset_demo()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'staff') then raise exception 'Geen toegang'; end if;
  delete from payments where created_at >= date_trunc('day', now());
  delete from table_requests where created_at >= date_trunc('day', now());
  delete from order_items where order_id in (select id from orders where created_at >= date_trunc('day', now()));
  delete from orders where created_at >= date_trunc('day', now());
  update settings set ordering_open = true where id = 1;
end $$;
grant execute on function public.reset_demo() to authenticated;

revoke execute on function public.set_order_status(uuid, text), public.handle_requests(integer), public.settle_table(integer, text), public.reset_demo() from anon, public;
grant execute on function public.set_order_status(uuid, text), public.handle_requests(integer), public.settle_table(integer, text), public.reset_demo() to authenticated;