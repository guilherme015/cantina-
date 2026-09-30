import Link from "next/link"
import { login, signup } from "@/app/actions/auth"
import { UtensilsCrossed } from "lucide-react"
import { PasswordInput } from "@/components/ui/password-input"
import { PasswordFieldChecklist } from "@/components/ui/password-field-checklist"
import { createClient } from "@/lib/supabase/server"
import { ROTULO_PAPEL } from "@/lib/papel"

interface LoginPageProps {
  searchParams: Promise<{ error?: string; senha_alterada?: string; convite?: string }>
}

const errorMessages: Record<string, string> = {
  credenciais_invalidas: "E-mail ou senha incorretos. Tente novamente.",
  erro_cadastro: "Erro ao criar conta. Tente com outro e-mail.",
  email_ja_cadastrado:
    "Este e-mail já possui uma conta. Faça login acima ou use “Esqueceu a senha?” para recuperá-la.",
  senha_fraca: "A senha não atende aos critérios de segurança (mínimo 8 caracteres, maiúscula, minúscula, número e caractere especial).",
  link_invalido: "O link de recuperação é inválido ou expirou. Solicite um novo.",
  nome_igreja_obrigatorio: "Informe o nome da sua igreja para criar a conta.",
  convite_invalido:
    "Este convite é inválido, expirou ou já foi usado. Peça um novo link ao administrador da igreja.",
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error: erroParam, senha_alterada, convite } = await searchParams

  // Link de convite (/login?convite=<token>): confere antes de mostrar o
  // cadastro de membro. Token inválido/expirado/usado cai no cadastro normal
  // com o aviso — nunca mostra "você foi convidado" sem convite válido.
  let convidado: { nome_igreja: string; papel: "admin" | "operador" } | null = null
  if (convite) {
    const supabase = await createClient()
    const { data } = await supabase.rpc("consultar_convite", { p_token: convite })
    convidado = data?.[0] ?? null
  }
  const error = convite && !convidado ? "convite_invalido" : erroParam

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--primary)] mb-3">
            <UtensilsCrossed className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Cantina+</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Gestão simples para sua cantina
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl border border-[var(--border)] shadow-sm p-6">

          {/* Erro */}
          {error && errorMessages[error] && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {errorMessages[error]}
            </div>
          )}

          {senha_alterada === "1" && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
              Senha alterada com sucesso! Faça login com a nova senha.
            </div>
          )}

          {/* Formulário de Login */}
          <form action={login} className="space-y-4">
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

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
              >
                Senha
              </label>
              <PasswordInput
                id="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full h-11"
              />
            </div>

            <button
              type="submit"
              className="w-full h-11 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary)]/90 transition-colors"
            >
              Entrar
            </button>

            <div className="text-right">
              <Link
                href="/recuperar-senha"
                className="text-sm text-[var(--primary)] hover:underline"
              >
                Esqueceu a senha?
              </Link>
            </div>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-[var(--muted-foreground)]">
                {convidado ? "Convidado?" : "Primeira vez?"}
              </span>
            </div>
          </div>

          {/* Formulário de Cadastro */}
          <form action={signup} className="space-y-4">
            {convidado ? (
              <>
                <input type="hidden" name="convite" value={convite} />
                <div className="px-4 py-3 rounded-lg bg-[var(--secondary)] text-sm text-[var(--foreground)]">
                  Você foi convidado para <strong>{convidado.nome_igreja}</strong> como{" "}
                  <strong>{ROTULO_PAPEL[convidado.papel]}</strong>. Crie sua conta abaixo — o
                  convite vale só para contas novas.
                </div>
              </>
            ) : (
              <input
                name="nomeIgreja"
                type="text"
                required
                autoComplete="organization"
                placeholder="Nome da sua igreja"
                className="w-full h-11 px-3 rounded-lg border border-[var(--input)] text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            )}
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              className="w-full h-11 px-3 rounded-lg border border-[var(--input)] text-sm placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
            <PasswordFieldChecklist name="password" placeholder="Crie uma senha" />
            <button
              type="submit"
              className="w-full h-11 rounded-lg border border-[var(--primary)] text-[var(--primary)] text-sm font-semibold hover:bg-[var(--primary)]/5 transition-colors"
            >
              {convidado ? "Criar conta e entrar" : "Criar conta grátis"}
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
