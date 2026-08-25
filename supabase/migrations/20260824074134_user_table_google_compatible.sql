-- Table users ultra-simple compatible Google OAuth
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,          -- ID Google
    email TEXT NOT NULL UNIQUE,   -- Email Google
    name TEXT,                    -- Nom Google
    picture TEXT,                 -- Photo / Avatar Google
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS simple (accès lecture / écriture)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on users" ON public.users;
CREATE POLICY "Allow all on users" ON public.users
    FOR ALL USING (true) WITH CHECK (true);
