import { Header } from "@/components/layout/header"
import { listarContasReceber } from "@/app/actions/financeiro"
import { getUsuarioEIgreja } from "@/lib/auth-contexto"
import { ContasReceberClient } from "./contas-receber-client"

export default async function ContasReceberPage() {
  const [contas, { papel }] = await Promise.all([listarContasReceber(), getUsuarioEIgreja()])
  return (
    <div>
      <Header title="Contas a Receber" description="Controle do fiado e pagamentos pendentes" />
      <ContasReceberClient contas={contas} ehAdmin={papel === "admin"} />
    </div>
  )
}
