import { Header } from "@/components/layout/header"
import { listarClientes } from "@/app/actions/clientes"
import { listarContasReceber } from "@/app/actions/financeiro"
import { SEM_CLIENTE, saldosPorCliente, totalEmAbertoCentavos } from "@/lib/saldo-clientes"
import { FiadoPorClienteClient, type LinhaFiado } from "./fiado-por-cliente-client"

export default async function FiadoPorClientePage() {
  const [clientes, contasAbertas] = await Promise.all([
    listarClientes(),
    listarContasReceber({ apenasAbertas: true }),
  ])

  const saldos = saldosPorCliente(contasAbertas)

  const linhas: LinhaFiado[] = clientes.map((c) => ({
    clienteId: c.id,
    nome: c.nome,
    telefone: c.telefone,
    arquivado: !c.ativo,
    centavos: saldos.get(c.id)?.centavos ?? 0,
    contas: saldos.get(c.id)?.contas ?? 0,
  }))

  // Contas sem cliente_id (nome em branco que o backfill não ligou, dado
  // antigo) entram numa linha à parte — senão o total geral aqui deixaria de
  // bater com o "Total em Aberto" de Contas a Receber.
  const semCliente = saldos.get(SEM_CLIENTE)
  if (semCliente) {
    linhas.push({
      clienteId: null,
      nome: "Sem cliente cadastrado",
      telefone: null,
      arquivado: false,
      centavos: semCliente.centavos,
      contas: semCliente.contas,
    })
  }

  linhas.sort((a, b) => b.centavos - a.centavos || a.nome.localeCompare(b.nome))

  return (
    <div>
      <Header
        title="Fiado por Cliente"
        description="Quanto cada cliente deve, do maior devedor pro menor"
      />
      <FiadoPorClienteClient linhas={linhas} totalCentavos={totalEmAbertoCentavos(contasAbertas)} />
    </div>
  )
}
