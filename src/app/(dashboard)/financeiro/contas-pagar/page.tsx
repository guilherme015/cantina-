import { Header } from "@/components/layout/header"
import { exigirAdmin } from "@/lib/auth-contexto"
import { listarContasPagar } from "@/app/actions/financeiro"
import { ContasPagarClient } from "./contas-pagar-client"

export default async function ContasPagarPage() {
  await exigirAdmin()
  const contas = await listarContasPagar()
  return (
    <div>
      <Header title="Contas a Pagar" description="Registre as despesas da cantina" />
      <ContasPagarClient contas={contas} />
    </div>
  )
}
