import { Header } from "@/components/layout/header"
import { listarContasReceber } from "@/app/actions/financeiro"
import { listarClientes } from "@/app/actions/clientes"
import { ContasReceberClient } from "./contas-receber-client"

export default async function ContasReceberPage() {
  const [contas, clientes] = await Promise.all([listarContasReceber(), listarClientes()])
  return (
    <div>
      <Header title="Contas a Receber" description="Controle do fiado e pagamentos pendentes" />
      <ContasReceberClient contas={contas} clientes={clientes} />
    </div>
  )
}
