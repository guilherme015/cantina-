import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getMembroAtual } from "@/lib/igreja"
import type { Papel } from "@/types/database"

// Toda server action fazia a mesma sequência 3x repetida (createClient +
// auth.getUser + busca da igreja) — 2 round trips ao Supabase só pra
// descobrir quem está logado e qual a igreja dele, antes até da query que
// a action realmente precisa. Nas páginas que disparam 2 actions em
// paralelo (Vendas, Cardápio do Dia, Fechamento — Promise.all de duas
// funções), isso pagava em dobro a cada carregamento.
//
// cache() do React deduplica chamadas dentro da MESMA renderização de
// Server Component: as duas actions de um Promise.all rodam na mesma
// requisição, então a segunda chamada aqui reaproveita a primeira em vez
// de bater no Supabase de novo. Não afeta chamadas separadas (uma action
// disparada por um form) — cada uma é sua própria requisição, então já
// só chamava isso uma vez mesmo.
//
// `papel` vem na mesma leitura da igreja (#53): é null exatamente quando
// igrejaId é null (conta sem vínculo, ex.: membro removido).
export const getUsuarioEIgreja = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { supabase, user: null, igrejaId: null as string | null, papel: null as Papel | null }
  }

  const membro = await getMembroAtual(supabase, user.id)
  return { supabase, user, igrejaId: membro?.igrejaId ?? null, papel: membro?.papel ?? null }
})

// Guard de página: operador (ou conta sem igreja) que cai numa tela só de
// admin volta pra Vendas. É conveniência de navegação — quem de fato barra é
// a RLS/RPC no banco e o papel conferido em cada server action.
export async function exigirAdmin() {
  const { papel } = await getUsuarioEIgreja()
  if (papel !== "admin") redirect("/vendas")
}
