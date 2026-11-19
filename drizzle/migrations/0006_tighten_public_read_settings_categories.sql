DROP POLICY IF EXISTS "public read settings" ON public.settings;
CREATE POLICY "public read settings" ON public.settings FOR SELECT TO anon, authenticated USING (id = 1);
DROP POLICY IF EXISTS "public read categories" ON public.categories;
CREATE POLICY "public read categories" ON public.categories FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.dishes d WHERE d.category_id = categories.id AND d.available));