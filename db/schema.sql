-- Shroud database schema
-- Tracks compliant addresses registered by the Association Set Provider (ASP)

-- Table: shroud_asp_users
CREATE TABLE IF NOT EXISTS public.shroud_asp_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(56) UNIQUE NOT NULL,
    kyc_status VARCHAR(20) DEFAULT 'pending' NOT NULL CHECK (kyc_status IN ('pending', 'approved', 'revoked')),
    merkle_index INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.shroud_asp_users ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow anyone to view allowlist users (so they can verify and build proofs)
CREATE POLICY read_policy ON public.shroud_asp_users 
    FOR SELECT 
    TO public 
    USING (true);

-- Insert/Update/Delete policy: Restrict writing to compliance admin (service_role or authenticated with secrets)
CREATE POLICY admin_all_policy ON public.shroud_asp_users 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- Table: shroud_utxos (v2)
CREATE TABLE IF NOT EXISTS public.shroud_utxos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commitment VARCHAR(64) UNIQUE NOT NULL,
    amount NUMERIC NOT NULL,
    spent_nullifier VARCHAR(64),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'spent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.shroud_utxos ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_utxos_policy ON public.shroud_utxos FOR SELECT TO public USING (true);
CREATE POLICY admin_utxos_policy ON public.shroud_utxos FOR ALL TO service_role USING (true) WITH CHECK (true);

