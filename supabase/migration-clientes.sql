-- ============================================================
-- MIGRAÇÃO: cadastro de clientes (#55) — rodar UMA VEZ no SQL Editor
-- do projeto Supabase que já tem o schema multi-igreja.
--
-- Só ADICIONA (tabela nova, índice, RLS e policies): não altera nenhuma
-- tabela existente, então não precisa de LOCK nem de parar o app, e é
-- idempotente (pode rodar de novo sem erro).
--
-- Rode ANTES de publicar o código da tela Cadastros → Clientes: sem a
-- tabela, a lista vem vazia e criar cliente falha.
--
-- Depois de rodar, supabase/schema.sql continua sendo a referência do
-- estado do banco (ele já inclui tab_clientes).
-- ============================================================

-- BEGIN/COMMIT explícitos: se rodar fora do SQL Editor (psql -f faz
-- autocommit por comando), não existe janela com a tabela criada e a RLS
-- ainda desligada.
BEGIN;

CREATE TABLE IF NOT EXISTS tab_clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL CHECK (btrim(nome) <> '' AND char_length(nome) <= 100),
  telefone TEXT CHECK (char_length(telefone) <= 30),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (id, igreja_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tab_clientes_nome_unico
  ON tab_clientes (igreja_id, lower(btrim(nome)));

ALTER TABLE tab_clientes ENABLE ROW LEVEL SECURITY;

-- SELECT/INSERT/UPDATE separadas, sem DELETE (cliente só é arquivado) —
-- ver explicação no schema.sql. O DROP da policy antiga FOR ALL só existe
-- pra quem tiver rodado uma versão anterior deste script.
DROP POLICY IF EXISTS "membros_igreja_clientes" ON tab_clientes;
DROP POLICY IF EXISTS "membros_igreja_clientes_select" ON tab_clientes;
DROP POLICY IF EXISTS "membros_igreja_clientes_insert" ON tab_clientes;
DROP POLICY IF EXISTS "membros_igreja_clientes_update" ON tab_clientes;

CREATE POLICY "membros_igreja_clientes_select" ON tab_clientes
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));

CREATE POLICY "membros_igreja_clientes_insert" ON tab_clientes
  FOR INSERT TO authenticated WITH CHECK (igreja_id IN (SELECT private.minhas_igrejas()));

CREATE POLICY "membros_igreja_clientes_update" ON tab_clientes
  FOR UPDATE TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()))
  WITH CHECK (igreja_id IN (SELECT private.minhas_igrejas()));

REVOKE DELETE, TRUNCATE ON tab_clientes FROM anon, authenticated;

COMMIT;
