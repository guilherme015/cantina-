import type { createClient } from "@/lib/supabase/server"
import type { ContaReceber } from "@/types/database"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// O PostgREST do Supabase corta qualquer SELECT em 1000 linhas (max_rows) SEM
// avisar. Contas a Receber acumula (toda venda fiado vira uma linha e as
// pagas ficam) — passando de 1000, as mais antigas, que são justamente as
// dívidas mais velhas ainda em aberto, sumiriam em silêncio e o saldo por
// cliente (#57) sairia menor que o real. Por isso busca em páginas até
// acabar. A ordenação precisa ser TOTAL (id como desempate): sem isso,
// linhas com a mesma data podem se repetir ou pular entre páginas.
// (Paginação por offset ainda pode repetir/pular uma linha se houver
// INSERT/DELETE/baixa concorrente durante a leitura — só importa com mais
// de 1000 contas e é marginal.)
const TAMANHO_PAGINA = 1000
const MAX_PAGINAS = 200

// Quantas contas JÁ RECEBIDAS a tela do cliente mostra (só histórico — o
// saldo vem das abertas, que nunca são cortadas).
export const LIMITE_RECEBIDAS_DETALHE = 200

// `falhou` separa "não tem nenhuma conta" de "a leitura quebrou": quem soma
// dinheiro em cima disso precisa poder recusar em vez de mostrar R$ 0.
export async function buscarContasReceber(
  supabase: SupabaseServerClient,
  igrejaId: string,
  opcoes?: { apenasAbertas?: boolean; clienteId?: string }
): Promise<{ contas: ContaReceber[]; falhou: boolean }> {
  const contas: ContaReceber[] = []

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const inicio = pagina * TAMANHO_PAGINA
    let consulta = supabase
      .from("tab_contas_receber")
      .select("*")
      .eq("igreja_id", igrejaId)
    if (opcoes?.apenasAbertas) consulta = consulta.eq("pago", false)
    if (opcoes?.clienteId) consulta = consulta.eq("cliente_id", opcoes.clienteId)

    const { data, error } = await consulta
      .order("data_venda", { ascending: false })
      .order("id")
      .range(inicio, inicio + TAMANHO_PAGINA - 1)

    if (error || !data) return { contas: [], falhou: true }
    contas.push(...(data as ContaReceber[]))
    if (data.length < TAMANHO_PAGINA) return { contas, falhou: false }
  }

  // Passou do teto de páginas: lista incompleta não pode virar total.
  return { contas: [], falhou: true }
}
