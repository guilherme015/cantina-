import { Header } from "@/components/layout/header"
import { listarExtrato } from "@/app/actions/financeiro"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import { ExtratoClient } from "./extrato-client"

export default async function ExtratoPage() {
  const [movimentacoes, { papel }] = await Promise.all([listarExtrato(), getUsuarioEIgreja()])

  return (
    <div>
      <Header title="Extrato Financeiro" description="Acompanhe todas as movimentações do caixa" />
      <ExtratoClient movimentacoes={movimentacoes} ehAdmin={papel === "admin"} />
    </div>
  )
}
