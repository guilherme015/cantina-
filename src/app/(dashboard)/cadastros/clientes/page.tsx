import { Header } from "@/components/layout/header"
import { listarClientes } from "@/app/actions/clientes"
import { listarContasReceber } from "@/app/actions/financeiro"
import { saldosPorCliente } from "@/lib/saldo-clientes"
import { ClientesClient } from "./clientes-client"

export default async function ClientesPage() {
  const [clientes, contasAbertas] = await Promise.all([
    listarClientes(),
    listarContasReceber({ apenasAbertas: true }),
  ])

  // Saldo devedor em centavos por cliente (#57). Objeto simples, não Map,
  // pra atravessar a fronteira servidor → cliente sem surpresa.
  const saldos: Record<string, number> = {}
  for (const [clienteId, saldo] of saldosPorCliente(contasAbertas)) {
    saldos[clienteId] = saldo.centavos
  }

  return (
    <div>
      <Header
        title="Clientes"
        description="Cadastre quem compra e veja quem está devendo"
      />
      <ClientesClient clientes={clientes} saldos={saldos} />
    </div>
  )
}
