import { Header } from "@/components/layout/header"
import { listarExtrato } from "@/app/actions/financeiro"
import { ExtratoClient } from "./extrato-client"

export default async function ExtratoPage() {
  const movimentacoes = await listarExtrato()

  return (
    <div>
      <Header title="Extrato Financeiro" description="Acompanhe todas as movimentações do caixa" />
      <ExtratoClient movimentacoes={movimentacoes} />
    </div>
  )
}
