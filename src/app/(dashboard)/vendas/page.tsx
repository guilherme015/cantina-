import { Header } from "@/components/layout/header"
import { listarVendasHoje, listarItensCardapioHoje } from "@/app/actions/vendas"
import { VendasClient } from "./vendas-client"

export default async function VendasPage() {
  const [vendas, itensDisponiveis] = await Promise.all([
    listarVendasHoje(),
    listarItensCardapioHoje(),
  ])

  return (
    <div>
      <Header
        title="Vendas"
        description="Registre e acompanhe os pedidos do dia"
      />
      <VendasClient vendas={vendas as any} itensDisponiveis={itensDisponiveis as any} />
    </div>
  )
}
