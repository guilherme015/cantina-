import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, ShoppingCart } from "lucide-react"
import { formatCurrency, formatDateTime } from "@/lib/utils"

export default function VendasPage() {
  return (
    <div>
      <Header
        title="Vendas"
        description="Registre e acompanhe os pedidos do dia"
      />

      <div className="flex justify-end mb-4">
        <Button size="lg" className="gap-2">
          <Plus className="w-5 h-5" />
          Nova Venda
        </Button>
      </div>

      <div className="space-y-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center flex-col gap-3 py-12 text-[var(--muted-foreground)]">
              <ShoppingCart className="w-12 h-12 opacity-30" />
              <p className="text-sm">Nenhuma venda registrada hoje.</p>
              <p className="text-xs">Clique em &quot;Nova Venda&quot; para começar.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
