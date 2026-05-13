import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, ArrowUpCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export default function ContasPagarPage() {
  return (
    <div>
      <Header
        title="Contas a Pagar"
        description="Registre as despesas da cantina"
      />

      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-4">
          <div className="bg-white border border-[var(--border)] rounded-md px-4 py-2">
            <p className="text-xs text-[var(--muted-foreground)]">Total em Aberto</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(0)}</p>
          </div>
        </div>
        <Button size="lg" className="gap-2">
          <Plus className="w-5 h-5" />
          Nova Despesa
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Despesas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center flex-col gap-3 py-8 text-[var(--muted-foreground)]">
            <ArrowUpCircle className="w-12 h-12 opacity-30" />
            <p className="text-sm">Nenhuma despesa registrada.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
