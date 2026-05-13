import { Header } from "@/components/layout/header"
import { listarContasReceber } from "@/app/actions/financeiro"
import { ContasReceberClient } from "./contas-receber-client"

export default async function ContasReceberPage() {
  const contas = await listarContasReceber()
  return (
    <div>
      <Header title="Contas a Receber" description="Controle do fiado e pagamentos pendentes" />
      <ContasReceberClient contas={contas} />
    </div>
  )
}
