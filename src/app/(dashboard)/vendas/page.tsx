import { Header } from "@/components/layout/header"
import { listarVendasHoje, listarItensCardapioHoje } from "@/app/actions/vendas"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import { VendasClient } from "./vendas-client"

export default async function VendasPage() {
  const [vendas, itensDisponiveis, { papel }] = await Promise.all([
    listarVendasHoje(),
    listarItensCardapioHoje(),
    getUsuarioEIgreja(),
  ])

  return (
    <div>
      <Header
        title="Vendas"
        description="Registre e acompanhe os pedidos do dia"
      />
      <VendasClient vendas={vendas} itensDisponiveis={itensDisponiveis} ehAdmin={papel === "admin"} />
    </div>
  )
}
