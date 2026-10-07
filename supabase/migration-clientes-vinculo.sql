-- ============================================================
-- MIGRAÇÃO: vínculo cliente ↔ venda/fiado (#56) — rodar no SQL Editor
-- do projeto Supabase que já rodou supabase/migration-clientes.sql (#55).
--
-- O que faz:
--   1. Adiciona cliente_id em tab_vendas e tab_contas_receber, com FK
--      composta (cliente_id, igreja_id) → tab_clientes (padrão #21) e SEM
--      ON DELETE SET NULL/CASCADE (NO ACTION): cliente só é arquivado.
--   2. Backfill: o que já foi lançado com nome em texto livre vira cliente
--      cadastrado e ganha cliente_id. Sem isso, o fiado antigo não entra
--      no saldo por cliente da #57.
--
-- É idempotente (pode rodar de novo). Rode DEPOIS de aplicar o código
-- novo também se alguma venda for lançada entre a migração e o deploy: o
-- código antigo grava só o nome em texto, e rodar o script de novo vincula
-- essas linhas.
--
-- ALTERA tabelas existentes (tab_vendas, tab_contas_receber) — rode fora
-- do horário de uso (não durante um culto). O lock_timeout abaixo faz o
-- script falhar rápido, sem travar o app, se não conseguir a trava.
--
-- Depois de rodar, supabase/schema.sql continua sendo a referência do
-- estado do banco (ele já inclui as colunas e FKs).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- ------------------------------------------------------------
-- 1. Colunas e FKs
-- ------------------------------------------------------------
ALTER TABLE tab_vendas ADD COLUMN IF NOT EXISTS cliente_id UUID;
ALTER TABLE tab_contas_receber ADD COLUMN IF NOT EXISTS cliente_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tab_vendas_cliente_id_fkey'
      AND conrelid = 'public.tab_vendas'::regclass
  ) THEN
    ALTER TABLE tab_vendas
      ADD CONSTRAINT tab_vendas_cliente_id_fkey
      FOREIGN KEY (cliente_id, igreja_id) REFERENCES tab_clientes (id, igreja_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tab_contas_receber_cliente_id_fkey'
      AND conrelid = 'public.tab_contas_receber'::regclass
  ) THEN
    ALTER TABLE tab_contas_receber
      ADD CONSTRAINT tab_contas_receber_cliente_id_fkey
      FOREIGN KEY (cliente_id, igreja_id) REFERENCES tab_clientes (id, igreja_id);
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 2. Backfill
-- ------------------------------------------------------------
-- Mesma normalização de normalizarNome (src/app/actions/clientes.ts):
-- NFC, remove caracteres invisíveis, colapsa espaços, tira as pontas e
-- corta em 100 caracteres (limite do CHECK de tab_clientes.nome). Função
-- temporária (pg_temp): some sozinha no fim da sessão.
CREATE FUNCTION pg_temp.norm_nome(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT left(
    btrim(
      regexp_replace(
        -- chr(): U+200B..U+200D, U+2060, U+FEFF (invisíveis). Escrito com chr() e não
        -- com o caractere literal pra sobreviver a copiar/colar no SQL Editor.
        regexp_replace(
          normalize(coalesce(t, ''), NFC),
          '[' || chr(8203) || '-' || chr(8205) || chr(8288) || chr(65279) || ']',
          '', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    100
  )
$$;

-- 2a. Um cliente por nome distinto (sem diferenciar maiúscula/minúscula)
-- por igreja, usando a grafia mais antiga. Quem já existe em tab_clientes
-- (índice único por lower(btrim(nome))) é só reaproveitado — DO NOTHING.
-- Inclui o "Cliente" que criarVenda gravava como nome padrão de fiado sem
-- nome: vira um cliente chamado "Cliente" pra essa dívida não ficar sem
-- dono — renomeie depois em Cadastros → Clientes se for uma pessoa só.
INSERT INTO tab_clientes (user_id, igreja_id, nome)
SELECT DISTINCT ON (igreja_id, lower(nome_norm))
       user_id, igreja_id, nome_norm
FROM (
  SELECT user_id, igreja_id, created_at, pg_temp.norm_nome(cliente) AS nome_norm
  FROM tab_contas_receber
  WHERE cliente_id IS NULL
  UNION ALL
  SELECT user_id, igreja_id, created_at, pg_temp.norm_nome(cliente) AS nome_norm
  FROM tab_vendas
  WHERE cliente_id IS NULL
) nomes
WHERE nome_norm <> ''
ORDER BY igreja_id, lower(nome_norm), created_at
ON CONFLICT DO NOTHING;

-- 2b. Vincula as contas a receber pelo nome.
UPDATE tab_contas_receber c
SET cliente_id = cl.id
FROM tab_clientes cl
WHERE c.cliente_id IS NULL
  AND pg_temp.norm_nome(c.cliente) <> ''
  AND cl.igreja_id = c.igreja_id
  AND lower(btrim(cl.nome)) = lower(pg_temp.norm_nome(c.cliente));

-- 2c. Vincula as vendas pelo nome.
UPDATE tab_vendas v
SET cliente_id = cl.id
FROM tab_clientes cl
WHERE v.cliente_id IS NULL
  AND pg_temp.norm_nome(v.cliente) <> ''
  AND cl.igreja_id = v.igreja_id
  AND lower(btrim(cl.nome)) = lower(pg_temp.norm_nome(v.cliente));

-- 2d. Venda fiado sem nome (criarVenda aceitava) herda o cliente da conta
-- a receber ligada a ela, e o nome da cópia em texto, pra Vendas e
-- Contas a Receber concordarem sobre de quem é aquele fiado.
UPDATE tab_vendas v
SET cliente_id = c.cliente_id,
    cliente = c.cliente
FROM tab_contas_receber c
WHERE v.cliente_id IS NULL
  AND c.venda_id = v.id
  AND c.igreja_id = v.igreja_id
  AND c.cliente_id IS NOT NULL;

COMMIT;

-- ------------------------------------------------------------
-- 3. Conferência (roda depois do COMMIT; resultado de uma linha só)
--    contas_sem_cliente      → esperado 0 (se sobrar alguma, é conta com nome em branco:
--                              abra em Contas a Receber → editar e escolha o cliente)
--    fiados_sem_cliente      → esperado 0
--    vendas_avulsas          → vendas à vista sem cliente (normal ter)
--    clientes_cadastrados    → total em tab_clientes
-- ------------------------------------------------------------
SELECT
  (SELECT count(*) FROM tab_contas_receber WHERE cliente_id IS NULL) AS contas_sem_cliente,
  (SELECT count(*) FROM tab_vendas WHERE forma_pagamento = 'fiado' AND cliente_id IS NULL) AS fiados_sem_cliente,
  (SELECT count(*) FROM tab_vendas WHERE forma_pagamento <> 'fiado' AND cliente_id IS NULL) AS vendas_avulsas,
  (SELECT count(*) FROM tab_clientes) AS clientes_cadastrados;
