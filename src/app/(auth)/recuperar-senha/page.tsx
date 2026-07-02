import Link from "next/link"
import { solicitarRecuperacaoSenha } from "@/app/actions/auth"
import { UtensilsCrossed, ArrowLeft } from "lucide-react"

interface RecuperarSenhaProps {
  searchParams: Promise<{ error?: string; enviado?: string }>
}

const errorMessages: Record<string, string> = {
  email_obrigatorio: "Informe o e-mail da sua conta.",
}

export default async function RecuperarSenhaPage({ searchParams }: RecuperarSenhaProps) {
  const { error, enviado } = await searchParams

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--primary)] mb-3">
            <UtensilsCrossed className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Recuperar senha</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1 text-center">
            Enviaremos um link de redefinição para o seu e-mail
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[var(--border)] shadow-sm p-6">

          {error && errorMessages[error] && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {errorMessages[error]}
            </div>
          )}

          {enviado ? (
            <div className="space-y-4">
              <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                Se este e-mail tiver uma conta, você receberá um link para
                redefinir a senha em instantes. Confira também a caixa de spam.
              </div>
              <Link
                href="/login"
                className="flex items-center justify-center gap-2 w-full h-11 rounded-lg border border-[var(--primary)] text-[var(--primary)] text-sm font-semibold hover:bg-[var(--primary)]/5 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para o login
              </Link>
            </div>
          ) : (
            <form action={solicitarRecuperacaoSenha} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
                >
                  E-mail
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="seu@email.com"
                  className="w-full h-11 px-3 rounded-lg border border-[var(--input)] text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>

              <button
                type="submit"
                className="w-full h-11 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary)]/90 transition-colors"
              >
                Enviar link de recuperação
              </button>

              <Link
                href="/login"
                className="flex items-center justify-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para o login
              </Link>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-[var(--muted-foreground)] mt-6">
          Cantina+ &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
