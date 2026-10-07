import { revalidatePath } from "next/cache"

// Telas que mostram saldo devedor por cliente (#57). Toda action que muda
// uma dívida (criar venda fiado, cancelar, editar/excluir conta, dar baixa)
// ou o cadastro do cliente chama isto — senão o saldo na tela de Clientes,
// no detalhe do cliente e no relatório ficaria desatualizado. Só funciona
// chamado de dentro de uma server action.
export function revalidarSaldosDeClientes() {
  revalidatePath("/cadastros/clientes")
  revalidatePath("/cadastros/clientes/[id]", "page")
  revalidatePath("/financeiro/fiado-por-cliente")
}
