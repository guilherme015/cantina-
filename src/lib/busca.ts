// Acentos combinantes (U+0300–U+036F) que sobram depois do NFD. Escrito com
// escape explícito (não o caractere literal) pra ficar legível no código.
const ACENTOS = new RegExp("[\\u0300-\\u036f]", "g")

// Busca sem diferenciar maiúscula/minúscula nem acento: quem digita "jose"
// precisa achar "José".
export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(ACENTOS, "").toLowerCase()
}
