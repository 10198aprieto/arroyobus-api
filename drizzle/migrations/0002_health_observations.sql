CREATE TABLE public.health_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 observed_at timestamptz NOT NULL DEFAULT now(),
 source text NOT NULL DEFAULT 'scheduled' CHECK (source IN ('scheduled','live')),
 status text NOT NULL CHECK (status IN ('ok','degraded','down')),
 vehicle_state text NOT NULL CHECK (vehicle_state IN ('reporting','empty','unavailable')),
 vehicles integer,
 trips integer,
 took_ms integer NOT NULL DEFAULT 0,
 checks jsonb NOT NULL DEFAULT '[]'::jsonb
);
GRANT SELECT ON public.health_observations TO anon, authenticated;
GRANT ALL ON public.health_observations TO service_role;
ALTER TABLE public.health_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public health observations are readable" ON public.health_observations FOR SELECT TO anon, authenticated USING (true);
CREATE INDEX health_observations_time_idx ON public.health_observations (observed_at DESC);
CREATE INDEX health_observations_vehicle_state_idx ON public.health_observations (vehicle_state, observed_at DESC);
CREATE UNIQUE INDEX health_observations_minute_source_idx ON public.health_observations (source, date_trunc('minute', observed_at AT TIME ZONE 'UTC'));