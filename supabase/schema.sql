-- ============================================================
-- CANTINA+ — Schema do Banco de Dados
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA: tab_itens (Produtos)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  preco NUMERIC(10, 2) NOT NULL CHECK (preco >= 0),
  imagem_url TEXT,
  ativo BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- TABELA: tab_cardapio_dia (Cardápio do Dia)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_cardapio_dia (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  observacoes TEXT,
  UNIQUE (user_id, data)
);

-- ============================================================
-- TABELA: tab_cardapio_dia_itens (Itens do Cardápio)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_cardapio_dia_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cardapio_id UUID NOT NULL REFERENCES tab_cardapio_dia(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES tab_itens(id) ON DELETE CASCADE,
  UNIQUE (cardapio_id, item_id)
);

-- ============================================================
-- TABELA: tab_vendas (Vendas)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_vendas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_pedido SERIAL,
  cliente TEXT,
  data_hora TIMESTAMPTZ DEFAULT NOW(),
  total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  desconto NUMERIC(10, 2) DEFAULT 0 CHECK (desconto >= 0),
  forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('dinheiro', 'pix', 'cartao', 'fiado')),
  status TEXT DEFAULT 'pago' CHECK (status IN ('pendente', 'pago', 'cancelado'))
);

-- ============================================================
-- TABELA: tab_vendas_itens (Itens da Venda)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_vendas_itens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venda_id UUID NOT NULL REFERENCES tab_vendas(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES tab_itens(id),
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  valor_unitario NUMERIC(10, 2) NOT NULL CHECK (valor_unitario >= 0),
  subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0)
);

-- ============================================================
-- TABELA: tab_extrato_financeiro (Extrato)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_extrato_financeiro (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_hora TIMESTAMPTZ DEFAULT NOW(),
  tipo_movimentacao TEXT NOT NULL CHECK (tipo_movimentacao IN ('entrada', 'saida')),
  forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('dinheiro', 'pix', 'cartao', 'fiado')),
  valor NUMERIC(10, 2) NOT NULL CHECK (valor >= 0),
  descricao TEXT NOT NULL,
  venda_id UUID REFERENCES tab_vendas(id) ON DELETE SET NULL
);

-- ============================================================
-- TABELA: tab_contas_receber (Fiado)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_contas_receber (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente TEXT NOT NULL,
  valor_devido NUMERIC(10, 2) NOT NULL CHECK (valor_devido >= 0),
  data_venda DATE NOT NULL,
  descricao TEXT,
  pago BOOLEAN DEFAULT FALSE,
  data_baixa DATE,
  forma_pagamento_baixa TEXT CHECK (forma_pagamento_baixa IN ('dinheiro', 'pix', 'cartao')),
  venda_id UUID REFERENCES tab_vendas(id) ON DELETE SET NULL
);

-- ============================================================
-- TABELA: tab_contas_pagar (Despesas)
-- ============================================================
CREATE TABLE IF NOT EXISTS tab_contas_pagar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor NUMERIC(10, 2) NOT NULL CHECK (valor >= 0),
  data DATE NOT NULL,
  pago BOOLEAN DEFAULT FALSE,
  categoria TEXT
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Garante que cada usuário só vê seus próprios dados
-- ============================================================

ALTER TABLE tab_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_cardapio_dia ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_cardapio_dia_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_vendas_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_extrato_financeiro ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_contas_pagar ENABLE ROW LEVEL SECURITY;

-- Políticas para tab_itens
CREATE POLICY "usuarios_proprios_itens" ON tab_itens
  FOR ALL USING (auth.uid() = user_id);

-- Políticas para tab_cardapio_dia
CREATE POLICY "usuarios_proprios_cardapio" ON tab_cardapio_dia
  FOR ALL USING (auth.uid() = user_id);

-- Políticas para tab_cardapio_dia_itens (via cardapio do dono)
CREATE POLICY "usuarios_proprios_cardapio_itens" ON tab_cardapio_dia_itens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tab_cardapio_dia
      WHERE id = cardapio_id AND user_id = auth.uid()
    )
  );

-- Políticas para tab_vendas
CREATE POLICY "usuarios_proprias_vendas" ON tab_vendas
  FOR ALL USING (auth.uid() = user_id);

-- Políticas para tab_vendas_itens (via venda do dono)
CREATE POLICY "usuarios_proprios_vendas_itens" ON tab_vendas_itens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tab_vendas
      WHERE id = venda_id AND user_id = auth.uid()
    )
  );

-- Políticas para tab_extrato_financeiro
CREATE POLICY "usuarios_proprio_extrato" ON tab_extrato_financeiro
  FOR ALL USING (auth.uid() = user_id);

-- Políticas para tab_contas_receber
CREATE POLICY "usuarios_proprias_contas_receber" ON tab_contas_receber
  FOR ALL USING (auth.uid() = user_id);

-- Políticas para tab_contas_pagar
CREATE POLICY "usuarios_proprias_contas_pagar" ON tab_contas_pagar
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- ÍNDICES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tab_itens_user_id ON tab_itens(user_id);
CREATE INDEX IF NOT EXISTS idx_tab_cardapio_dia_user_data ON tab_cardapio_dia(user_id, data);
CREATE INDEX IF NOT EXISTS idx_tab_vendas_user_id ON tab_vendas(user_id);
CREATE INDEX IF NOT EXISTS idx_tab_vendas_data_hora ON tab_vendas(data_hora);
CREATE INDEX IF NOT EXISTS idx_tab_extrato_user_id ON tab_extrato_financeiro(user_id);
CREATE INDEX IF NOT EXISTS idx_tab_contas_receber_user_id ON tab_contas_receber(user_id);
CREATE INDEX IF NOT EXISTS idx_tab_contas_receber_pago ON tab_contas_receber(pago);
CREATE INDEX IF NOT EXISTS idx_tab_contas_pagar_user_id ON tab_contas_pagar(user_id);
