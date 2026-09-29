import { redirect } from "next/navigation"
import { redefinirSenha } from "@/app/actions/auth"
import { createClient } from "@/lib/supabase/server"
import { UtensilsCrossed } from "lucide-react"
import { PasswordInput } from "@/components/ui/password-input"
import { PasswordFieldChecklist } from "@/components/ui/password-field-checklist"

interface RedefinirSenhaProps {
  searchParams: Promise<{ error?: string }>
}

// Lê só o campo `amr` do payload do JWT — não precisa validar assinatura
// aqui porque o token já veio de uma sessão validada por getUser() acima
// (lido do cookie httponly gravado pelo nosso próprio client Supabase, não
// de entrada do usuário).
function decodeAmr(accessToken: string): string[] {
  try {
    const payload = accessToken.split(".")[1]
    const json = Buffer.from(payload, "base64url").toString("utf-8")
    const claims = JSON.parse(json) as { amr?: { method: string }[] }
    return (claims.amr ?? []).map((a) => a.method)
  } catch {
    return []
  }
}

const errorMessages: Record<string, string> = {
  senha_fraca: "A senha não atende aos critérios de segurança (mínimo 8 caracteres, maiúscula, minúscula, número e caractere especial).",
  senhas_diferentes: "As senhas não conferem. Digite a mesma senha nos dois campos.",
  senha_igual: "A nova senha precisa ser diferente da atual.",
  erro_generico: "Não foi possível redefinir a senha. Tente novamente.",
}

export default async function RedefinirSenhaPage({ searchParams }: RedefinirSenhaProps) {
  const { error } = await searchParams

  // Só chega aqui quem veio do link de recuperação — getUser() valida a
  // sessão contra o servidor do Supabase (não só lê o cookie).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login?error=link_invalido")
  }

  // getUser() garante que a sessão é válida, mas não que veio do link de
  // recuperação — qualquer usuário logado normalmente também passaria
  // (issue #39: alguém com acesso breve a um dispositivo compartilhado já
  // logado conseguia abrir esta página direto pela URL e trocar a senha
  // sem saber a atual, tomando a conta). O GoTrue registra no token de
  // acesso (claim `amr`, authentication method reference) como a sessão
  // foi autenticada — pro link de recuperação, o método é "recovery".
  // Confere isso aqui em vez de confiar só em existir uma sessão.
  const { data: { session } } = await supabase.auth.getSession()
  const amr = session ? decodeAmr(session.access_token) : []
  if (!amr.includes("recovery")) {
    redirect("/login?error=link_invalido")
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--primary)] mb-3">
            <UtensilsCrossed className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Nova senha</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1 text-center">
            Defina a nova senha da conta {user.email}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[var(--border)] shadow-sm p-6">

          {error && errorMessages[error] && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {errorMessages[error]}
            </div>
          )}

          <form action={redefinirSenha} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
              >
                Nova senha
              </label>
              <PasswordFieldChecklist id="password" name="password" placeholder="Crie a nova senha" />
            </div>

            <div>
              <label
                htmlFor="confirmar"
                className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
              >
                Confirmar nova senha
              </label>
              <PasswordInput
                id="confirmar"
                name="confirmar"
                required
                autoComplete="new-password"
                placeholder="Repita a senha"
                className="w-full h-11"
              />
            </div>

            <button
              type="submit"
              className="w-full h-11 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary)]/90 transition-colors"
            >
              Salvar nova senha
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[var(--muted-foreground)] mt-6">
          Cantina+ &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
