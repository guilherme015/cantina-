import { Header } from "@/components/layout/header"
import { exigirAdmin } from "@/lib/auth-contexto"
import { resumoDoDia, listarFechamentos } from "@/app/actions/fechamento"
import { FechamentoClient } from "./fechamento-client"

export default async function FechamentoPage() {
  await exigirAdmin()
  const [resumo, fechamentos] = await Promise.all([
    resumoDoDia(),
    listarFechamentos(),
  ])

  return (
    <div>
      <Header title="Fechamento do Dia" description="Confira o caixa e feche o dia" />
      <FechamentoClient resumoInicial={"error" in resumo ? null : resumo} fechamentos={fechamentos} />
    </div>
  )
}
