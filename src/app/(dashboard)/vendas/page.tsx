import { Header } from "@/components/layout/header"
import { listarVendasHoje, listarItensCardapioHoje } from "@/app/actions/vendas"
import { listarClientes } from "@/app/actions/clientes"
import { VendasClient } from "./vendas-client"

export default async function VendasPage() {
  const [vendas, itensDisponiveis, todosClientes] = await Promise.all([
    listarVendasHoje(),
    listarItensCardapioHoje(),
    listarClientes(),
  ])
  // Arquivado não aparece em Nova Venda.
  const clientes = todosClientes.filter((c) => c.ativo)

  return (
    <div>
      <Header
        title="Vendas"
        description="Registre e acompanhe os pedidos do dia"
      />
      <VendasClient vendas={vendas} itensDisponiveis={itensDisponiveis} clientes={clientes} />
    </div>
  )
}
