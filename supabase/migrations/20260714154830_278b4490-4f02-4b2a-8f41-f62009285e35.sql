CREATE TABLE public.ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads TO authenticated;
GRANT ALL ON public.ads TO service_role;

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active ads"
  ON public.ads FOR SELECT
  TO anon, authenticated
  USING (activo = true OR auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can insert ads"
  ON public.ads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update ads"
  ON public.ads FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete ads"
  ON public.ads FOR DELETE
  TO authenticated
  USING (true);