-- Marques manuelles "déjà vu" pour épisodes, saisons (une ligne par épisode) et films.
-- season=0 & episode=0 => film. Une lecture réelle de ce même épisode/film
-- (voir logique côté app dans saveProgress) supprime automatiquement sa marque manuelle.
CREATE TABLE IF NOT EXISTS public.watched_manual (
    id TEXT PRIMARY KEY DEFAULT (gen_random_uuid())::text,
    user_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    season INTEGER NOT NULL DEFAULT 0,
    episode INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_id, season, episode)
);

ALTER TABLE public.watched_manual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on watched_manual" ON public.watched_manual;
CREATE POLICY "Allow all on watched_manual" ON public.watched_manual
    FOR ALL USING (true) WITH CHECK (true);
