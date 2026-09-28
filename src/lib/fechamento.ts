import type { createClient } from "@/lib/supabase/server"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export async function diaFechado(
  supabase: SupabaseServerClient,
  igrejaId: string,
  data: string
): Promise<boolean> {
  const { data: fechamento, error } = await supabase
    .from("tab_fechamento_caixa")
    .select("id")
    .eq("igreja_id", igrejaId)
    .eq("data", data)
    .limit(1)

  if (error) return true

  return fechamento.length > 0
}
