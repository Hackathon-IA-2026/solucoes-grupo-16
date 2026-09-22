-- ==============================================================================
-- Script de Criação no Supabase para ClimaGrid PWF
-- Execute este script no SQL Editor do seu projeto Supabase (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Criação da tabela de casos de referência PWF
CREATE TABLE IF NOT EXISTS public.pwf_reference_cases (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'valid',
    anarede_version TEXT,
    compatibility TEXT,
    encoding TEXT,
    line_ending TEXT,
    title TEXT,
    study_year INTEGER,
    bus_count INTEGER,
    generator_bus_count INTEGER,
    generator_group_count INTEGER,
    storage_path TEXT,
    warnings TEXT[],
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices úteis para consultas
CREATE INDEX IF NOT EXISTS idx_pwf_reference_cases_uploaded_at ON public.pwf_reference_cases (uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_pwf_reference_cases_sha256 ON public.pwf_reference_cases (sha256);

-- 2. Habilita RLS (Row Level Security) na tabela
ALTER TABLE public.pwf_reference_cases ENABLE ROW LEVEL SECURITY;

-- Política de leitura: qualquer usuário autenticado ou anônimo pode consultar
CREATE POLICY "Permitir leitura de casos PWF para todos"
ON public.pwf_reference_cases
FOR SELECT
USING (true);

-- Política de inserção/atualização para backend (com service_role key tem acesso total automático)
CREATE POLICY "Permitir inserção e atualização de casos PWF"
ON public.pwf_reference_cases
FOR ALL
USING (true)
WITH CHECK (true);

-- ==============================================================================
-- 3. Instruções para o Supabase Storage (Bucket):
--
-- No painel do Supabase -> Storage:
-- 1. Crie um novo bucket chamado "pwf" (ou o nome que configurou no .env).
-- 2. Se desejar que os arquivos possam ser baixados diretamente por URLs públicas:
--    Marque a opção "Public bucket".
-- 3. Caso deixe privado, adicione uma Storage Policy no bucket para permitir
--    leitura (SELECT) e escrita (INSERT):
--
--    create policy "Acesso a arquivos PWF"
--    on storage.objects for all
--    using ( bucket_id = 'pwf' )
--    with check ( bucket_id = 'pwf' );
-- ==============================================================================
