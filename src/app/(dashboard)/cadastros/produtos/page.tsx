import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Package } from "lucide-react"

export default function ProdutosPage() {
  return (
    <div>
      <Header
        title="Produtos"
        description="Gerencie os itens disponíveis para venda"
      />

      <div className="flex justify-end mb-4">
        <Button size="lg" className="gap-2">
          <Plus className="w-5 h-5" />
          Novo Produto
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center flex-col gap-3 py-12 text-[var(--muted-foreground)]">
            <Package className="w-12 h-12 opacity-30" />
            <p className="text-sm">Nenhum produto cadastrado.</p>
            <p className="text-xs">Clique em &quot;Novo Produto&quot; para adicionar.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
