-- ============================================================
-- CANTINA+ — Schema do Banco de Dados
-- Execute este script no SQL Editor do Supabase
--
-- Multi-igreja: cada registro pertence a uma "igreja" (tenant).
-- Um usuário pertence a exatamente 1 igreja via igreja_membros, e o
-- isolamento de dados (RLS) é por igreja, não por usuário — assim
-- vários usuários da mesma igreja compartilham os mesmos dados.
-- `user_id` nas tabelas de negócio continua existindo só como
-- registro de "quem fez", não é mais usado para isolamento.
--
-- Papéis (#53): cada membro é `admin` ou `operador`. Operador vende,
-- dá baixa em fiado e lê; o resto (cancelar venda, Contas a Pagar,
-- fechar caixa, equipe...) é só admin — aplicado aqui no banco (RLS,
-- triggers e RPCs), não só escondendo botão na tela. Membros novos
-- entram por link de convite (igreja_convites).
--
-- Para atualizar um projeto Supabase que já tem o schema antigo
-- (sem igreja_id), use supabase/migration-multi-igreja.sql; se já
-- tem multi-igreja mas não tem papéis, use supabase/migration-papeis.sql.
-- Este arquivo é o estado-alvo, para instalações novas.
-- ============================================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA: igrejas (Tenant)
-- ============================================================
CREATE TABLE IF NOT EXISTS igrejas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  nome TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ============================================================
-- TABELA: igreja_membros (vínculo usuário <-> igreja)
-- ============================================================
CREATE TABLE IF NOT EXISTS igreja_membros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel TEXT NOT NULL DEFAULT 'operador' CHECK (papel IN ('admin', 'operador')),
  -- Snapshot do e-mail de quando a pessoa entrou na igreja — só pra tela de
  -- Equipe listar quem é quem (o e-mail mora em auth.users, que o client
  -- não lê). O app não tem troca de e-mail hoje.
  email TEXT,
  -- Um usuário pertence a no máximo 1 igreja por enquanto (convite só vale
  -- pra conta nova). Isso também garante que getIgrejaIdAtual() nunca
  -- resolva igrejas diferentes em chamadas diferentes para o mesmo usuário.
  UNIQUE (user_id)
);

-- ============================================================
-- TABELA: igreja_convites (link de uso único pra entrar numa igreja)
--
-- Só o HASH do token fica no banco: um vazamento da tabela não entrega
-- links válidos. O token (64 hex = duas UUID v4, do gerador criptográfico
-- do Postgres) é devolvido uma única vez por criar_convite. Vale 7 dias.
-- O cadastro por convite é resolvido no trigger de cadastro
-- (criar_igreja_no_cadastro, mais abaixo).
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

-- ============================================================
-- TABELA: tab_itens (Produtos)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  preco NUMERIC(10, 2) NOT NULL CHECK (preco >= 0),
  imagem_url TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  -- Sustenta a FK composta (item_id, igreja_id) das tabelas filhas (#21) —
  -- sem isso, referenciar um item por FK simples só confere que o UUID
  -- existe em algum lugar, não que é da mesma igreja de quem referencia.
  UNIQUE (id, igreja_id)
);

-- ============================================================
-- TABELA: tab_cardapio_dia (Cardápio do Dia)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_cardapio_dia (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  observacoes TEXT,
  UNIQUE (igreja_id, data),
  UNIQUE (id, igreja_id)
);

-- ============================================================
-- TABELA: tab_cardapio_dia_itens (Itens do Cardápio)
-- ============================================================
-- igreja_id próprio (não só via cardapio_id) sustenta a FK composta (#21):
-- sem ela, item_id UUID REFERENCES tab_itens(id) só confere que o UUID
-- existe em ALGUMA igreja — um membro conseguiria, via API direta,
-- referenciar um item_id de outra igreja no próprio cardápio (RLS ainda
-- esconde a leitura, mas cria um vínculo cruzado que pode quebrar
-- excluirProduto da igreja dona do item por violação de FK).
CREATE TABLE IF NOT EXISTS tab_cardapio_dia_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  cardapio_id UUID NOT NULL,
  item_id UUID NOT NULL,
  UNIQUE (cardapio_id, item_id),
  CONSTRAINT tab_cardapio_dia_itens_cardapio_id_fkey
    FOREIGN KEY (cardapio_id, igreja_id) REFERENCES tab_cardapio_dia (id, igreja_id) ON DELETE CASCADE,
  CONSTRAINT tab_cardapio_dia_itens_item_id_fkey
    FOREIGN KEY (item_id, igreja_id) REFERENCES tab_itens (id, igreja_id) ON DELETE CASCADE
);

-- ============================================================
-- TABELA: tab_vendas (Vendas)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_vendas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  -- Não é mais SERIAL: uma sequência global compartilhada entre todas as
  -- igrejas do banco deixava o "número do pedido" revelar o volume de
  -- vendas de OUTRAS igrejas (ex.: igreja A vê seus pedidos saltarem de
  -- #40 pra #97, e sabe que outras igrejas venderam ~57 nesse meio tempo).
  -- O valor é atribuído pelo trigger trg_numerar_venda_por_igreja (mais
  -- abaixo), que numera cada igreja a partir de 1, na sua própria sequência.
  numero_pedido INTEGER NOT NULL,
  cliente TEXT,
  data_hora TIMESTAMPTZ DEFAULT NOW(),
  total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  desconto NUMERIC(10, 2) DEFAULT 0 CHECK (desconto >= 0),
  forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('dinheiro', 'pix', 'cartao', 'fiado')),
  status TEXT DEFAULT 'pago' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  UNIQUE (igreja_id, numero_pedido),
  UNIQUE (id, igreja_id)
);

-- ============================================================
-- TABELA: tab_vendas_itens (Itens da Venda)
-- ============================================================
-- Mesmo raciocínio de tab_cardapio_dia_itens: igreja_id próprio pra FK
-- composta (#21), fechando o mesmo tipo de vínculo cruzado entre igrejas.
CREATE TABLE IF NOT EXISTS tab_vendas_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  venda_id UUID NOT NULL,
  item_id UUID NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  valor_unitario NUMERIC(10, 2) NOT NULL CHECK (valor_unitario >= 0),
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
  CONSTRAINT tab_vendas_itens_venda_id_fkey
    FOREIGN KEY (venda_id, igreja_id) REFERENCES tab_vendas (id, igreja_id) ON DELETE CASCADE,
  CONSTRAINT tab_vendas_itens_item_id_fkey
    FOREIGN KEY (item_id, igreja_id) REFERENCES tab_itens (id, igreja_id)
);

-- ============================================================
-- TABELA: tab_extrato_financeiro (Extrato)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_extrato_financeiro (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  data_hora TIMESTAMPTZ DEFAULT NOW(),
  tipo_movimentacao TEXT NOT NULL CHECK (tipo_movimentacao IN ('entrada', 'saida')),
  forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('dinheiro', 'pix', 'cartao', 'fiado')),
  valor NUMERIC(10, 2) NOT NULL CHECK (valor >= 0),
  descricao TEXT NOT NULL,
  -- Composta com igreja_id (#21): FK simples só confere que o UUID existe
  -- em alguma venda de alguma igreja, não que é da mesma igreja da linha
  -- do extrato.
  venda_id UUID,
  CONSTRAINT tab_extrato_financeiro_venda_id_fkey
    FOREIGN KEY (venda_id, igreja_id) REFERENCES tab_vendas (id, igreja_id) ON DELETE SET NULL (venda_id)
);

-- ============================================================
-- TABELA: tab_contas_receber (Fiado)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_contas_receber (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  cliente TEXT NOT NULL,
  valor_devido NUMERIC(10, 2) NOT NULL CHECK (valor_devido >= 0),
  data_venda DATE NOT NULL,
  descricao TEXT,
  pago BOOLEAN DEFAULT FALSE,
  data_baixa DATE,
  forma_pagamento_baixa TEXT CHECK (forma_pagamento_baixa IN ('dinheiro', 'pix', 'cartao')),
  -- Composta com igreja_id (#21), mesmo motivo de tab_extrato_financeiro.
  venda_id UUID,
  CONSTRAINT tab_contas_receber_venda_id_fkey
    FOREIGN KEY (venda_id, igreja_id) REFERENCES tab_vendas (id, igreja_id) ON DELETE SET NULL (venda_id)
);

-- ============================================================
-- TABELA: tab_contas_pagar (Despesas)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_contas_pagar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC(10, 2) NOT NULL CHECK (valor >= 0),
  data DATE NOT NULL,
  pago BOOLEAN DEFAULT FALSE,
  categoria TEXT,
  UNIQUE (id, igreja_id)
);

-- conta_pagar_id vem depois da CREATE TABLE (não dentro dela) porque
-- tab_contas_pagar só existe a partir daqui — tab_extrato_financeiro é
-- criada antes (#12). Liga a saída lançada por pagarConta de volta à
-- despesa que a gerou, pra permitir editar/excluir a movimentação de
-- despesa paga sincronizado com o estado em Contas a Pagar (issue #8,
-- hoje bloqueada por não existir esse link).
--
-- FK composta (conta_pagar_id, igreja_id), não só conta_pagar_id: a
-- checagem de FK do Postgres roda como dono da tabela e ignora RLS, então
-- uma FK simples deixaria um membro gravar (via API direta) um
-- conta_pagar_id apontando pra uma conta de OUTRA igreja — sem vazar
-- dado (RLS ainda esconde a leitura), mas abrindo uma trava permanente
-- entre igrejas: se A excluir a conta ligada, o ON DELETE SET NULL vira
-- um UPDATE na linha do extrato de A, mas se o UUID fosse de uma conta de
-- B, o SET NULL ainda mexe só na linha de A — o risco real é a #8 usar
-- esse link no sentido inverso (extrato -> conta) numa RPC sem checar
-- igreja_id, e aí sim editar/excluir despesa de outra igreja. A FK
-- composta fecha isso no banco, não só no código. `SET NULL (coluna)`
-- exige Postgres 15+ (o projeto real roda Postgres 17).
ALTER TABLE tab_extrato_financeiro
  ADD COLUMN conta_pagar_id UUID,
  ADD CONSTRAINT tab_extrato_financeiro_conta_pagar_id_fkey
    FOREIGN KEY (conta_pagar_id, igreja_id) REFERENCES tab_contas_pagar (id, igreja_id)
    ON DELETE SET NULL (conta_pagar_id);

-- ============================================================
-- TABELA: tab_fechamento_caixa (Fechamento do Dia)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_fechamento_caixa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- SET NULL, não CASCADE: excluir a conta de quem fechou o caixa não pode
  -- apagar o fechamento em si — perderia a trava do dia fechado (o trigger
  -- em tab_extrato_financeiro rejeita lançamento no dia se existe linha
  -- aqui) e todo o auditoria já registrada, sem passar pela RPC
  -- reabrir_caixa. Mesmo padrão já usado em tab_reaberturas_caixa (#20).
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  saldo_inicial NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (saldo_inicial >= 0),
  entradas_dinheiro NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (entradas_dinheiro >= 0),
  entradas_pix NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (entradas_pix >= 0),
  entradas_cartao NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (entradas_cartao >= 0),
  total_saidas NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_saidas >= 0),
  valor_calculado NUMERIC(10, 2) NOT NULL,
  valor_informado NUMERIC(10, 2) NOT NULL CHECK (valor_informado >= 0),
  diferenca NUMERIC(10, 2) NOT NULL,
  observacoes TEXT,
  UNIQUE (igreja_id, data)
);

-- ============================================================
-- FUNÇÃO: private.minhas_igrejas()
-- Retorna as igrejas de que o usuário logado é membro.
--
-- Precisa ser SECURITY DEFINER: uma policy de igreja_membros que faz
-- subquery direto na própria igreja_membros causa erro do Postgres
-- "infinite recursion detected in policy" (42P17). Como esta função
-- roda com o privilégio de quem a criou (o owner das tabelas, que no
-- Supabase tem BYPASSRLS), a leitura interna ignora RLS e a recursão
-- nunca chega a acontecer. Todas as policies abaixo (inclusive a de
-- igreja_membros) usam essa função em vez de repetir a subquery.
--
-- Fica no schema `private` (não exposto pelo PostgREST) em vez de
-- `public`, e sem GRANT para `anon`/PUBLIC — assim ela não pode ser
-- chamada como RPC de fora, só usada dentro de outra policy.
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

-- Papel do usuário logado (#53). Mesmo padrão e mesmo motivo de
-- minhas_igrejas(): SECURITY DEFINER pra ler igreja_membros sem recursão de
-- RLS, schema private pra não virar RPC pública.
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
-- ROW LEVEL SECURITY (RLS)
-- Garante que cada usuário só vê os dados das igrejas de que é membro
-- ============================================================

ALTER TABLE igrejas ENABLE ROW LEVEL SECURITY;
ALTER TABLE igreja_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE igreja_convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_cardapio_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_cardapio_dia_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_vendas_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_extrato_financeiro ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_fechamento_caixa ENABLE ROW LEVEL SECURITY;

-- Políticas para igrejas e igreja_membros: só SELECT para o cliente.
-- Não existe policy de INSERT/UPDATE/DELETE para `authenticated` de
-- propósito — o único jeito de criar uma igreja e o vínculo do dono é o
-- trigger `trg_criar_igreja_no_cadastro` (ver mais abaixo), que roda como
-- SECURITY DEFINER e por isso ignora RLS. Entrar numa igreja existente é
-- só por convite (criar_convite / trigger de cadastro), e mudar papel ou
-- remover membro é só pelas RPCs alterar_papel_membro / remover_membro —
-- isso fecha a brecha de um usuário se auto-inserir como membro (ou
-- admin) de qualquer igreja que ele reivindique ser "dele".
CREATE POLICY "membros_veem_propria_igreja" ON igrejas
  FOR SELECT TO authenticated USING (
    owner_user_id = (SELECT auth.uid())
    OR id IN (SELECT private.minhas_igrejas())
  );

CREATE POLICY "membros_veem_colegas_de_igreja" ON igreja_membros
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));

-- Convites: admin vê e revoga (só os ainda não usados) os da própria
-- igreja. Criar é só pela RPC criar_convite (precisa gerar o token e
-- gravar o hash), então não há policy de INSERT/UPDATE.
CREATE POLICY "admins_veem_convites" ON igreja_convites
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));
CREATE POLICY "admins_revogam_convites" ON igreja_convites
  FOR DELETE TO authenticated USING (
    igreja_id IN (SELECT private.igrejas_onde_sou_admin()) AND usado_em IS NULL
  );

-- Reforço defensivo (sem brecha hoje, já que não existe policy de escrita):
-- o Supabase concede GRANT ALL de tabela pra `anon`/`authenticated` por
-- padrão — impede que uma policy FOR ALL adicionada por engano no futuro
-- deixe alguém se auto-promover a admin ou forjar um convite.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON igreja_membros FROM anon, authenticated;
REVOKE ALL ON igreja_convites FROM anon;
REVOKE INSERT, UPDATE, TRUNCATE ON igreja_convites FROM authenticated;

-- Permissive policies se somam com OR: "membros veem" (SELECT) + "admins
-- gerenciam" (FOR ALL) deixa todo membro ler e só admin escrever. O
-- operador só escreve onde uma policy de INSERT/UPDATE/DELETE própria
-- existe abaixo (#53).
--
-- Itens das tabelas filhas (tab_cardapio_dia_itens, tab_vendas_itens) usam
-- igreja_id próprio direto, não subquery na tabela-pai (#21): o subquery só
-- cobria USING, sem WITH CHECK explícito.

-- Produtos e cardápio do dia: todos leem (Vendas precisa), só admin escreve.
CREATE POLICY "membros_veem_itens" ON tab_itens
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
CREATE POLICY "admins_gerenciam_itens" ON tab_itens
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

CREATE POLICY "membros_veem_cardapio" ON tab_cardapio_dia
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
CREATE POLICY "admins_gerenciam_cardapio" ON tab_cardapio_dia
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

CREATE POLICY "membros_veem_cardapio_itens" ON tab_cardapio_dia_itens
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
CREATE POLICY "admins_gerenciam_cardapio_itens" ON tab_cardapio_dia_itens
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

-- Contas a Pagar: só admin, inclusive pra ler.
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
CREATE POLICY "membros_veem_vendas" ON tab_vendas
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
CREATE POLICY "membros_criam_vendas" ON tab_vendas
  FOR INSERT TO authenticated WITH CHECK (igreja_id IN (SELECT private.minhas_igrejas()));
CREATE POLICY "admins_gerenciam_vendas" ON tab_vendas
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));
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
CREATE POLICY "membros_veem_vendas_itens" ON tab_vendas_itens
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
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
CREATE POLICY "admins_gerenciam_vendas_itens" ON tab_vendas_itens
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

-- Extrato: todos leem; operador só INSERE entrada de venda/recebimento
-- (nunca saída nem despesa paga); editar/excluir é só admin.
CREATE POLICY "membros_veem_extrato" ON tab_extrato_financeiro
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
CREATE POLICY "membros_lancam_entrada_extrato" ON tab_extrato_financeiro
  FOR INSERT TO authenticated WITH CHECK (
    igreja_id IN (SELECT private.minhas_igrejas())
    AND tipo_movimentacao = 'entrada'
    AND conta_pagar_id IS NULL
  );
CREATE POLICY "admins_gerenciam_extrato" ON tab_extrato_financeiro
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

-- Contas a Receber: operador lê e cria (fiado nasce de uma venda; nunca já
-- paga). DAR BAIXA é pela RPC baixar_conta_receber — atômica: marca a conta,
-- sincroniza a venda e lança a entrada no extrato numa transação só. UPDATE
-- direto, editar e excluir são só admin: com UPDATE solto o operador marcaria
-- a conta como recebida sem lançar nada no caixa (ou reabriria uma já
-- recebida e faria o cliente pagar duas vezes).
CREATE POLICY "membros_veem_contas_receber" ON tab_contas_receber
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));
CREATE POLICY "membros_criam_contas_receber" ON tab_contas_receber
  FOR INSERT TO authenticated WITH CHECK (
    igreja_id IN (SELECT private.minhas_igrejas()) AND COALESCE(pago, false) = false
  );
CREATE POLICY "admins_gerenciam_contas_receber" ON tab_contas_receber
  FOR ALL TO authenticated USING (igreja_id IN (SELECT private.igrejas_onde_sou_admin()))
  WITH CHECK (igreja_id IN (SELECT private.igrejas_onde_sou_admin()));

-- Políticas para tab_fechamento_caixa: só SELECT para o cliente. Sem
-- policy de INSERT/UPDATE/DELETE de propósito — o único jeito de gravar
-- um fechamento é a RPC fechar_caixa (ver mais abaixo), que calcula os
-- valores a partir do extrato real em vez de aceitar o que o cliente
-- mandar. Com uma policy de INSERT aberta, qualquer membro poderia
-- gravar um fechamento direto via API com valores inventados, data
-- fora do dia ou user_id de outra pessoa — a RPC vira só "um jeito
-- mais fácil" em vez de "o único jeito", e a trava de dia fechado nas
-- outras tabelas passa a valer pra um fechamento que não reflete a
-- realidade.
CREATE POLICY "membros_igreja_fechamento_select" ON tab_fechamento_caixa
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));

-- ============================================================
-- TRIGGER: datas de venda vêm do servidor (#53)
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

CREATE TRIGGER trg_fixar_datas_venda
  BEFORE INSERT ON tab_vendas
  FOR EACH ROW EXECUTE FUNCTION public.fixar_datas_venda();

-- ============================================================
-- TRIGGER: numerar venda por igreja
--
-- numero_pedido não tem mais DEFAULT (era SERIAL, uma sequência global
-- compartilhada entre igrejas — ver comentário na definição de
-- tab_vendas). Este trigger atribui o próximo número dentro da própria
-- igreja. Não é SECURITY DEFINER: a leitura do MAX já respeita a RLS
-- normal (só vê vendas da própria igreja), e se alguém tentar inserir
-- com igreja_id de outra igreja, a policy de INSERT de tab_vendas
-- rejeita o INSERT inteiro mais adiante, então o número calculado aqui
-- nunca chega a ser usado.
--
-- Corrida possível: duas vendas na mesma igreja no mesmíssimo instante
-- podem calcular o mesmo próximo número; o UNIQUE(igreja_id,
-- numero_pedido) da tabela rejeita a segunda com um erro comum de
-- constraint (sem lock dedicado — é raro demais numa cantina pequena
-- pra justificar o custo de travar toda venda) e criarVenda já aborta
-- direto se o insert em tab_vendas falhar.
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

CREATE TRIGGER trg_numerar_venda_por_igreja
  BEFORE INSERT ON tab_vendas
  FOR EACH ROW EXECUTE FUNCTION public.numerar_venda_por_igreja();

-- ============================================================
-- TRIGGER: criar igreja + vínculo de admin no cadastro (ou entrar por convite)
--
-- O client não tem mais como inserir em igrejas/igreja_membros (não
-- existe policy de INSERT para `authenticated` nessas tabelas — ver
-- acima). Fazer os dois inserts a partir da server action de signup
-- também não funciona: o INSERT em igrejas dá RETURNING (precisa
-- passar pela policy de SELECT antes do vínculo existir) e, se a
-- confirmação de e-mail estiver ligada no projeto, signUp() volta sem
-- sessão — auth.uid() fica nulo e qualquer insert cai fora por RLS.
--
-- Este trigger roda a nível de banco, como SECURITY DEFINER (ignora
-- RLS), disparado direto pela criação da linha em auth.users — que
-- acontece sempre, com ou sem confirmação de e-mail pendente. Os dois
-- inserts (igreja + vínculo owner) ficam atômicos com a criação do
-- usuário: não existe estado intermediário de "usuário sem igreja".
--
-- search_path = '' (em vez de "= public") com nomes totalmente
-- qualificados: sem isso, uma sessão com uma tabela temporária chamada
-- "igrejas" ou "igreja_membros" faria este INSERT gravar ali em vez de
-- na tabela real (o Postgres procura em pg_temp antes de public,
-- mesmo com search_path setado — é o mesmo tipo de ataque do
-- CVE-2018-1058). Aplica-se o mesmo em fechar_caixa mais abaixo.
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

DROP TRIGGER IF EXISTS trg_criar_igreja_no_cadastro ON auth.users;
CREATE TRIGGER trg_criar_igreja_no_cadastro
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.criar_igreja_no_cadastro();

-- Sem grant de propósito: o Supabase concede EXECUTE a PUBLIC por
-- default privilege do schema public, o que expõe qualquer função
-- SECURITY DEFINER como RPC (/rest/v1/rpc/criar_igreja_no_cadastro)
-- mesmo sem nenhum GRANT explícito — flagrado pelo linter do Supabase
-- (anon/authenticated_security_definer_function_executable). O
-- trigger continua funcionando normalmente sem esses grants: o
-- disparo AFTER INSERT não passa pelo mesmo caminho de permissão de
-- uma chamada RPC.
REVOKE ALL ON FUNCTION public.criar_igreja_no_cadastro() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_igreja_no_cadastro() FROM anon;
REVOKE ALL ON FUNCTION public.criar_igreja_no_cadastro() FROM authenticated;

-- ============================================================
-- FUNÇÃO: private.chave_lock_fechamento(igreja_id, data)
--
-- Chave de advisory lock (pg_advisory_xact_lock) compartilhada entre o
-- trigger de proteção e a RPC fechar_caixa — as duas travam a MESMA
-- chave (igreja + dia) pra que uma nunca rode no meio da outra. Sem
-- uma trava real, um "conferir de novo depois de gravar e desfazer se
-- mudou" não funciona: não existe policy de DELETE em
-- tab_fechamento_caixa (de propósito — fechamento é imutável), então
-- esse "desfazer" simplesmente não apaga nada e o fechamento errado
-- fica gravado e travado.
-- ============================================================
-- A chave usa p_data como número de dias (não como texto) porque
-- p_data::text depende do DateStyle da sessão — se algum dia um
-- lançamento ou fechamento vier de uma conexão com DateStyle diferente
-- (SQL Editor, um cron, etc.), a chave calculada mudaria e o lock
-- deixaria de travar nada. Com a subtração de datas isso não depende
-- de configuração de sessão, e a função é IMMUTABLE de fato.
CREATE OR REPLACE FUNCTION private.chave_lock_fechamento(p_igreja_id UUID, p_data DATE)
RETURNS BIGINT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT hashtextextended(p_igreja_id::text, (p_data - DATE '2000-01-01'))
$$;

GRANT EXECUTE ON FUNCTION private.chave_lock_fechamento(UUID, DATE) TO authenticated;

-- ============================================================
-- TRIGGER: bloquear alteração no extrato de um dia já fechado
--
-- vendas.ts/financeiro.ts já checam diaFechado() antes de agir, mas
-- isso é check-then-act: com múltiplos usuários da mesma igreja, um
-- INSERT (nova venda/pagamento), DELETE (cancelamento) ou UPDATE no
-- extrato pode acontecer depois que outro membro já fechou o caixa
-- daquele dia. Nenhuma action do app faz UPDATE em
-- tab_extrato_financeiro hoje, mas a policy de RLS (FOR ALL) permite —
-- cobrir os 3 aqui evita que alguém chamando a API direto altere valor
-- ou mova data_hora de um lançamento pra dentro/fora de um dia
-- fechado sem passar pelo lock. No UPDATE, confere tanto o dia de OLD
-- quanto o de NEW (a linha pode estar saindo de um dia fechado ou
-- entrando nele).
--
-- Pega um lock COMPARTILHADO antes de checar: isso faz o INSERT/DELETE
-- esperar se a RPC fechar_caixa (que pega o lock EXCLUSIVO da mesma
-- chave) estiver no meio do cálculo do resumo — sem essa espera, um
-- lançamento poderia passar despercebido bem entre o cálculo do
-- resumo e a gravação do fechamento, e nenhum dos dois lados veria o
-- outro a tempo.
--
-- Não é SECURITY DEFINER de propósito: se fosse, a consulta interna
-- ignoraria RLS e um membro poderia inferir se OUTRA igreja fechou o
-- caixa num dia (a mensagem de erro muda). Sem SECURITY DEFINER, a
-- consulta roda com RLS normal — só vê o fechamento da própria
-- igreja, que é o único caso que interessa (o INSERT/DELETE de outra
-- igreja já seria rejeitado pela policy de RLS de qualquer forma).
-- ============================================================
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

CREATE TRIGGER trg_bloquear_extrato_dia_fechado
  BEFORE INSERT OR UPDATE OR DELETE ON tab_extrato_financeiro
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_lancamento_dia_fechado();

-- ============================================================
-- RPC: fechar_caixa(data, saldo_inicial, valor_informado, observacoes)
--
-- Substitui o padrão antigo (JS calcula o resumo, depois insere) por
-- uma única transação no banco: pega o lock EXCLUSIVO da chave
-- (igreja, dia) — esperando o trigger acima liberar qualquer
-- INSERT/DELETE de extrato em andamento —, soma o extrato e grava o
-- fechamento, tudo de uma vez. Isso fecha de verdade a corrida entre
-- uma venda sendo confirmada e o fechamento sendo calculado, que
-- calcular no JS e inserir depois não conseguia fechar.
--
-- É SECURITY DEFINER de propósito: como não existe mais policy de
-- INSERT em tab_fechamento_caixa para `authenticated`, esta função
-- (via BYPASSRLS do dono das tabelas) é o ÚNICO jeito de gravar um
-- fechamento — nem client-side, nem chamando o PostgREST direto.
-- Isso é seguro porque a função nunca aceita igreja_id do cliente:
-- resolve v_igreja_id sozinha a partir de quem está autenticado
-- (auth.uid()), e todos os valores gravados (entradas, saídas, valor
-- calculado) vêm de uma soma real sobre o extrato daquela igreja, não
-- do que o chamador mandar — só saldo_inicial, valor_informado e
-- observações são entrada do usuário, e são exatamente os três campos
-- que sempre foram preenchidos manualmente (quem conta a gaveta).
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
  -- Só admin fecha o caixa (#53) — a nível de banco, não só na tela.
  IF v_papel <> 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem fechar o caixa.';
  END IF;

  IF p_data > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'Não é possível fechar um dia no futuro.';
  END IF;

  -- Espera qualquer INSERT/DELETE de extrato em andamento (trigger acima)
  -- terminar antes de somar, e bloqueia novos até este fechamento commitar.
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

-- Toda função nova recebe EXECUTE de PUBLIC por padrão no Postgres. No
-- Supabase isso não basta pra bloquear `anon`: o schema `public` tem um
-- default privilege próprio que concede EXECUTE direto ao role `anon`
-- (não via PUBLIC), então REVOKE ... FROM PUBLIC sozinho não tira o
-- acesso dele — precisa do REVOKE explícito abaixo. Hoje isso não vaza
-- nada (sem sessão, auth.uid() é nulo e a função cai no RAISE de
-- "nenhuma igreja"), mas o EXECUTE não deveria estar disponível pra
-- começo.
REVOKE ALL ON FUNCTION public.fechar_caixa(DATE, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fechar_caixa(DATE, NUMERIC, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.fechar_caixa(DATE, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ============================================================
-- TABELA: tab_reaberturas_caixa (auditoria de reabertura)
--
-- tab_fechamento_caixa não tem policy de UPDATE/DELETE pra
-- `authenticated` (de propósito — um fechamento é imutável). A única
-- forma de reabrir é a RPC reabrir_caixa (mais abaixo), que apaga a
-- linha de tab_fechamento_caixa — e por isso grava um snapshot aqui
-- ANTES de apagar, com a justificativa obrigatória. Sem isso o
-- registro de que aquele fechamento existiu (e por que foi desfeito)
-- se perderia.
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_reaberturas_caixa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  igreja_id UUID NOT NULL REFERENCES igrejas(id) ON DELETE CASCADE,
  -- Quem reabriu. Nullable + SET NULL (não CASCADE): se essa conta for
  -- excluída no futuro (hoje não é possível pelo app, mas passa a ser
  -- quando existir gestão de membros), o registro de auditoria não pode
  -- desaparecer junto — é exatamente o rastro que essa tabela existe pra
  -- preservar.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Snapshot de quem fechou e quando — sem isso o registro só mostra quem
  -- reabriu, perdendo a metade mais importante da auditoria.
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

-- Só SELECT pra `authenticated` — mesma lógica de tab_fechamento_caixa:
-- sem policy de INSERT, só a RPC reabrir_caixa (SECURITY DEFINER)
-- escreve aqui, então o registro de auditoria não pode ser forjado ou
-- apagado pelo client.
CREATE POLICY "membros_igreja_reaberturas_select" ON tab_reaberturas_caixa
  FOR SELECT TO authenticated USING (igreja_id IN (SELECT private.minhas_igrejas()));

-- Reforço defensivo (sem brecha hoje, já que não existe policy de
-- escrita pra nenhuma das duas): o Postgres/Supabase concede GRANT ALL
-- de tabela pra `anon`/`authenticated` por padrão — a imutabilidade
-- depende só de não existir policy. Isso evita que uma policy `FOR ALL`
-- adicionada por engano no futuro reabra escrita direta nessas tabelas.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tab_reaberturas_caixa FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON tab_fechamento_caixa FROM anon, authenticated;

-- ============================================================
-- RPC: reabrir_caixa(data, justificativa)
--
-- Desfaz um fechamento por engano ou erro de cálculo. Mesmo padrão de
-- fechar_caixa: resolve a igreja sozinha via auth.uid() (nunca aceita
-- igreja_id do cliente), SECURITY DEFINER (única forma de escrever em
-- tab_fechamento_caixa/tab_reaberturas_caixa), search_path = '' com
-- nomes qualificados.
--
-- Pega o mesmo advisory lock exclusivo de fechar_caixa antes de agir:
-- sem isso, reabrir ao mesmo tempo em que outro membro fecha o mesmo
-- dia (ou em que um INSERT no extrato está esperando o lock
-- compartilhado do trigger) criaria uma corrida nova, exatamente a
-- classe de problema que o lock de fechar_caixa já resolve.
--
-- Só reabre o dia de HOJE (America/Sao_Paulo). Sem essa trava, reabrir
-- um dia passado deixaria esse dia aberto pra sempre: a tela de
-- fechamento só sabe fechar "hoje" (resumoDoDia() sem parâmetro), então
-- nenhuma tela conseguiria fechá-lo de novo depois. É a mesma trava a
-- nível de banco, não só na UI — chamando a RPC direto também é bloqueado.
-- ============================================================
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
  -- Só admin reabre o caixa (#53).
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
-- RPCs de convite e de gestão da equipe (#53)
-- ============================================================
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
-- ÍNDICES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_igreja_membros_user_id ON igreja_membros(user_id);
CREATE INDEX IF NOT EXISTS idx_igreja_membros_igreja_id ON igreja_membros(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_itens_igreja_id ON tab_itens(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_cardapio_dia_igreja_data ON tab_cardapio_dia(igreja_id, data);
CREATE INDEX IF NOT EXISTS idx_tab_vendas_igreja_id ON tab_vendas(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_vendas_data_hora ON tab_vendas(data_hora);
CREATE INDEX IF NOT EXISTS idx_tab_extrato_igreja_id ON tab_extrato_financeiro(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_contas_receber_igreja_id ON tab_contas_receber(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_contas_receber_pago ON tab_contas_receber(pago);
CREATE INDEX IF NOT EXISTS idx_tab_contas_pagar_igreja_id ON tab_contas_pagar(igreja_id);
CREATE INDEX IF NOT EXISTS idx_tab_fechamento_igreja_data ON tab_fechamento_caixa(igreja_id, data);
CREATE INDEX IF NOT EXISTS idx_tab_reaberturas_igreja_id ON tab_reaberturas_caixa(igreja_id);
CREATE INDEX IF NOT EXISTS idx_igreja_convites_igreja_id ON igreja_convites(igreja_id);
