-- ============================================================
-- MIGRAÇÃO: papéis (admin/operador) + convite de membros (#53)
-- Rodar UMA VEZ no SQL Editor do projeto Supabase que já tem o schema
-- multi-igreja (supabase/migration-multi-igreja.sql já aplicada).
--
-- Depois de rodar este arquivo uma vez, supabase/schema.sql continua
-- sendo a referência do estado do banco (ele já reflete o resultado
-- desta migração). Instalação nova usa só o schema.sql.
--
-- Idempotente: pode rodar de novo sem quebrar nada (DROP POLICY IF
-- EXISTS / CREATE OR REPLACE / IF NOT EXISTS em tudo).
--
-- Quem hoje é `owner` vira `admin`; `membro` vira `operador`. Como
-- hoje não existe convite, na prática todo usuário atual é `owner` →
-- `admin`, então ninguém perde acesso com esta migração.
-- ============================================================

-- ============================================================
-- 1. igreja_membros: papel admin/operador + e-mail (snapshot)
--
-- `email` existe só pra tela de Equipe listar quem é quem: o e-mail
-- mora em auth.users, que o client não lê. É um snapshot do momento em
-- que a pessoa entrou na igreja — o app não tem troca de e-mail hoje.
-- ============================================================
ALTER TABLE igreja_membros DROP CONSTRAINT IF EXISTS igreja_membros_papel_check;
UPDATE igreja_membros SET papel = 'admin' WHERE papel = 'owner';
UPDATE igreja_membros SET papel = 'operador' WHERE papel = 'membro';
ALTER TABLE igreja_membros
  ALTER COLUMN papel SET DEFAULT 'operador',
  ADD CONSTRAINT igreja_membros_papel_check CHECK (papel IN ('admin', 'operador'));

ALTER TABLE igreja_membros ADD COLUMN IF NOT EXISTS email TEXT;
UPDATE igreja_membros m SET email = u.email
FROM auth.users u
WHERE u.id = m.user_id AND m.email IS NULL;

-- Só as RPCs abaixo (SECURITY DEFINER) e o trigger de cadastro escrevem
-- em igreja_membros. Hoje nenhuma policy de escrita existe; este REVOKE
-- impede que uma policy FOR ALL adicionada por engano no futuro abra
-- escrita direta (auto-promover-se a admin).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON igreja_membros FROM anon, authenticated;

-- ============================================================
-- 2. Helpers de papel (schema private, mesmo padrão de minhas_igrejas)
-- ============================================================
CREATE OR REPLACE FUNCTION private.igrejas_onde_sou_admin()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT igreja_id FROM public.igreja_membros
  WHERE user_id = (SELECT auth.uid()) AND papel = 'admin'
$$;

REVOKE ALL ON FUNCTION private.igrejas_onde_sou_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.igrejas_onde_sou_admin() TO authenticated;

CREATE OR REPLACE FUNCTION private.sou_admin(p_igreja_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.igreja_membros
    WHERE user_id = (SELECT auth.uid()) AND igreja_id = p_igreja_id AND papel = 'admin'
  )
$$;

REVOKE ALL ON FUNCTION private.sou_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.sou_admin(UUID) TO authenticated;

-- ============================================================
-- 3. RLS por papel
--
-- Permissive policies se somam com OR: "membros veem" (SELECT) +
-- "admins gerenciam" (FOR ALL) deixa todo membro ler e só admin
-- escrever. O operador só escreve onde uma policy de INSERT/UPDATE/
-- DELETE própria existe abaixo.
-- ============================================================
DROP POLICY IF EXISTS "membros_igreja_itens" ON tab_itens;
DROP POLICY IF EXISTS "membros_igreja_cardapio" ON tab_cardapio_dia;
DROP POLICY IF EXISTS "membros_igreja_cardapio_itens" ON tab_cardapio_dia_itens;
DROP POLICY IF EXISTS "membros_igreja_vendas" ON tab_vendas;
DROP POLICY IF EXISTS "membros_igreja_vendas_itens" ON tab_vendas_itens;
DROP POLICY IF EXISTS "membros_igreja_extrato" ON tab_extrato_financeiro;
DROP POLICY IF EXISTS "membros_igreja_contas_receber" ON tab_contas_receber;
DROP POLICY IF EXISTS "membros_igreja_contas_pagar" ON tab_contas_pagar;

-- Produtos e cardápio do dia: todos leem (Vendas precisa), só admin escreve.
DROP POLICY IF EXISTS "membros_veem_itens" ON tab_itens;
CREATE POLICY "membros_veem_itens" ON tab_itens
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
DROP POLICY IF EXISTS "admins_gerenciam_itens" ON tab_itens;
CREATE POLICY "admins_gerenciam_itens" ON tab_itens
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

DROP POLICY IF EXISTS "membros_veem_cardapio" ON tab_cardapio_dia;
CREATE POLICY "membros_veem_cardapio" ON tab_cardapio_dia
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
DROP POLICY IF EXISTS "admins_gerenciam_cardapio" ON tab_cardapio_dia;
CREATE POLICY "admins_gerenciam_cardapio" ON tab_cardapio_dia
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

DROP POLICY IF EXISTS "membros_veem_cardapio_itens" ON tab_cardapio_dia_itens;
CREATE POLICY "membros_veem_cardapio_itens" ON tab_cardapio_dia_itens
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
DROP POLICY IF EXISTS "admins_gerenciam_cardapio_itens" ON tab_cardapio_dia_itens;
CREATE POLICY "admins_gerenciam_cardapio_itens" ON tab_cardapio_dia_itens
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

-- Contas a Pagar: só admin, inclusive pra ler.
DROP POLICY IF EXISTS "admins_gerenciam_contas_pagar" ON tab_contas_pagar;
CREATE POLICY "admins_gerenciam_contas_pagar" ON tab_contas_pagar
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

-- Vendas: operador cria e lê; editar/cancelar (UPDATE) é só admin. O operador
-- também apaga a PRÓPRIA venda recente, mas só se ela ainda não tem nenhum
-- lançamento no extrato nem conta a receber ligada — é exatamente o rollback
-- de criarVenda quando um passo depois do INSERT da venda falha. Venda que já
-- mexeu em dinheiro só o admin cancela (cancelarVenda, com estorno); sem essa
-- trava o operador teria um "cancelar sem registro" via DELETE direto.
-- created_at é forçado por trg_fixar_datas_venda, então o cliente não
-- consegue empurrar a venda pra fora da janela de 5 minutos.
DROP POLICY IF EXISTS "membros_veem_vendas" ON tab_vendas;
CREATE POLICY "membros_veem_vendas" ON tab_vendas
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
DROP POLICY IF EXISTS "membros_criam_vendas" ON tab_vendas;
CREATE POLICY "membros_criam_vendas" ON tab_vendas
  FOR INSERT TO authenticated WITH CHECK (igreja_id IN (SELECT private.minhas_igrejas()));
DROP POLICY IF EXISTS "admins_gerenciam_vendas" ON tab_vendas;
CREATE POLICY "admins_gerenciam_vendas" ON tab_vendas
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));
DROP POLICY IF EXISTS "operador_desfaz_propria_venda_sem_lancamento" ON tab_vendas;
CREATE POLICY "operador_desfaz_propria_venda_sem_lancamento" ON tab_vendas
  FOR DELETE TO authenticated USING (
    igreja_id IN (SELECT private.minhas_igrejas())
    AND user_id = (SELECT auth.uid())
    AND created_at > now() - interval '5 minutes'
    AND NOT EXISTS (SELECT 1 FROM public.tab_extrato_financeiro e WHERE e.venda_id = tab_vendas.id)
    AND NOT EXISTS (SELECT 1 FROM public.tab_contas_receber c WHERE c.venda_id = tab_vendas.id)
  );

-- Itens da venda: operador lê e insere — mas só na PRÓPRIA venda recente (sem
-- isso ele encheria de itens uma venda de outra pessoa ou de outro dia, e o
-- detalhe deixaria de bater com o total). Apagar/editar item solto é só admin;
-- o rollback de criarVenda apaga a venda e o ON DELETE CASCADE leva os itens
-- junto (FK não passa por RLS).
DROP POLICY IF EXISTS "membros_veem_vendas_itens" ON tab_vendas_itens;
CREATE POLICY "membros_veem_vendas_itens" ON tab_vendas_itens
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
DROP POLICY IF EXISTS "membros_criam_vendas_itens" ON tab_vendas_itens;
CREATE POLICY "membros_criam_vendas_itens" ON tab_vendas_itens
  FOR INSERT TO authenticated WITH CHECK (
    igreja_id IN (SELECT private.minhas_igrejas())
    AND EXISTS (
      SELECT 1 FROM public.tab_vendas v
      WHERE v.id = tab_vendas_itens.venda_id
        AND v.igreja_id = tab_vendas_itens.igreja_id
        AND v.user_id = (SELECT auth.uid())
        AND v.created_at > now() - interval '5 minutes'
    )
  );
DROP POLICY IF EXISTS "admins_gerenciam_vendas_itens" ON tab_vendas_itens;
CREATE POLICY "admins_gerenciam_vendas_itens" ON tab_vendas_itens
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

-- Extrato: todos leem; operador só INSERE entrada de venda/recebimento
-- (nunca saída nem despesa paga); editar/excluir é só admin.
DROP POLICY IF EXISTS "membros_veem_extrato" ON tab_extrato_financeiro;
CREATE POLICY "membros_veem_extrato" ON tab_extrato_financeiro
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
DROP POLICY IF EXISTS "membros_lancam_entrada_extrato" ON tab_extrato_financeiro;
CREATE POLICY "membros_lancam_entrada_extrato" ON tab_extrato_financeiro
  FOR INSERT TO authenticated WITH CHECK (
    igreja_id IN (SELECT private.minhas_igrejas())
    AND tipo_movimentacao = 'entrada'
    AND conta_pagar_id IS NULL
  );
DROP POLICY IF EXISTS "admins_gerenciam_extrato" ON tab_extrato_financeiro;
CREATE POLICY "admins_gerenciam_extrato" ON tab_extrato_financeiro
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

-- Contas a Receber: operador lê e cria (fiado nasce de uma venda; nunca já
-- paga). DAR BAIXA é pela RPC baixar_conta_receber — atômica: marca a conta,
-- sincroniza a venda e lança a entrada no extrato numa transação só. UPDATE
-- direto, editar e excluir são só admin: com UPDATE solto o operador marcaria
-- a conta como recebida sem lançar nada no caixa (ou reabriria uma já
-- recebida e faria o cliente pagar duas vezes).
DROP POLICY IF EXISTS "membros_veem_contas_receber" ON tab_contas_receber;
CREATE POLICY "membros_veem_contas_receber" ON tab_contas_receber
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
DROP POLICY IF EXISTS "membros_criam_contas_receber" ON tab_contas_receber;
CREATE POLICY "membros_criam_contas_receber" ON tab_contas_receber
  FOR INSERT TO authenticated WITH CHECK (
    igreja_id IN (SELECT private.minhas_igrejas()) AND COALESCE(pago, false) = false
  );
DROP POLICY IF EXISTS "admins_gerenciam_contas_receber" ON tab_contas_receber;
CREATE POLICY "admins_gerenciam_contas_receber" ON tab_contas_receber
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

-- ============================================================
-- 4. Datas de venda vêm do servidor
-- ============================================================
CREATE OR REPLACE FUNCTION public.fixar_datas_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- created_at/data_hora de venda vêm do servidor quando quem insere é um
  -- usuário final (auth.uid() não nulo) — a janela de 5 minutos das policies
  -- de operador e o "dia" da venda não podem depender de um valor que o
  -- cliente manda. auth.uid() nulo = SQL Editor/service_role: migração e
  -- correção manual podem gravar a data que quiserem.
  IF (SELECT auth.uid()) IS NOT NULL THEN
    NEW.created_at := now();
    NEW.data_hora := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fixar_datas_venda ON tab_vendas;
CREATE TRIGGER trg_fixar_datas_venda
  BEFORE INSERT ON tab_vendas
  FOR EACH ROW EXECUTE FUNCTION public.fixar_datas_venda();

-- ============================================================
-- 5. fechar_caixa / reabrir_caixa: só admin
-- (mesmo corpo de antes; a única mudança é ler o papel e recusar
-- quem não é admin logo depois de resolver a igreja.)
-- ============================================================
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
  v_papel TEXT;
  v_entradas_dinheiro NUMERIC;
  v_entradas_pix NUMERIC;
  v_entradas_cartao NUMERIC;
  v_total_saidas NUMERIC;
  v_valor_calculado NUMERIC;
  v_diferenca NUMERIC;
  v_resultado public.tab_fechamento_caixa;
BEGIN
  SELECT igreja_id, papel INTO v_igreja_id, v_papel
  FROM public.igreja_membros WHERE user_id = (SELECT auth.uid());
  IF v_igreja_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma igreja associada à sua conta.';
  END IF;
  IF v_papel <> 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem fechar o caixa.';
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

REVOKE ALL ON FUNCTION public.fechar_caixa(DATE, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fechar_caixa(DATE, NUMERIC, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fechar_caixa(DATE, NUMERIC, NUMERIC, TEXT) TO authenticated;

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
  v_papel TEXT;
  v_fechamento public.tab_fechamento_caixa;
BEGIN
  IF p_justificativa IS NULL OR btrim(p_justificativa) = '' THEN
    RAISE EXCEPTION 'Informe a justificativa para reabrir o caixa.';
  END IF;

  IF p_data <> (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Só é possível reabrir o caixa do dia de hoje.';
  END IF;

  SELECT igreja_id, papel INTO v_igreja_id, v_papel
  FROM public.igreja_membros WHERE user_id = (SELECT auth.uid());
  IF v_igreja_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma igreja associada à sua conta.';
  END IF;
  IF v_papel <> 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem reabrir o caixa.';
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
-- 5b. baixar_conta_receber
-- ============================================================
-- RPC: baixar_conta_receber(conta, forma_pagamento)
--
-- Dar baixa num fiado = marcar a conta como paga + sincronizar o status da
-- venda + lançar a entrada no extrato. Antes isso eram 3 chamadas do client
-- com rollback manual em cada ponto; com o operador sem UPDATE direto em
-- contas/vendas (ver policies), tem que ser uma RPC, e uma transação só
-- resolve de graça o que o JS tratava na mão: conta paga sem entrada no
-- extrato, baixa concorrente com cancelarVenda, caixa fechado no meio.
--
-- Trava a VENDA antes da conta (mesma ordem em que cancelarVenda mexe nelas:
-- venda -> conta) e relê a conta já travada: um cancelamento concorrente
-- espera aqui e é visto (a baixa é recusada). cancelarVenda não é uma
-- transação — são statements com autocommit —, então a espera é só pelo
-- UPDATE do status; o resultado é o mesmo. Uma edição de valor concorrente
-- TAMBÉM espera aqui, mas seria lançada com o valor novo sem ninguém
-- perceber: por isso p_valor_esperado (o valor que a tela mostrou ao
-- operador) — se a conta mudou, a baixa é recusada em vez de lançar um valor
-- diferente do que foi cobrado. Se o dia já estiver fechado, o trigger de
-- extrato levanta a exceção e TUDO é desfeito (conta e venda voltam).
-- SECURITY DEFINER porque o operador não tem UPDATE direto nessas tabelas;
-- seguro porque a igreja vem de auth.uid() (nunca do cliente), os valores
-- gravados vêm da própria conta e a forma só aceita dinheiro/pix/cartao.
CREATE OR REPLACE FUNCTION public.baixar_conta_receber(
  p_conta_id UUID,
  p_forma_pagamento TEXT,
  p_valor_esperado NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_igreja_id UUID;
  v_venda_id UUID;
  v_status TEXT;
  v_conta public.tab_contas_receber;
BEGIN
  IF p_forma_pagamento IS NULL OR p_forma_pagamento NOT IN ('dinheiro', 'pix', 'cartao') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;

  SELECT igreja_id INTO v_igreja_id FROM public.igreja_membros WHERE user_id = (SELECT auth.uid());
  IF v_igreja_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma igreja associada à sua conta.';
  END IF;

  SELECT venda_id INTO v_venda_id
  FROM public.tab_contas_receber WHERE id = p_conta_id AND igreja_id = v_igreja_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada.';
  END IF;

  IF v_venda_id IS NOT NULL THEN
    SELECT status INTO v_status
    FROM public.tab_vendas WHERE id = v_venda_id AND igreja_id = v_igreja_id
    FOR UPDATE;
    IF v_status = 'cancelado' THEN
      RAISE EXCEPTION 'A venda desta conta foi cancelada. Não é possível receber.';
    END IF;
  END IF;

  SELECT * INTO v_conta
  FROM public.tab_contas_receber WHERE id = p_conta_id AND igreja_id = v_igreja_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada. Atualize a página.';
  END IF;
  IF v_conta.venda_id IS DISTINCT FROM v_venda_id THEN
    RAISE EXCEPTION 'Esta conta foi alterada por outra pessoa. Atualize a página e tente de novo.';
  END IF;
  IF v_conta.pago THEN
    RAISE EXCEPTION 'Esta conta já foi recebida.';
  END IF;
  IF p_valor_esperado IS NULL OR v_conta.valor_devido <> p_valor_esperado THEN
    RAISE EXCEPTION 'O valor desta conta mudou. Atualize a página e confira antes de receber.';
  END IF;

  UPDATE public.tab_contas_receber
  SET pago = true,
      data_baixa = (now() AT TIME ZONE 'America/Sao_Paulo')::date,
      forma_pagamento_baixa = p_forma_pagamento
  WHERE id = p_conta_id AND igreja_id = v_igreja_id;

  IF v_venda_id IS NOT NULL THEN
    UPDATE public.tab_vendas SET status = 'pago'
    WHERE id = v_venda_id AND igreja_id = v_igreja_id;
  END IF;

  INSERT INTO public.tab_extrato_financeiro (
    user_id, igreja_id, tipo_movimentacao, forma_pagamento, valor, descricao, venda_id
  ) VALUES (
    auth.uid(), v_igreja_id, 'entrada', p_forma_pagamento, v_conta.valor_devido,
    'Recebimento fiado - ' || v_conta.cliente, v_conta.venda_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.baixar_conta_receber(UUID, TEXT, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.baixar_conta_receber(UUID, TEXT, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.baixar_conta_receber(UUID, TEXT, NUMERIC) TO authenticated;

-- ============================================================
-- 6. Convites
--
-- Link de uso único (token aleatório de 64 hex = duas UUID v4, geradas
-- pelo gerador criptográfico do Postgres) que o admin manda pra quem
-- vai entrar. Só o HASH do token fica no banco: um vazamento da tabela
-- não entrega links válidos. Vale 7 dias.
--
-- O cadastro por convite é resolvido no trigger de cadastro (seção 7),
-- não numa server action, pelo mesmo motivo da igreja nova: se a
-- confirmação de e-mail estiver ligada, auth.uid() fica nulo depois do
-- signUp() e qualquer insert client-side cairia fora por RLS.
-- ============================================================
CREATE TABLE IF NOT EXISTS igreja_convites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  -- SET NULL, não CASCADE: excluir a conta de quem convidou não apaga o
  -- histórico de convites (nem o vínculo de quem já entrou por ele).
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  papel TEXT NOT NULL CHECK (papel IN ('admin', 'operador')),
  token_hash BYTEA NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  usado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_igreja_convites_igreja_id ON igreja_convites(igreja_id);

ALTER TABLE igreja_convites ENABLE ROW LEVEL SECURITY;

-- Admin vê e revoga (só convite ainda não usado) os da própria igreja.
-- Criar é só pela RPC criar_convite (precisa gerar o token e gravar o
-- hash), então não há policy de INSERT/UPDATE.
DROP POLICY IF EXISTS "admins_veem_convites" ON igreja_convites;
CREATE POLICY "admins_veem_convites" ON igreja_convites
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));
DROP POLICY IF EXISTS "admins_revogam_convites" ON igreja_convites;
CREATE POLICY "admins_revogam_convites" ON igreja_convites
  FOR DELETE TO authenticated USING (
    igreja_id IN (SELECT private.igrejas_onde_sou_admin()) AND usado_em IS NULL
  );

REVOKE ALL ON igreja_convites FROM anon;
REVOKE INSERT, UPDATE, TRUNCATE ON igreja_convites FROM authenticated;

-- Gera o convite e devolve o token em texto — única vez que ele existe
-- fora do hash; a tela monta o link com ele e mostra na hora.
CREATE OR REPLACE FUNCTION public.criar_convite(p_papel TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_igreja_id UUID;
  v_token TEXT;
BEGIN
  IF p_papel IS NULL OR p_papel NOT IN ('admin', 'operador') THEN
    RAISE EXCEPTION 'Papel inválido.';
  END IF;

  SELECT igreja_id INTO v_igreja_id
  FROM public.igreja_membros
  WHERE user_id = (SELECT auth.uid()) AND papel = 'admin';
  IF v_igreja_id IS NULL THEN
    RAISE EXCEPTION 'Apenas administradores podem convidar membros.';
  END IF;

  IF (
    SELECT count(*) FROM public.igreja_convites
    WHERE igreja_id = v_igreja_id AND usado_em IS NULL AND expira_em > now()
  ) >= 20 THEN
    RAISE EXCEPTION 'Há convites demais em aberto. Revogue algum antes de criar outro.';
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.igreja_convites (igreja_id, criado_por, papel, token_hash, expira_em)
  VALUES (v_igreja_id, auth.uid(), p_papel, sha256(convert_to(v_token, 'utf8')), now() + interval '7 days');

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_convite(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_convite(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.criar_convite(TEXT) TO authenticated;

-- Única função SECURITY DEFINER que `anon` PODE executar, de propósito:
-- a tela de cadastro por convite precisa conferir o link antes de existir
-- sessão. Só devolve nome da igreja e papel, e só pra quem já tem o token
-- (64 hex, inadivinhável) — sem token válido, zero linhas.
CREATE OR REPLACE FUNCTION public.consultar_convite(p_token TEXT)
RETURNS TABLE (nome_igreja TEXT, papel TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT i.nome, c.papel
  FROM public.igreja_convites c
  JOIN public.igrejas i ON i.id = c.igreja_id
  WHERE c.token_hash = sha256(convert_to(btrim(p_token), 'utf8'))
    AND c.usado_em IS NULL
    AND c.expira_em > now()
$$;

REVOKE ALL ON FUNCTION public.consultar_convite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consultar_convite(TEXT) TO anon, authenticated;

-- ============================================================
-- 6b. Gestão da equipe (RPCs — igreja_membros não tem policy de escrita)
--
-- As duas travam a linha da igreja (FOR UPDATE) ANTES de conferir o
-- papel de quem chama: sem isso, dois admins se rebaixando ao mesmo
-- tempo passariam os dois pela checagem "ainda sobra um admin" e a
-- igreja ficaria sem nenhum.
-- ============================================================
CREATE OR REPLACE FUNCTION public.alterar_papel_membro(p_user_id UUID, p_papel TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_igreja_id UUID;
  v_papel_chamador TEXT;
BEGIN
  IF p_papel IS NULL OR p_papel NOT IN ('admin', 'operador') THEN
    RAISE EXCEPTION 'Papel inválido.';
  END IF;

  SELECT igreja_id INTO v_igreja_id
  FROM public.igreja_membros WHERE user_id = (SELECT auth.uid());
  IF v_igreja_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma igreja associada à sua conta.';
  END IF;

  PERFORM 1 FROM public.igrejas WHERE id = v_igreja_id FOR UPDATE;

  SELECT papel INTO v_papel_chamador
  FROM public.igreja_membros
  WHERE user_id = (SELECT auth.uid()) AND igreja_id = v_igreja_id;
  IF v_papel_chamador IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar papéis.';
  END IF;

  UPDATE public.igreja_membros SET papel = p_papel
  WHERE user_id = p_user_id AND igreja_id = v_igreja_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membro não encontrado.';
  END IF;

  -- Rebaixado não pode deixar convite de admin "guardado": sem isso ele
  -- cria uma conta nova com o token que já tinha e volta a ser admin.
  IF p_papel <> 'admin' THEN
    DELETE FROM public.igreja_convites WHERE criado_por = p_user_id AND usado_em IS NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.igreja_membros WHERE igreja_id = v_igreja_id AND papel = 'admin'
  ) THEN
    RAISE EXCEPTION 'A igreja precisa ter pelo menos um administrador.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.alterar_papel_membro(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.alterar_papel_membro(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.alterar_papel_membro(UUID, TEXT) TO authenticated;

-- Remove só o VÍNCULO. A conta de login continua existindo: excluir a
-- linha de auth.users apagaria as vendas/lançamentos da pessoa por
-- ON DELETE CASCADE. Sem vínculo, minhas_igrejas() já volta vazio e a
-- RLS nega os dados de negócio na hora — mesmo com o JWT antigo ainda
-- válido. Única exceção: o fundador (igrejas.owner_user_id) continua lendo o
-- id/nome da própria igreja pela policy membros_veem_propria_igreja.
CREATE OR REPLACE FUNCTION public.remover_membro(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_igreja_id UUID;
  v_papel_chamador TEXT;
BEGIN
  IF p_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Você não pode remover a si mesmo.';
  END IF;

  SELECT igreja_id INTO v_igreja_id
  FROM public.igreja_membros WHERE user_id = (SELECT auth.uid());
  IF v_igreja_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma igreja associada à sua conta.';
  END IF;

  PERFORM 1 FROM public.igrejas WHERE id = v_igreja_id FOR UPDATE;

  SELECT papel INTO v_papel_chamador
  FROM public.igreja_membros
  WHERE user_id = (SELECT auth.uid()) AND igreja_id = v_igreja_id;
  IF v_papel_chamador IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem remover membros.';
  END IF;

  DELETE FROM public.igreja_membros WHERE user_id = p_user_id AND igreja_id = v_igreja_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membro não encontrado.';
  END IF;

  -- Mesmo motivo de alterar_papel_membro: convite em aberto de quem saiu morre junto.
  DELETE FROM public.igreja_convites WHERE criado_por = p_user_id AND usado_em IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.remover_membro(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remover_membro(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.remover_membro(UUID) TO authenticated;

-- ============================================================
-- 7. Trigger de cadastro: igreja nova OU entrada por convite
--
-- Com `convite` no metadata do signUp, a pessoa entra na igreja do
-- convite com o papel dele (e o convite é consumido na mesma transação);
-- sem, cria uma igreja nova e vira admin dela, como antes. Convite
-- inválido/expirado/já usado aborta o cadastro inteiro (RAISE desfaz o
-- INSERT em auth.users) — o app confere antes com consultar_convite pra
-- dar uma mensagem decente, isto aqui é a garantia contra corrida.
-- ============================================================
CREATE OR REPLACE FUNCTION public.criar_igreja_no_cadastro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  nova_igreja_id UUID;
  v_token TEXT;
  v_convite public.igreja_convites;
BEGIN
  v_token := btrim(NEW.raw_user_meta_data->>'convite');

  IF v_token IS NOT NULL AND v_token <> '' THEN
    SELECT * INTO v_convite
    FROM public.igreja_convites
    WHERE token_hash = sha256(convert_to(v_token, 'utf8'))
      AND usado_em IS NULL
      AND expira_em > now()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Convite inválido ou expirado.';
    END IF;

    INSERT INTO public.igreja_membros (igreja_id, user_id, papel, email)
    VALUES (v_convite.igreja_id, NEW.id, v_convite.papel, NEW.email);

    UPDATE public.igreja_convites
    SET usado_em = now(), usado_por = NEW.id
    WHERE id = v_convite.id;

    RETURN NEW;
  END IF;

  INSERT INTO public.igrejas (nome, owner_user_id)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'nome_igreja', 'Minha Igreja'), NEW.id)
  RETURNING id INTO nova_igreja_id;

  INSERT INTO public.igreja_membros (igreja_id, user_id, papel, email)
  VALUES (nova_igreja_id, NEW.id, 'admin', NEW.email);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_igreja_no_cadastro() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_igreja_no_cadastro() FROM anon;
REVOKE ALL ON FUNCTION public.criar_igreja_no_cadastro() FROM authenticated;
