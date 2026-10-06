import { Sidebar } from "@/components/layout/sidebar"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Só pra mostrar quem está logado no cabeçalho — quem barra acesso sem
  // login é o src/proxy.ts, não este layout. getClaims() lê o e-mail do
  // JWT (sem round trip extra ao Auth quando a chave de assinatura é
  // assimétrica), então não pesa em toda navegação.
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const email = typeof data?.claims.email === "string" ? data.claims.email : null

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Sidebar email={email} />
      <main className="lg:ml-[240px] min-h-screen max-lg:pt-14">
        <div className="p-4 sm:p-6 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
