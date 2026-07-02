// Converte erros do Postgres/Supabase em mensagens amigáveis,
// sem vazar nomes de tabelas e constraints para o usuário.
type ErroSupabase = { code?: string; message: string }

const MENSAGENS_POR_CODIGO: Record<string, string> = {
  "23505": "Já existe um registro igual a esse.",
  "23503": "Esse registro está vinculado a outro e não pode ser alterado.",
  "23514": "Os valores informados são inválidos.",
}

export function mensagemDeErro(error: ErroSupabase): string {
  if (error.code && MENSAGENS_POR_CODIGO[error.code]) {
    return MENSAGENS_POR_CODIGO[error.code]
  }
  return "Não foi possível salvar os dados. Tente novamente."
}
