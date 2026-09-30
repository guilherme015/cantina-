import type { Papel } from "@/types/database"

export type { Papel }

export const ROTULO_PAPEL: Record<Papel, string> = {
  admin: "Administrador",
  operador: "Operador",
}

export const MENSAGEM_SO_ADMIN = "Apenas administradores podem fazer isso."

export function ehPapel(valor: unknown): valor is Papel {
  return valor === "admin" || valor === "operador"
}
