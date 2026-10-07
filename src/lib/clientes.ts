import type { createClient } from "@/lib/supabase/server"
import { mensagemDeErro } from "@/lib/erros"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type ClienteResumo = { id: string; nome: string; ativo: boolean }

// Resolve um cliente pelo id DENTRO da igreja da sessão (nunca confia em
// id/nome vindo da tela): usado por criarVenda e editarContaReceber pra
// pegar o nome oficial no servidor e pra recusar cliente de outra igreja,
// inexistente ou mal formado — os três caem em "não encontrado", sem
// distinguir (não dá pra descobrir se um UUID existe em outra igreja).
//
// Fica em src/lib (não em actions/clientes.ts) de propósito: um arquivo
// "use server" expõe cada função exportada como endpoint chamável.
export async function buscarCliente(
  supabase: SupabaseServerClient,
  igrejaId: string,
  clienteId: unknown
): Promise<{ cliente: ClienteResumo | null; error?: string }> {
  if (typeof clienteId !== "string" || clienteId === "") return { cliente: null }

  const { data, error } = await supabase
    .from("tab_clientes")
    .select("id, nome, ativo")
    .eq("id", clienteId)
    .eq("igreja_id", igrejaId)
    .maybeSingle()

  // 22P02 = id que não é UUID: mesmo tratamento de "não existe".
  if (error && error.code === "22P02") return { cliente: null }
  if (error) return { cliente: null, error: mensagemDeErro(error) }
  return { cliente: data }
}
