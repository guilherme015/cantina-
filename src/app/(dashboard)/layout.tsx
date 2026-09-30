import { Sidebar } from "@/components/layout/sidebar"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import { logout } from "@/app/actions/auth"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, papel } = await getUsuarioEIgreja()

  // Conta sem vínculo com nenhuma igreja — é o estado de quem foi removido da
  // equipe (remover_membro apaga só o vínculo, a conta de login continua). A
  // RLS já nega tudo pra ela; sem este aviso cada tela só mostraria vazio ou
  // erro sem explicar por quê.
  if (user && !papel) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-xl border border-[var(--border)] shadow-sm p-6 text-center space-y-4">
          <h1 className="text-lg font-bold text-[var(--foreground)]">Sem acesso a uma igreja</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Sua conta não está vinculada a nenhuma igreja — provavelmente você foi removido da
            equipe. Fale com o administrador da igreja.
          </p>
          <form action={logout}>
            <button
              type="submit"
              className="w-full h-11 rounded-lg border border-[var(--primary)] text-[var(--primary)] text-sm font-semibold hover:bg-[var(--primary)]/5 transition-colors"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* papel nulo só acontece sem usuário (o proxy já redireciona pro
          login antes); "operador" é o mínimo de acesso por garantia. */}
      <Sidebar papel={papel ?? "operador"} />
      <main className="lg:ml-[240px] min-h-screen max-lg:pt-14">
        <div className="p-4 sm:p-6 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
