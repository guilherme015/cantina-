import type { createClient } from "@/lib/supabase/server"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export async function getIgrejaIdAtual(
  supabase: SupabaseServerClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("igreja_membros")
    .select("igreja_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle()

  return data?.igreja_id ?? null
}
