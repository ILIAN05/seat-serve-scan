create table public.settings (id int primary key default 1, restaurant_name text not null default 'Bistro De Houder', table_count int not null default 12, constraint single check (id = 1));
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null, sort_order int not null default 0, created_at timestamptz not null default now());
create table public.dishes (id uuid primary key default gen_random_uuid(), category_id uuid not null references public.categories(id) on delete cascade, name text not null, description text not null default '', price numeric(8,2) not null default 0, allergens text[] not null default '{}', image_url text, available boolean not null default true, sort_order int not null default 0, created_at timestamptz not null default now());
create table public.orders (id uuid primary key default gen_random_uuid(), table_number int not null, status text not null default 'ontvangen' check (status in ('ontvangen','in_bereiding','klaar')), total numeric(10,2) not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, dish_id uuid references public.dishes(id) on delete set null, dish_name text not null, unit_price numeric(8,2) not null, quantity int not null check (quantity > 0), note text);
create table public.table_requests (id uuid primary key default gen_random_uuid(), table_number int not null, type text not null check (type in ('ober','rekening')), handled boolean not null default false, created_at timestamptz not null default now());

grant select on public.settings, public.categories, public.dishes, public.orders, public.order_items to anon;
grant insert on public.table_requests to anon;
grant select, insert, update, delete on public.settings, public.categories, public.dishes, public.orders, public.order_items, public.table_requests to authenticated;
grant all on public.settings, public.categories, public.dishes, public.orders, public.order_items, public.table_requests to service_role;

alter table public.settings enable row level security;
alter table public.categories enable row level security;
alter table public.dishes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.table_requests enable row level security;

create policy "public read settings" on public.settings for select to anon, authenticated using (true);
create policy "staff update settings" on public.settings for update to authenticated using (true) with check (true);
create policy "public read categories" on public.categories for select to anon, authenticated using (true);
create policy "staff write categories" on public.categories for all to authenticated using (true) with check (true);
create policy "public read available dishes" on public.dishes for select to anon using (available);
create policy "staff all dishes" on public.dishes for all to authenticated using (true) with check (true);
create policy "public read orders" on public.orders for select to anon, authenticated using (true);
create policy "staff update orders" on public.orders for update to authenticated using (true) with check (true);
create policy "staff delete orders" on public.orders for delete to authenticated using (true);
create policy "public read order items" on public.order_items for select to anon, authenticated using (true);
create policy "anyone create request" on public.table_requests for insert to anon, authenticated with check (handled = false);
create policy "staff read requests" on public.table_requests for select to authenticated using (true);
create policy "staff update requests" on public.table_requests for update to authenticated using (true) with check (true);
create policy "staff delete requests" on public.table_requests for delete to authenticated using (true);

create or replace function public.place_order(_table int, _items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid; _it jsonb; _d record; _total numeric := 0; _max int;
begin
  select table_count into _max from settings where id = 1;
  if _table < 1 or _table > _max then raise exception 'Ongeldige tafel'; end if;
  if jsonb_array_length(_items) = 0 then raise exception 'Leeg mandje'; end if;
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

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.table_requests;
alter publication supabase_realtime add table public.dishes;

insert into public.settings (id) values (1);
insert into public.categories (id, name, sort_order) values
 ('11111111-0000-0000-0000-000000000001','Voorgerechten',1),
 ('11111111-0000-0000-0000-000000000002','Hoofdgerechten',2),
 ('11111111-0000-0000-0000-000000000003','Desserts',3),
 ('11111111-0000-0000-0000-000000000004','Dranken',4);
insert into public.dishes (category_id, name, description, price, allergens, sort_order) values
 ('11111111-0000-0000-0000-000000000001','Garnaalkroketten','Twee huisgemaakte kroketten met Noordzeegarnalen, citroen en gefrituurde peterselie',16.50,'{schaaldieren,gluten,melk,eieren}',1),
 ('11111111-0000-0000-0000-000000000001','Kaaskroketten','Twee kroketten van oude Brugge-kaas met frisse salade',13.00,'{gluten,melk,eieren}',2),
 ('11111111-0000-0000-0000-000000000001','Tomatensoep met balletjes','Klassieke Belgische soep met gehaktballetjes',8.50,'{selderij,gluten}',3),
 ('11111111-0000-0000-0000-000000000001','Carpaccio van rund','Met rucola, Parmezaan, pijnboompitten en truffelmayonaise',15.00,'{melk,eieren,noten,mosterd}',4),
 ('11111111-0000-0000-0000-000000000002','Stoofvlees met frietjes','Rundsstoofvlees op grootmoeders wijze, bereid met Westmalle Dubbel',22.50,'{gluten,selderij,mosterd}',1),
 ('11111111-0000-0000-0000-000000000002','Vol-au-vent','Kip, gehaktballetjes en champignons in romige saus, met frietjes',21.00,'{gluten,melk,eieren,selderij}',2),
 ('11111111-0000-0000-0000-000000000002','Mosselen natuur','1,2 kg Zeeuwse mosselen met groenten, frietjes en mayonaise',27.00,'{weekdieren,selderij,eieren,mosterd}',3),
 ('11111111-0000-0000-0000-000000000002','Gentse waterzooi','Kip in romige bouillon met prei, wortel en aardappelen',23.50,'{melk,selderij,eieren}',4),
 ('11111111-0000-0000-0000-000000000002','Vegetarische stoverij','Seitan en paddenstoelen in bierjus, met puree',19.50,'{gluten,soja,selderij}',5),
 ('11111111-0000-0000-0000-000000000003','Dame blanche','Vanille-ijs met warme Belgische chocoladesaus en slagroom',9.00,'{melk,eieren,soja}',1),
 ('11111111-0000-0000-0000-000000000003','Brusselse wafel','Met poedersuiker, slagroom en rood fruit',8.50,'{gluten,melk,eieren}',2),
 ('11111111-0000-0000-0000-000000000003','Chocolademousse','Luchtige mousse van pure Callebaut-chocolade',7.50,'{melk,eieren,soja}',3),
 ('11111111-0000-0000-0000-000000000004','Westmalle Tripel','Trappistenbier, 33 cl',5.50,'{gluten}',1),
 ('11111111-0000-0000-0000-000000000004','Huiswijn rood of wit','Per glas, 15 cl',6.00,'{sulfiet}',2),
 ('11111111-0000-0000-0000-000000000004','Spa Rood','Bruisend water, 50 cl',4.50,'{}',3),
 ('11111111-0000-0000-0000-000000000004','Verse muntthee','Met honing',4.00,'{}',4);