export interface CriterioSenha {
  id: string
  label: string
  test: (senha: string) => boolean
}

// Única fonte de verdade dos critérios de senha forte — usada tanto na
// validação do servidor (src/app/actions/auth.ts) quanto no checklist
// visual do cadastro (PasswordFieldChecklist). Os dois precisam bater
// exatamente, senão o checklist mostra "tudo certo" com uma senha que o
// servidor ainda rejeita.
// Conjunto de símbolos ASCII (não letra acentuada, não espaço, não emoji)
// — "especial" com `[^A-Za-z0-9]` também aceitava "ç"/"á"/espaço, o que
// esvazia o critério em português ("Coração2024" passaria só pelo "ç").
const SIMBOLOS_ESPECIAIS = /[-!@#$%^&*()_+=[\]{}|;:'",.<>/?~`]/

export const CRITERIOS_SENHA: CriterioSenha[] = [
  { id: "tamanho", label: "Mínimo de 8 caracteres", test: (s) => s.length >= 8 },
  // O limite de 72 bytes é do bcrypt usado pelo Supabase Auth — sem essa
  // checagem aqui, uma senha longa (fácil de passar de 72 bytes com
  // acento, cada um usa 2) passa no checklist e o Supabase rejeita depois
  // com um erro genérico.
  { id: "tamanho_max", label: "Até 72 bytes", test: (s) => new TextEncoder().encode(s).length <= 72 },
  // \p{Lu}/\p{Ll} (Unicode, não só A-Z/a-z) pra maiúscula/minúscula
  // acentuada contarem certo (ex.: "Á" é maiúscula).
  { id: "maiuscula", label: "1 letra maiúscula", test: (s) => /\p{Lu}/u.test(s) },
  { id: "minuscula", label: "1 letra minúscula", test: (s) => /\p{Ll}/u.test(s) },
  { id: "numero", label: "1 número", test: (s) => /[0-9]/.test(s) },
  { id: "especial", label: "1 caractere especial (ex.: ! @ # $ %)", test: (s) => SIMBOLOS_ESPECIAIS.test(s) },
]

export function senhaAtendeCriterios(senha: string): boolean {
  return CRITERIOS_SENHA.every((c) => c.test(senha))
}
