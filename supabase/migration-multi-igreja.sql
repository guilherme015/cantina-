-- ============================================================
-- MIGRAÇÃO: multi-igreja (tenant) — rodar UMA VEZ no SQL Editor
-- do projeto Supabase que já tem o schema antigo (sem igreja_id).
--
-- Pré-condição verificada antes de escrever este script: todas as
-- tabelas do projeto "Cantina Plus" estavam com 0 linhas — incluindo
-- auth.users (0 contas cadastradas ainda). Por isso os ALTER TABLE
-- abaixo já aplicam NOT NULL direto, sem etapa de backfill, e o
-- trigger do item 6 (criação de igreja no cadastro) não precisa lidar
-- com usuário pré-existente sem igreja.
--
-- Se este script for reaproveitado num projeto que já tem contas
-- (auth.users com linhas), rode ANTES do item 6 um backfill que crie
-- 1 igreja + 1 vínculo owner pra cada auth.users sem linha em
-- igreja_membros — sem isso esses usuários ficam sem igreja e sem
-- nenhum jeito de criar uma (não existe INSERT client-side nessas
-- tabelas, só o trigger).
--
-- Depois de rodar este arquivo uma vez, supabase/schema.sql passa
-- a ser a referência para o estado do banco (ele já reflete o
-- resultado desta migração).
-- ============================================================

-- ============================================================
-- 1. Tabelas novas
-- ============================================================
CREATE TABLE IF NOT EXISTS igrejas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  nome TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS igreja_membros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel TEXT NOT NULL DEFAULT 'membro' CHECK (papel IN ('owner', 'membro')),
  -- Um usuário pertence a no máximo 1 igreja por enquanto (sem convite de
  -- membro ainda) — também garante que getIgrejaIdAtual() seja determinístico.
  UNIQUE (user_id)
);

-- ============================================================
-- 2. Coluna igreja_id nas tabelas existentes
-- ============================================================
ALTER TABLE tab_itens ADD COLUMN IF NOT EXISTS igreja_id UUID REFERENCES igrejas(id) ON DELETE CASCADE;
ALTER TABLE tab_cardapio_dia ADD COLUMN IF NOT EXISTS igreja_id UUID REFERENCES igrejas(id) ON DELETE CASCADE;
ALTER TABLE tab_vendas ADD COLUMN IF NOT EXISTS igreja_id UUID REFERENCES igrejas(id) ON DELETE CASCADE;
ALTER TABLE tab_extrato_financeiro ADD COLUMN IF NOT EXISTS igreja_id UUID REFERENCES igrejas(id) ON DELETE CASCADE;
ALTER TABLE tab_contas_receber ADD COLUMN IF NOT EXISTS igreja_id UUID REFERENCES igrejas(id) ON DELETE CASCADE;
ALTER TABLE tab_contas_pagar ADD COLUMN IF NOT EXISTS igreja_id UUID REFERENCES igrejas(id) ON DELETE CASCADE;
ALTER TABLE tab_fechamento_caixa ADD COLUMN IF NOT EXISTS igreja_id UUID REFERENCES igrejas(id) ON DELETE CASCADE;

ALTER TABLE tab_itens ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE tab_cardapio_dia ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE tab_vendas ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE tab_extrato_financeiro ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE tab_contas_receber ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE tab_contas_pagar ALTER COLUMN igreja_id SET NOT NULL;
ALTER TABLE tab_fechamento_caixa ALTER COLUMN igreja_id SET NOT NULL;

-- ============================================================
-- 3. Trocar UNIQUE(user_id, data) por UNIQUE(igreja_id, data)
--    (cardápio do dia e fechamento de caixa são da igreja, não
--    de um usuário individual)
-- ============================================================
ALTER TABLE tab_cardapio_dia DROP CONSTRAINT IF EXISTS tab_cardapio_dia_user_id_data_key;
ALTER TABLE tab_cardapio_dia ADD CONSTRAINT tab_cardapio_dia_igreja_id_data_key UNIQUE (igreja_id, data);

ALTER TABLE tab_fechamento_caixa DROP CONSTRAINT IF EXISTS tab_fechamento_caixa_user_id_data_key;
ALTER TABLE tab_fechamento_caixa ADD CONSTRAINT tab_fechamento_caixa_igreja_id_data_key UNIQUE (igreja_id, data);

-- ============================================================
-- 3b. numero_pedido deixa de ser uma sequência global (SERIAL)
--     compartilhada entre igrejas — ver comentário completo em
--     schema.sql (revela volume de vendas de outras igrejas). Passa a
--     ser numerado por igreja via trigger (item 8 mais abaixo).
-- ============================================================
ALTER TABLE tab_vendas ALTER COLUMN numero_pedido DROP DEFAULT;
ALTER TABLE tab_vendas ADD CONSTRAINT tab_vendas_igreja_id_numero_pedido_key UNIQUE (igreja_id, numero_pedido);
DROP SEQUENCE IF EXISTS tab_vendas_numero_pedido_seq;

-- ============================================================
-- 4. Função private.minhas_igrejas() — ver comentário em schema.sql.
--    SECURITY DEFINER é obrigatório: uma policy de igreja_membros que
--    faz subquery direto na própria tabela causa "infinite recursion
--    detected in policy" (42P17). Fica no schema `private` (não
--    exposto pelo PostgREST) e sem GRANT para `anon`/PUBLIC, pra não
--    virar uma RPC pública.
-- ============================================================
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.minhas_igrejas()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT igreja_id FROM public.igreja_membros WHERE user_id = (SELECT auth.uid())
$$;

REVOKE ALL ON FUNCTION private.minhas_igrejas() FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.minhas_igrejas() TO authenticated;

-- ============================================================
-- 5. RLS: dropar policies antigas (por user_id) e criar as novas
--    (por membership em igreja_membros, via private.minhas_igrejas())
--
--    Sem policy de INSERT para `authenticated` em igrejas/igreja_membros
--    de propósito — só o trigger trg_criar_igreja_no_cadastro (item 6),
--    que roda como SECURITY DEFINER, pode escrever nessas duas tabelas.
-- ============================================================
ALTER TABLE igrejas ENABLE ROW LEVEL SECURITY;
ALTER TABLE igreja_membros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuario_cria_propria_igreja" ON igrejas;
DROP POLICY IF EXISTS "usuario_se_vincula_a_igreja_propria" ON igreja_membros;

CREATE POLICY "membros_veem_propria_igreja" ON igrejas
  FOR SELECT TO authenticated USING (
    owner_user_id = (SELECT auth.uid())
    OR id IN (SELECT private.minhas_igrejas())
  );

CREATE POLICY "membros_veem_colegas_de_igreja" ON igreja_membros
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));

DROP POLICY IF EXISTS "usuarios_proprios_itens" ON tab_itens;
CREATE POLICY "membros_igreja_itens" ON tab_itens
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()))
  WITH CHECK (igreja_id IN (SELECT private.minhas_igrejas()));

DROP POLICY IF EXISTS "usuarios_proprios_cardapio" ON tab_cardapio_dia;
CREATE POLICY "membros_igreja_cardapio" ON tab_cardapio_dia
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()))
  WITH CHECK (igreja_id IN (SELECT private.minhas_igrejas()));

DROP POLICY IF EXISTS "usuarios_proprios_cardapio_itens" ON tab_cardapio_dia_itens;
CREATE POLICY "membros_igreja_cardapio_itens" ON tab_cardapio_dia_itens
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tab_cardapio_dia
      WHERE id = cardapio_id
        AND igreja_id IN (SELECT private.minhas_igrejas())
    )
  );

DROP POLICY IF EXISTS "usuarios_proprias_vendas" ON tab_vendas;
CREATE POLICY "membros_igreja_vendas" ON tab_vendas
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()))
  WITH CHECK (igreja_id IN (SELECT private.minhas_igrejas()));

DROP POLICY IF EXISTS "usuarios_proprios_vendas_itens" ON tab_vendas_itens;
CREATE POLICY "membros_igreja_vendas_itens" ON tab_vendas_itens
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM tab_vendas
      WHERE id = venda_id
        AND igreja_id IN (SELECT private.minhas_igrejas())
    )
  );

DROP POLICY IF EXISTS "usuarios_proprio_extrato" ON tab_extrato_financeiro;
CREATE POLICY "membros_igreja_extrato" ON tab_extrato_financeiro
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()))
  WITH CHECK (igreja_id IN (SELECT private.minhas_igrejas()));

DROP POLICY IF EXISTS "usuarios_proprias_contas_receber" ON tab_contas_receber;
CREATE POLICY "membros_igreja_contas_receber" ON tab_contas_receber
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()))
  WITH CHECK (igreja_id IN (SELECT private.minhas_igrejas()));

DROP POLICY IF EXISTS "usuarios_proprias_contas_pagar" ON tab_contas_pagar;
CREATE POLICY "membros_igreja_contas_pagar" ON tab_contas_pagar
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()))
  WITH CHECK (igreja_id IN (SELECT private.minhas_igrejas()));

-- Sem policy de INSERT de propósito — só a RPC fechar_caixa (mais
-- abaixo, SECURITY DEFINER) pode gravar um fechamento. Ver comentário
-- completo em schema.sql.
DROP POLICY IF EXISTS "usuarios_proprios_fechamento_select" ON tab_fechamento_caixa;
DROP POLICY IF EXISTS "usuarios_proprios_fechamento_insert" ON tab_fechamento_caixa;
DROP POLICY IF EXISTS "membros_igreja_fechamento_insert" ON tab_fechamento_caixa;
CREATE POLICY "membros_igreja_fechamento_select" ON tab_fechamento_caixa
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));

-- ============================================================
-- 5b. Trigger: numerar venda por igreja (ver comentário completo em
--     schema.sql — não é SECURITY DEFINER, corrida rara resolvida pelo
--     UNIQUE(igreja_id, numero_pedido) do item 3b)
-- ============================================================
CREATE OR REPLACE FUNCTION public.numerar_venda_por_igreja()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  SELECT COALESCE(MAX(numero_pedido), 0) + 1 INTO NEW.numero_pedido
  FROM public.tab_vendas
  WHERE igreja_id = NEW.igreja_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_numerar_venda_por_igreja ON tab_vendas;
CREATE TRIGGER trg_numerar_venda_por_igreja
  BEFORE INSERT ON tab_vendas
  FOR EACH ROW EXECUTE FUNCTION public.numerar_venda_por_igreja();

-- ============================================================
-- 6. Trigger: criar igreja + vínculo de owner no cadastro
--    (ver comentário completo em schema.sql — atômico com a criação
--    do usuário em auth.users, funciona com ou sem confirmação de
--    e-mail habilitada)
-- ============================================================
-- search_path = '' com nomes qualificados — ver comentário completo em
-- schema.sql (proteção contra uma tabela temporária "igrejas" ou
-- "igreja_membros" sequestrar o INSERT).
CREATE OR REPLACE FUNCTION public.criar_igreja_no_cadastro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  nova_igreja_id UUID;
BEGIN
  INSERT INTO public.igrejas (nome, owner_user_id)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'nome_igreja', 'Minha Igreja'), NEW.id)
  RETURNING id INTO nova_igreja_id;

  INSERT INTO public.igreja_membros (igreja_id, user_id, papel)
  VALUES (nova_igreja_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_criar_igreja_no_cadastro ON auth.users;
CREATE TRIGGER trg_criar_igreja_no_cadastro
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.criar_igreja_no_cadastro();

-- ============================================================
-- 7. Função private.chave_lock_fechamento + trigger de proteção do
--    extrato + RPC fechar_caixa (lock exclusivo + cálculo atômico).
--    Ver comentário completo em schema.sql: o "conferir de novo e
--    desfazer se mudou" que uma versão anterior desta migração fazia
--    em JS não funciona (não existe policy de DELETE em
--    tab_fechamento_caixa, o delete de desfazer não apaga nada e o
--    fechamento errado fica gravado e travado). A trava de verdade é
--    esta: mesma chave de advisory lock no trigger (modo
--    compartilhado) e na RPC (modo exclusivo).
-- ============================================================
-- A chave usa p_data como número de dias (não como texto) porque
-- p_data::text depende do DateStyle da sessão — ver comentário
-- completo em schema.sql.
CREATE OR REPLACE FUNCTION private.chave_lock_fechamento(p_igreja_id UUID, p_data DATE)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT hashtextextended(p_igreja_id::text, (p_data - DATE '2000-01-01'))
$$;

GRANT EXECUTE ON FUNCTION private.chave_lock_fechamento(UUID, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.bloquear_lancamento_dia_fechado()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_dia DATE;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_dia := (NEW.data_hora AT TIME ZONE 'America/Sao_Paulo')::date;
    PERFORM pg_advisory_xact_lock_shared(private.chave_lock_fechamento(NEW.igreja_id, v_dia));
    IF EXISTS (SELECT 1 FROM public.tab_fechamento_caixa WHERE igreja_id = NEW.igreja_id AND data = v_dia) THEN
      RAISE EXCEPTION 'O caixa deste dia já foi fechado.';
    END IF;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    v_dia := (OLD.data_hora AT TIME ZONE 'America/Sao_Paulo')::date;
    PERFORM pg_advisory_xact_lock_shared(private.chave_lock_fechamento(OLD.igreja_id, v_dia));
    IF EXISTS (SELECT 1 FROM public.tab_fechamento_caixa WHERE igreja_id = OLD.igreja_id AND data = v_dia) THEN
      RAISE EXCEPTION 'O caixa deste dia já foi fechado.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_extrato_dia_fechado ON tab_extrato_financeiro;
CREATE TRIGGER trg_bloquear_extrato_dia_fechado
  BEFORE INSERT OR UPDATE OR DELETE ON tab_extrato_financeiro
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_lancamento_dia_fechado();

-- SECURITY DEFINER de propósito — ver comentário completo em
-- schema.sql: sem policy de INSERT client-side em tab_fechamento_caixa,
-- esta função (via BYPASSRLS do dono das tabelas) é o único jeito de
-- gravar um fechamento. É seguro porque ela nunca aceita igreja_id do
-- cliente (resolve a partir de auth.uid()) e todo valor numérico vem
-- de uma soma real sobre o extrato, não do que o chamador mandar.
CREATE OR REPLACE FUNCTION public.fechar_caixa(
  p_data DATE,
  p_saldo_inicial NUMERIC,
  p_valor_informado NUMERIC,
  p_observacoes TEXT DEFAULT NULL
)
RETURNS public.tab_fechamento_caixa
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_igreja_id UUID;
  v_entradas_dinheiro NUMERIC;
  v_entradas_pix NUMERIC;
  v_entradas_cartao NUMERIC;
  v_total_saidas NUMERIC;
  v_valor_calculado NUMERIC;
  v_diferenca NUMERIC;
  v_resultado public.tab_fechamento_caixa;
BEGIN
  SELECT igreja_id INTO v_igreja_id FROM public.igreja_membros WHERE user_id = (SELECT auth.uid());
  IF v_igreja_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma igreja associada à sua conta.';
  END IF;

  IF p_data > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Não é possível fechar um dia no futuro.';
  END IF;

  PERFORM pg_advisory_xact_lock(private.chave_lock_fechamento(v_igreja_id, p_data));

  IF EXISTS (SELECT 1 FROM public.tab_fechamento_caixa WHERE igreja_id = v_igreja_id AND data = p_data) THEN
    RAISE EXCEPTION 'Este dia já foi fechado.';
  END IF;

  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo_movimentacao = 'entrada' AND forma_pagamento = 'dinheiro'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo_movimentacao = 'entrada' AND forma_pagamento = 'pix'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo_movimentacao = 'entrada' AND forma_pagamento = 'cartao'), 0),
    COALESCE(SUM(valor) FILTER (WHERE tipo_movimentacao = 'saida'), 0)
  INTO v_entradas_dinheiro, v_entradas_pix, v_entradas_cartao, v_total_saidas
  FROM public.tab_extrato_financeiro
  WHERE igreja_id = v_igreja_id
    AND data_hora >= (p_data::timestamp AT TIME ZONE 'America/Sao_Paulo')
    AND data_hora < ((p_data + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo');

  v_valor_calculado := round(p_saldo_inicial + v_entradas_dinheiro - v_total_saidas, 2);
  v_diferenca := round(p_valor_informado - v_valor_calculado, 2);

  INSERT INTO public.tab_fechamento_caixa (
    igreja_id, user_id, data, saldo_inicial, entradas_dinheiro, entradas_pix,
    entradas_cartao, total_saidas, valor_calculado, valor_informado, diferenca, observacoes
  ) VALUES (
    v_igreja_id, auth.uid(), p_data, round(p_saldo_inicial, 2), round(v_entradas_dinheiro, 2),
    round(v_entradas_pix, 2), round(v_entradas_cartao, 2), round(v_total_saidas, 2),
    v_valor_calculado, round(p_valor_informado, 2), v_diferenca, p_observacoes
  )
  RETURNING * INTO v_resultado;

  RETURN v_resultado;
END;
$$;

-- Ver comentário completo em schema.sql: o Supabase concede EXECUTE
-- direto a `anon` por default privilege do schema public, então o
-- REVOKE FROM PUBLIC sozinho não basta.
REVOKE ALL ON FUNCTION public.fechar_caixa(DATE, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fechar_caixa(DATE, NUMERIC, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fechar_caixa(DATE, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ============================================================
-- 8. Tabela tab_reaberturas_caixa + RPC reabrir_caixa
--    (ver comentário completo em schema.sql — auditoria obrigatória
--    antes de apagar um fechamento, mesmo padrão de lock e de
--    SECURITY DEFINER de fechar_caixa)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_reaberturas_caixa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  -- Nullable + SET NULL (não CASCADE): ver comentário completo em
  -- schema.sql — o registro de auditoria não pode desaparecer se a
  -- conta de quem fechou/reabriu for excluída no futuro.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fechamento_id UUID NOT NULL,
  fechado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fechado_em TIMESTAMPTZ NOT NULL,
  data DATE NOT NULL,
  justificativa TEXT NOT NULL CHECK (btrim(justificativa) <> ''),
  saldo_inicial NUMERIC(10, 2) NOT NULL,
  entradas_dinheiro NUMERIC(10, 2) NOT NULL,
  entradas_pix NUMERIC(10, 2) NOT NULL,
  entradas_cartao NUMERIC(10, 2) NOT NULL,
  total_saidas NUMERIC(10, 2) NOT NULL,
  valor_calculado NUMERIC(10, 2) NOT NULL,
  valor_informado NUMERIC(10, 2) NOT NULL,
  diferenca NUMERIC(10, 2) NOT NULL,
  observacoes TEXT
);

ALTER TABLE tab_reaberturas_caixa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "membros_igreja_reaberturas_select" ON tab_reaberturas_caixa;
CREATE POLICY "membros_igreja_reaberturas_select" ON tab_reaberturas_caixa
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));

-- Reforço defensivo — ver comentário completo em schema.sql (não existe
-- policy de escrita pra nenhuma das duas, então isso não muda nada hoje;
-- só evita que uma policy futura adicionada por engano reabra escrita
-- direta).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tab_reaberturas_caixa FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tab_fechamento_caixa FROM anon, authenticated;

-- Só reabre o dia de HOJE — ver comentário completo em schema.sql
-- (reabrir um dia passado o deixaria aberto pra sempre, já que a tela
-- de fechamento só sabe fechar "hoje").
CREATE OR REPLACE FUNCTION public.reabrir_caixa(
  p_data DATE,
  p_justificativa TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_igreja_id UUID;
  v_fechamento public.tab_fechamento_caixa;
BEGIN
  IF p_justificativa IS NULL OR btrim(p_justificativa) = '' THEN
    RAISE EXCEPTION 'Informe a justificativa para reabrir o caixa.';
  END IF;

  IF p_data <> (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Só é possível reabrir o caixa do dia de hoje.';
  END IF;

  SELECT igreja_id INTO v_igreja_id FROM public.igreja_membros WHERE user_id = (SELECT auth.uid());
  IF v_igreja_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma igreja associada à sua conta.';
  END IF;

  PERFORM pg_advisory_xact_lock(private.chave_lock_fechamento(v_igreja_id, p_data));

  SELECT * INTO v_fechamento FROM public.tab_fechamento_caixa WHERE igreja_id = v_igreja_id AND data = p_data;
  IF v_fechamento IS NULL THEN
    RAISE EXCEPTION 'Este dia não está fechado.';
  END IF;

  INSERT INTO public.tab_reaberturas_caixa (
    igreja_id, user_id, fechamento_id, fechado_por, fechado_em, data, justificativa,
    saldo_inicial, entradas_dinheiro, entradas_pix, entradas_cartao, total_saidas,
    valor_calculado, valor_informado, diferenca, observacoes
  ) VALUES (
    v_igreja_id, auth.uid(), v_fechamento.id, v_fechamento.user_id, v_fechamento.created_at,
    p_data, btrim(p_justificativa), v_fechamento.saldo_inicial,
    v_fechamento.entradas_dinheiro, v_fechamento.entradas_pix, v_fechamento.entradas_cartao,
    v_fechamento.total_saidas, v_fechamento.valor_calculado, v_fechamento.valor_informado,
    v_fechamento.diferenca, v_fechamento.observacoes
  );

  DELETE FROM public.tab_fechamento_caixa WHERE igreja_id = v_igreja_id AND data = p_data;
END;
$$;

REVOKE ALL ON FUNCTION public.reabrir_caixa(DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reabrir_caixa(DATE, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reabrir_caixa(DATE, TEXT) TO authenticated;

-- ============================================================
-- 9. Índices
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_igreja_membros_user_id ON igreja_membros(user_id);
CREATE INDEX IF NOT EXISTS idx_igreja_membros_igreja_id ON igreja_membros(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_itens_igreja_id ON tab_itens(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_cardapio_dia_igreja_data ON tab_cardapio_dia(igreja_id, data);
CREATE INDEX IF NOT EXISTS idx_tab_vendas_igreja_id ON tab_vendas(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_extrato_igreja_id ON tab_extrato_financeiro(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_contas_receber_igreja_id ON tab_contas_receber(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_contas_pagar_igreja_id ON tab_contas_pagar(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_fechamento_igreja_data ON tab_fechamento_caixa(igreja_id, data);
CREATE INDEX IF NOT EXISTS idx_tab_reaberturas_igreja_id ON tab_reaberturas_caixa(igreja_id);

-- Índices antigos por user_id (idx_tab_itens_user_id etc.) continuam
-- existindo e não têm mais uso para RLS, mas não fazem mal — dropar
-- não é urgente.
