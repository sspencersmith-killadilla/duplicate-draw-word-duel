CREATE TABLE public.ai_explanation_access_state (
  id text PRIMARY KEY,
  status integer NOT NULL,
  message text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_explanation_access_state TO service_role;
ALTER TABLE public.ai_explanation_access_state ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ai_explanation_access_state IS 'Service-only persistent terminal AI provider denial state; clear only after provider access is restored.';