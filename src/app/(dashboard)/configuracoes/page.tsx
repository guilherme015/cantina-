import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Settings } from "lucide-react"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import { ROTULO_PAPEL } from "@/lib/papel"
import { listarEquipe } from "@/app/actions/membros"
import { EquipeClient } from "./equipe-client"

export default async function ConfiguracoesPage() {
  const { papel } = await getUsuarioEIgreja()
  // Equipe (convidar, mudar papel, remover) é só do admin — o operador vê
  // apenas o próprio acesso.
  const equipe = papel === "admin" ? await listarEquipe() : null

  return (
    <div>
      <Header
        title="Configurações"
        description="Ajustes gerais do sistema"
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cantina</CardTitle>
            <CardDescription>
              Informações da sua cantina
              {papel && <> · Seu acesso: <strong>{ROTULO_PAPEL[papel]}</strong></>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center flex-col gap-3 py-8 text-[var(--muted-foreground)]">
              <Settings className="w-12 h-12 opacity-30" />
              <p className="text-sm">Configurações disponíveis em breve.</p>
            </div>
          </CardContent>
        </Card>

        {equipe && <EquipeClient membros={equipe.membros} convites={equipe.convites} />}
      </div>
    </div>
  )
}
