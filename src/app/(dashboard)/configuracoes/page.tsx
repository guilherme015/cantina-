import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Settings } from "lucide-react"

export default function ConfiguracoesPage() {
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
            <CardDescription>Informações da sua cantina</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center flex-col gap-3 py-8 text-[var(--muted-foreground)]">
              <Settings className="w-12 h-12 opacity-30" />
              <p className="text-sm">Configurações disponíveis em breve.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
