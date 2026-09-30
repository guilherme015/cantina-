export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Papel = "admin" | "operador"

export interface Database {
  public: {
    Tables: {
      igrejas: {
        Row: {
          id: string
          created_at: string
          nome: string
          owner_user_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          nome: string
          owner_user_id: string
        }
        Update: {
          id?: string
          nome?: string
        }
        Relationships: []
      }
      igreja_membros: {
        Row: {
          id: string
          created_at: string
          igreja_id: string
          user_id: string
          papel: Papel
          email: string | null
        }
        // O client não escreve em igreja_membros (sem policy nem GRANT de
        // escrita) — entrar numa igreja é pelo trigger de cadastro/convite e
        // mudar papel é pela RPC alterar_papel_membro. Insert/Update ficam
        // aqui só pra satisfazer o formato do supabase-js.
        Insert: {
          id?: string
          created_at?: string
          igreja_id: string
          user_id: string
          papel?: Papel
          email?: string | null
        }
        Update: {
          id?: string
          papel?: Papel
        }
        Relationships: [
          {
            foreignKeyName: "igreja_membros_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
        ]
      }
      igreja_convites: {
        Row: {
          id: string
          created_at: string
          igreja_id: string
          criado_por: string | null
          papel: Papel
          expira_em: string
          usado_em: string | null
          usado_por: string | null
        }
        // token_hash fica de fora de propósito: o client nunca lê nem grava o
        // hash (criar_convite gera o token e grava o hash no banco).
        Insert: {
          id?: string
          igreja_id: string
          papel: Papel
          expira_em: string
        }
        Update: {
          id?: string
        }
        Relationships: []
      }
      tab_itens: {
        Row: {
          id: string
          created_at: string
          nome: string
          preco: number
          imagem_url: string | null
          ativo: boolean
          user_id: string
          igreja_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          nome: string
          preco: number
          imagem_url?: string | null
          ativo?: boolean
          user_id: string
          igreja_id: string
        }
        Update: {
          id?: string
          nome?: string
          preco?: number
          imagem_url?: string | null
          ativo?: boolean
        }
        Relationships: []
      }
      tab_cardapio_dia: {
        Row: {
          id: string
          created_at: string
          data: string
          observacoes: string | null
          user_id: string
          igreja_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          data: string
          observacoes?: string | null
          user_id: string
          igreja_id: string
        }
        Update: {
          id?: string
          data?: string
          observacoes?: string | null
        }
        Relationships: []
      }
      tab_cardapio_dia_itens: {
        Row: {
          id: string
          cardapio_id: string
          item_id: string
          igreja_id: string
        }
        Insert: {
          id?: string
          cardapio_id: string
          item_id: string
          igreja_id: string
        }
        Update: {
          id?: string
          cardapio_id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_cardapio_dia_itens_cardapio_id_fkey"
            columns: ["cardapio_id", "igreja_id"]
            isOneToOne: false
            referencedRelation: "tab_cardapio_dia"
            referencedColumns: ["id", "igreja_id"]
          },
          {
            foreignKeyName: "tab_cardapio_dia_itens_item_id_fkey"
            columns: ["item_id", "igreja_id"]
            isOneToOne: false
            referencedRelation: "tab_itens"
            referencedColumns: ["id", "igreja_id"]
          },
        ]
      }
      tab_vendas: {
        Row: {
          id: string
          created_at: string
          numero_pedido: number
          cliente: string | null
          data_hora: string
          total: number
          desconto: number
          forma_pagamento: "dinheiro" | "pix" | "cartao" | "fiado"
          status: "pendente" | "pago" | "cancelado"
          user_id: string
          igreja_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          numero_pedido?: number
          cliente?: string | null
          data_hora?: string
          total: number
          desconto?: number
          forma_pagamento: "dinheiro" | "pix" | "cartao" | "fiado"
          status?: "pendente" | "pago" | "cancelado"
          user_id: string
          igreja_id: string
        }
        Update: {
          id?: string
          cliente?: string | null
          total?: number
          desconto?: number
          forma_pagamento?: "dinheiro" | "pix" | "cartao" | "fiado"
          status?: "pendente" | "pago" | "cancelado"
        }
        Relationships: []
      }
      tab_vendas_itens: {
        Row: {
          id: string
          venda_id: string
          item_id: string
          igreja_id: string
          quantidade: number
          valor_unitario: number
          subtotal: number
        }
        Insert: {
          id?: string
          venda_id: string
          item_id: string
          igreja_id: string
          quantidade: number
          valor_unitario: number
          subtotal: number
        }
        Update: {
          id?: string
          quantidade?: number
          valor_unitario?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "tab_vendas_itens_item_id_fkey"
            columns: ["item_id", "igreja_id"]
            isOneToOne: false
            referencedRelation: "tab_itens"
            referencedColumns: ["id", "igreja_id"]
          },
          {
            foreignKeyName: "tab_vendas_itens_venda_id_fkey"
            columns: ["venda_id", "igreja_id"]
            isOneToOne: false
            referencedRelation: "tab_vendas"
            referencedColumns: ["id", "igreja_id"]
          },
        ]
      }
      tab_extrato_financeiro: {
        Row: {
          id: string
          created_at: string
          data_hora: string
          tipo_movimentacao: "entrada" | "saida"
          forma_pagamento: "dinheiro" | "pix" | "cartao" | "fiado"
          valor: number
          descricao: string
          venda_id: string | null
          conta_pagar_id: string | null
          user_id: string
          igreja_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          data_hora?: string
          tipo_movimentacao: "entrada" | "saida"
          forma_pagamento: "dinheiro" | "pix" | "cartao" | "fiado"
          valor: number
          descricao: string
          venda_id?: string | null
          conta_pagar_id?: string | null
          user_id: string
          igreja_id: string
        }
        Update: {
          id?: string
          tipo_movimentacao?: "entrada" | "saida"
          forma_pagamento?: "dinheiro" | "pix" | "cartao" | "fiado"
          valor?: number
          descricao?: string
          conta_pagar_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_extrato_financeiro_venda_id_fkey"
            columns: ["venda_id", "igreja_id"]
            isOneToOne: false
            referencedRelation: "tab_vendas"
            referencedColumns: ["id", "igreja_id"]
          },
          {
            foreignKeyName: "tab_extrato_financeiro_conta_pagar_id_fkey"
            columns: ["conta_pagar_id", "igreja_id"]
            isOneToOne: false
            referencedRelation: "tab_contas_pagar"
            referencedColumns: ["id", "igreja_id"]
          },
        ]
      }
      tab_contas_receber: {
        Row: {
          id: string
          created_at: string
          cliente: string
          valor_devido: number
          data_venda: string
          descricao: string | null
          pago: boolean
          data_baixa: string | null
          forma_pagamento_baixa: string | null
          venda_id: string | null
          user_id: string
          igreja_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          cliente: string
          valor_devido: number
          data_venda: string
          descricao?: string | null
          pago?: boolean
          data_baixa?: string | null
          forma_pagamento_baixa?: string | null
          venda_id?: string | null
          user_id: string
          igreja_id: string
        }
        Update: {
          id?: string
          cliente?: string
          valor_devido?: number
          data_venda?: string
          descricao?: string | null
          pago?: boolean
          data_baixa?: string | null
          forma_pagamento_baixa?: string | null
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tab_contas_receber_venda_id_fkey"
            columns: ["venda_id", "igreja_id"]
            isOneToOne: false
            referencedRelation: "tab_vendas"
            referencedColumns: ["id", "igreja_id"]
          },
        ]
      }
      tab_contas_pagar: {
        Row: {
          id: string
          created_at: string
          descricao: string
          valor: number
          data: string
          pago: boolean
          categoria: string | null
          user_id: string
          igreja_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          descricao: string
          valor: number
          data: string
          pago?: boolean
          categoria?: string | null
          user_id: string
          igreja_id: string
        }
        Update: {
          id?: string
          descricao?: string
          valor?: number
          data?: string
          pago?: boolean
          categoria?: string | null
        }
        Relationships: []
      }
      tab_fechamento_caixa: {
        Row: {
          id: string
          created_at: string
          data: string
          saldo_inicial: number
          entradas_dinheiro: number
          entradas_pix: number
          entradas_cartao: number
          total_saidas: number
          valor_calculado: number
          valor_informado: number
          diferenca: number
          observacoes: string | null
          user_id: string | null
          igreja_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          data: string
          saldo_inicial?: number
          entradas_dinheiro?: number
          entradas_pix?: number
          entradas_cartao?: number
          total_saidas?: number
          valor_calculado: number
          valor_informado: number
          diferenca: number
          observacoes?: string | null
          user_id: string
          igreja_id: string
        }
        Update: {
          id?: string
          data?: string
          saldo_inicial?: number
          entradas_dinheiro?: number
          entradas_pix?: number
          entradas_cartao?: number
          total_saidas?: number
          valor_calculado?: number
          valor_informado?: number
          diferenca?: number
          observacoes?: string | null
        }
        Relationships: []
      }
      tab_reaberturas_caixa: {
        Row: {
          id: string
          created_at: string
          igreja_id: string
          user_id: string | null
          fechamento_id: string
          fechado_por: string | null
          fechado_em: string
          data: string
          justificativa: string
          saldo_inicial: number
          entradas_dinheiro: number
          entradas_pix: number
          entradas_cartao: number
          total_saidas: number
          valor_calculado: number
          valor_informado: number
          diferenca: number
          observacoes: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          igreja_id: string
          user_id?: string | null
          fechamento_id: string
          fechado_por?: string | null
          fechado_em: string
          data: string
          justificativa: string
          saldo_inicial: number
          entradas_dinheiro: number
          entradas_pix: number
          entradas_cartao: number
          total_saidas: number
          valor_calculado: number
          valor_informado: number
          diferenca: number
          observacoes?: string | null
        }
        Update: {
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      baixar_conta_receber: {
        Args: { p_conta_id: string; p_forma_pagamento: string; p_valor_esperado: number }
        Returns: void
      }
      criar_convite: {
        Args: { p_papel: string }
        Returns: string
      }
      consultar_convite: {
        Args: { p_token: string }
        Returns: { nome_igreja: string; papel: Papel }[]
      }
      alterar_papel_membro: {
        Args: { p_user_id: string; p_papel: string }
        Returns: void
      }
      remover_membro: {
        Args: { p_user_id: string }
        Returns: void
      }
      reabrir_caixa: {
        Args: {
          p_data: string
          p_justificativa: string
        }
        Returns: void
      }
      fechar_caixa: {
        Args: {
          p_data: string
          p_saldo_inicial: number
          p_valor_informado: number
          p_observacoes?: string | null
        }
        Returns: Database["public"]["Tables"]["tab_fechamento_caixa"]["Row"]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Igreja = Database["public"]["Tables"]["igrejas"]["Row"]
export type IgrejaMembro = Database["public"]["Tables"]["igreja_membros"]["Row"]
export type IgrejaConvite = Database["public"]["Tables"]["igreja_convites"]["Row"]
export type Item = Database["public"]["Tables"]["tab_itens"]["Row"]
export type CardapioDia = Database["public"]["Tables"]["tab_cardapio_dia"]["Row"]
export type Venda = Database["public"]["Tables"]["tab_vendas"]["Row"]
export type VendaItem = Database["public"]["Tables"]["tab_vendas_itens"]["Row"]
export type ExtratoFinanceiro = Database["public"]["Tables"]["tab_extrato_financeiro"]["Row"]
export type FechamentoCaixa = Database["public"]["Tables"]["tab_fechamento_caixa"]["Row"]
export type ReaberturaCaixa = Database["public"]["Tables"]["tab_reaberturas_caixa"]["Row"]
export type ContaReceber = Database["public"]["Tables"]["tab_contas_receber"]["Row"]
export type ContaPagar = Database["public"]["Tables"]["tab_contas_pagar"]["Row"]

export type FormaPagamento = "dinheiro" | "pix" | "cartao" | "fiado"
export type StatusVenda = "pendente" | "pago" | "cancelado"
