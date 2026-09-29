import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { getIgrejaIdAtual } from "@/lib/igreja"

// Toda server action fazia a mesma sequência 3x repetida (createClient +
// auth.getUser + getIgrejaIdAtual) — 2 round trips ao Supabase só pra
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
export const getUsuarioEIgreja = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { supabase, user: null, igrejaId: null as string | null }
  }

  const igrejaId = await getIgrejaIdAtual(supabase, user.id)
  return { supabase, user, igrejaId }
})
