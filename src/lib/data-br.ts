const TZ = "America/Sao_Paulo"

export function dataBR(instante: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instante))
}

export function hojeBR(): string {
  return dataBR()
}

export function limitesDiaBR(data: string): { inicio: string; fimExclusivo: string } {
  const inicio = new Date(`${data}T00:00:00-03:00`)
  const fim = new Date(inicio)
  fim.setUTCDate(fim.getUTCDate() + 1)
  return { inicio: inicio.toISOString(), fimExclusivo: fim.toISOString() }
}
