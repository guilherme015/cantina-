import type { createClient } from "@/lib/supabase/server"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Sessão "de recuperação" (veio do link de e-mail) só conta se recente: o
// claim `amr` fica gravado no token pelo resto da vida da sessão (até 400
// dias) — sem checar o timestamp, uma sessão que passou pelo fluxo de
// recuperação em algum momento no passado (ou que terminou o reset e
// seguiu navegando o app) continuaria liberada pra acessar /redefinir-senha
// pra sempre.
const JANELA_RECENTE_SEGUNDOS = 30 * 60

// Usado tanto pela página /redefinir-senha (decide o que renderizar) quanto
// pela server action redefinirSenha (a fronteira de verdade — uma server
// action é um endpoint POST próprio, chamável direto sem passar pela
// página, então a checagem da página sozinha não bastava).
export async function sessaoVeioDeRecuperacao(supabase: SupabaseServerClient): Promise<boolean> {
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data) return false

  const amr = data.claims.amr as { method: string; timestamp: number }[] | undefined
  if (!amr) return false

  const agora = Math.floor(Date.now() / 1000)
  // O GoTrue registra "recovery" só no fluxo PKCE (?code=), e "otp" no
  // fluxo token_hash+type=recovery — qual dos dois roda depende do
  // template de e-mail configurado no dashboard do Supabase, que não está
  // versionado neste repo. Aceita os dois: este app não tem login por
  // magic-link nem por OTP, então um "otp" recente só pode ter vindo do
  // link de recuperação por e-mail.
  return amr.some(
    (a) => (a.method === "recovery" || a.method === "otp") && agora - a.timestamp <= JANELA_RECENTE_SEGUNDOS
  )
}
