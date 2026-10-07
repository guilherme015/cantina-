import type { ContaReceber } from "@/types/database"

// Fonte ÚNICA do "quanto o cliente deve" (#57): Contas a Receber agrupado,
// lista/detalhe de Clientes e o relatório "Fiado por cliente" usam estas
// funções — assim os totais batem entre as telas e com o "Total em Aberto".
//
// Soma em CENTAVOS (inteiros): somar valor_devido em reais acumula erro de
// ponto flutuante (0.1 + 0.2). Só converte pra reais na hora de exibir.
// Só entra no saldo conta com pago = false; paga nunca soma.

// Chave das contas sem cliente_id (nome em branco que o backfill não
// conseguiu ligar, ou dado antigo). Aparece à parte pra o total geral
// continuar batendo com o de Contas a Receber.
export const SEM_CLIENTE = "sem-cliente"

type ContaParaSaldo = Pick<ContaReceber, "cliente_id" | "valor_devido" | "pago">

export type Saldo = { centavos: number; contas: number }

export function emCentavos(valor: number): number {
  return Math.round(valor * 100)
}

export function deCentavos(centavos: number): number {
  return centavos / 100
}

export function saldosPorCliente(contas: ContaParaSaldo[]): Map<string, Saldo> {
  const saldos = new Map<string, Saldo>()
  for (const c of contas) {
    if (c.pago) continue
    const chave = c.cliente_id ?? SEM_CLIENTE
    const saldo = saldos.get(chave) ?? { centavos: 0, contas: 0 }
    saldo.centavos += emCentavos(c.valor_devido)
    saldo.contas += 1
    saldos.set(chave, saldo)
  }
  return saldos
}

export function totalEmAbertoCentavos(contas: ContaParaSaldo[]): number {
  let total = 0
  for (const c of contas) {
    if (!c.pago) total += emCentavos(c.valor_devido)
  }
  return total
}
