import type { createClient } from "@/lib/supabase/server"
import type { Papel } from "@/types/database"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Igreja e papel do usuário numa única leitura — o papel (admin/operador)
// decide o que cada server action e cada tela liberam (#53). A RLS e as
// RPCs aplicam a mesma regra no banco; conferir aqui só dá uma mensagem
// decente em vez de um erro seco de RLS.
export async function getMembroAtual(
  supabase: SupabaseServerClient,
  userId: string
): Promise<{ igrejaId: string; papel: Papel } | null> {
  const { data } = await supabase
    .from("igreja_membros")
    .select("igreja_id, papel")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()

  return data ? { igrejaId: data.igreja_id, papel: data.papel } : null
}
