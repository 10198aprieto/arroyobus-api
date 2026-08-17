CREATE TABLE public.alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  header text NOT NULL,
  description text NOT NULL DEFAULT '',
  cause integer NOT NULL DEFAULT 1,
  effect integer NOT NULL DEFAULT 7,
  route_ids text[] NOT NULL DEFAULT '{}',
  stop_ids text[] NOT NULL DEFAULT '{}',
  url text,
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT SELECT ON public.alerts TO anon;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active alerts" ON public.alerts FOR SELECT TO anon, authenticated USING ((activo = true) OR (auth.uid() IS NOT NULL));
CREATE POLICY "Authenticated can insert alerts" ON public.alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update alerts" ON public.alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete alerts" ON public.alerts FOR DELETE TO authenticated USING (true);