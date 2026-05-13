import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, Calendar } from "lucide-react"

export default function CardapioPage() {
  return (
    <div>
      <Header
        title="Cardápio do Dia"
        description="Defina quais produtos estarão disponíveis hoje"
      />

      <div className="flex justify-end mb-4">
        <Button size="lg" className="gap-2">
          <Plus className="w-5 h-5" />
          Configurar Hoje
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center flex-col gap-3 py-12 text-[var(--muted-foreground)]">
            <Calendar className="w-12 h-12 opacity-30" />
            <p className="text-sm">Nenhum cardápio configurado para hoje.</p>
            <p className="text-xs">Selecione os produtos que serão vendidos hoje.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
