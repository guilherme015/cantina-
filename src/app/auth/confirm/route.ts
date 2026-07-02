import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { EmailOtpType } from "@supabase/supabase-js"

// Troca o token do link de e-mail (recuperação de senha, confirmação etc.)
// por uma sessão e segue para o destino indicado em `next`.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/vendas"

  const destino = next.startsWith("/") ? next : "/vendas"
  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${destino}`)
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      return NextResponse.redirect(`${origin}${destino}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_invalido`)
}
