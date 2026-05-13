import { Header } from "@/components/layout/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowDownCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export default function ContasReceberPage() {
  return (
    <div>
      <Header
        title="Contas a Receber"
        description="Controle do fiado e pagamentos pendentes"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <ArrowDownCircle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Total em Aberto</p>
                <p className="text-xl font-bold text-orange-600">{formatCurrency(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <ArrowDownCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Total Recebido</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fiados em Aberto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center flex-col gap-3 py-8 text-[var(--muted-foreground)]">
            <ArrowDownCircle className="w-12 h-12 opacity-30" />
            <p className="text-sm">Nenhuma conta a receber em aberto.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
