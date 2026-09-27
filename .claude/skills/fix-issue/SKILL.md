---
name: fix-issue
description: Implementa uma issue do GitHub seguindo o fluxo 1 issue = 1 branch = 1 PR do Cantina+
disable-model-invocation: true
---
Implemente a issue do GitHub: $ARGUMENTS.

1. Busque os detalhes da issue (título, corpo, checklist) via MCP do GitHub.
2. Se a issue tiver dependências declaradas (ex.: "Depende de #N") e essas issues ainda estiverem abertas, avise antes de prosseguir em vez de implementar fora de ordem.
3. Crie uma branch a partir da branch de desenvolvimento atual, nomeada `issue-<número>-<slug-curto>`.
4. Implemente apenas o escopo descrito na issue — não misture com outras issues abertas.
5. Rode `npm run build` (cobre TypeScript + ESLint) e corrija tudo que falhar antes de seguir.
6. Se a mudança mexe em Contas a Pagar, Contas a Receber, Extrato, Vendas ou Fechamento (qualquer cálculo de dinheiro), use o subagente `financeiro-reviewer`. Se mexe em `supabase/schema.sql` ou nas rotas/actions de auth, use o `supabase-security-reviewer`. Há um hook Stop (`.claude/hooks/check-reviewers.sh`) que bloqueia o fim do turno automaticamente se esquecer — mas não dependa só dele, invoque proativamente.
7. Antes de considerar a PR pronta pra merge, use o subagente `e2e-smoke-tester` nos fluxos que a issue afeta.
8. Commit com mensagem descritiva referenciando a issue (`Refs #<número>` ou `Closes #<número>` se resolver completamente).
9. Push da branch e abertura de PR referenciando a issue, com o footer de atribuição padrão do Claude Code.
