export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tab_itens: {
        Row: {
          id: string
          created_at: string
          nome: string
          preco: number
          imagem_url: string | null
          ativo: boolean
          user_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          nome: string
          preco: number
          imagem_url?: string | null
          ativo?: boolean
          user_id: string
        }
        Update: {
          id?: string
          nome?: string
          preco?: number
          imagem_url?: string | null
          ativo?: boolean
        }
      }
      tab_cardapio_dia: {
        Row: {
          id: string
          created_at: string
          data: string
          observacoes: string | null
          user_id: string
        }
        Insert: {
          id?: string
          created_at?: string
          data: string
          observacoes?: string | null
          user_id: string
        }
        Update: {
          id?: string
          data?: string
          observacoes?: string | null
        }
      }
      tab_cardapio_dia_itens: {
        Row: {
          id: string
          cardapio_id: string
          item_id: string
        }
        Insert: {
          id?: string
          cardapio_id: string
          item_id: string
        }
        Update: never
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
        }
        Update: {
          id?: string
          cliente?: string | null
          total?: number
          desconto?: number
          forma_pagamento?: "dinheiro" | "pix" | "cartao" | "fiado"
          status?: "pendente" | "pago" | "cancelado"
        }
      }
      tab_vendas_itens: {
        Row: {
          id: string
          venda_id: string
          item_id: string
          quantidade: number
          valor_unitario: number
          subtotal: number
        }
        Insert: {
          id?: string
          venda_id: string
          item_id: string
          quantidade: number
          valor_unitario: number
          subtotal: number
        }
        Update: never
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
          user_id: string
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
          user_id: string
        }
        Update: {
          id?: string
          tipo_movimentacao?: "entrada" | "saida"
          forma_pagamento?: "dinheiro" | "pix" | "cartao" | "fiado"
          valor?: number
          descricao?: string
        }
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
        }
        Update: {
          id?: string
          pago?: boolean
          data_baixa?: string | null
          forma_pagamento_baixa?: string | null
        }
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
        }
        Update: {
          id?: string
          descricao?: string
          valor?: number
          data?: string
          pago?: boolean
          categoria?: string | null
        }
      }
    }
  }
}

export type Item = Database["public"]["Tables"]["tab_itens"]["Row"]
export type CardapioDia = Database["public"]["Tables"]["tab_cardapio_dia"]["Row"]
export type Venda = Database["public"]["Tables"]["tab_vendas"]["Row"]
export type VendaItem = Database["public"]["Tables"]["tab_vendas_itens"]["Row"]
export type ExtratoFinanceiro = Database["public"]["Tables"]["tab_extrato_financeiro"]["Row"]
export type ContaReceber = Database["public"]["Tables"]["tab_contas_receber"]["Row"]
export type ContaPagar = Database["public"]["Tables"]["tab_contas_pagar"]["Row"]

export type FormaPagamento = "dinheiro" | "pix" | "cartao" | "fiado"
export type StatusVenda = "pendente" | "pago" | "cancelado"
