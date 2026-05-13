import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export default function ExtratoPage() {
  return (
    <div>
      <Header
        title="Extrato Financeiro"
        description="Acompanhe todas as movimentações do caixa"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Entradas</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Saídas</p>
                <p className="text-xl font-bold text-red-600">{formatCurrency(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Saldo</p>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimentações do Dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center flex-col gap-3 py-8 text-[var(--muted-foreground)]">
            <DollarSign className="w-12 h-12 opacity-30" />
            <p className="text-sm">Nenhuma movimentação registrada.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
