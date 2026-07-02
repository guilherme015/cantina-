import { redirect } from "next/navigation"
import { redefinirSenha } from "@/app/actions/auth"
import { createClient } from "@/lib/supabase/server"
import { UtensilsCrossed } from "lucide-react"

interface RedefinirSenhaProps {
  searchParams: Promise<{ error?: string }>
}

const errorMessages: Record<string, string> = {
  senha_curta: "A senha precisa ter pelo menos 6 caracteres.",
  senhas_diferentes: "As senhas não conferem. Digite a mesma senha nos dois campos.",
  senha_igual: "A nova senha precisa ser diferente da atual.",
  erro_generico: "Não foi possível redefinir a senha. Tente novamente.",
}

export default async function RedefinirSenhaPage({ searchParams }: RedefinirSenhaProps) {
  const { error } = await searchParams

  // Só chega aqui quem veio do link de recuperação (com sessão criada).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
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
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Mínimo 6 caracteres"
                className="w-full h-11 px-3 rounded-lg border border-[var(--input)] text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </div>

            <div>
              <label
                htmlFor="confirmar"
                className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
              >
                Confirmar nova senha
              </label>
              <input
                id="confirmar"
                name="confirmar"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                placeholder="Repita a senha"
                className="w-full h-11 px-3 rounded-lg border border-[var(--input)] text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
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
