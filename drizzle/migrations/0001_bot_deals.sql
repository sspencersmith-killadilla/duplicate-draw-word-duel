ALTER TABLE public.daily_deals ADD COLUMN kind text NOT NULL DEFAULT 'daily';
ALTER TABLE public.daily_deals ADD COLUMN bot_number integer;
ALTER TABLE public.daily_deals DROP CONSTRAINT daily_deals_deal_date_key;
CREATE UNIQUE INDEX daily_deals_daily_date_key ON public.daily_deals (deal_date) WHERE kind = 'daily';
CREATE UNIQUE INDEX daily_deals_bot_number_key ON public.daily_deals (bot_number) WHERE kind = 'bot';
ALTER TABLE public.games ADD COLUMN vs_bot boolean NOT NULL DEFAULT false;