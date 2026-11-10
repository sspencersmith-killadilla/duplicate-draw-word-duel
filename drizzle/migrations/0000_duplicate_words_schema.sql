CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; candidate text; n int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'player'), '[^a-zA-Z0-9_]', '', 'g'));
  IF length(base) < 3 THEN base := 'player' || base; END IF;
  base := left(base, 20);
  candidate := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    n := n + 1;
    candidate := base || n::text;
  END LOOP;
  INSERT INTO public.profiles (id, username) VALUES (NEW.id, candidate);
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.daily_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_date date NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_deals TO authenticated;
GRANT ALL ON public.daily_deals TO service_role;
ALTER TABLE public.daily_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view deals" ON public.daily_deals FOR SELECT TO authenticated USING (true);

CREATE TABLE public.deal_secrets (
  deal_id uuid PRIMARY KEY REFERENCES public.daily_deals(id) ON DELETE CASCADE,
  north_tiles text NOT NULL,
  south_tiles text NOT NULL
);
GRANT ALL ON public.deal_secrets TO service_role;
ALTER TABLE public.deal_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.daily_deals(id) ON DELETE CASCADE,
  north_id uuid NOT NULL,
  south_id uuid,
  status text NOT NULL DEFAULT 'waiting',
  turn text NOT NULL DEFAULT 'north',
  board jsonb NOT NULL DEFAULT '[]'::jsonb,
  north_score int NOT NULL DEFAULT 0,
  south_score int NOT NULL DEFAULT 0,
  north_rack_count int NOT NULL DEFAULT 7,
  south_rack_count int NOT NULL DEFAULT 7,
  north_remaining int NOT NULL DEFAULT 0,
  south_remaining int NOT NULL DEFAULT 0,
  consecutive_passes int NOT NULL DEFAULT 0,
  last_move_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX games_deal_idx ON public.games(deal_id);
GRANT SELECT ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players view their games" ON public.games FOR SELECT TO authenticated USING (auth.uid() = north_id OR auth.uid() = south_id);

CREATE TABLE public.game_secrets (
  game_id uuid PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  north_rack text NOT NULL DEFAULT '',
  south_rack text NOT NULL DEFAULT '',
  north_stream text NOT NULL DEFAULT '',
  south_stream text NOT NULL DEFAULT ''
);
GRANT ALL ON public.game_secrets TO service_role;
ALTER TABLE public.game_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  seat text NOT NULL,
  player_id uuid NOT NULL,
  kind text NOT NULL,
  words text[] NOT NULL DEFAULT '{}',
  score int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moves_game_idx ON public.moves(game_id);
GRANT SELECT ON public.moves TO authenticated;
GRANT ALL ON public.moves TO service_role;
ALTER TABLE public.moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players view moves of their games" ON public.moves FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND (g.north_id = auth.uid() OR g.south_id = auth.uid())));

ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.moves;