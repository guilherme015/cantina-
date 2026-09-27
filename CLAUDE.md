@AGENTS.md

# Cantina+

Sistema de gestão de cantinas (Next.js 16 App Router + TypeScript + Supabase). Domínio, nomes de variáveis/rotas e UI são em português — siga o idioma existente, não traduza para inglês.

## Comandos

- `npm run dev` — servidor local
- `npm run build` — **é o check de verdade**: valida TypeScript e ESLint (ver Armadilha abaixo). Rode antes de considerar qualquer tarefa concluída.
- `npm run lint` — só ESLint, mais rápido para iteração
- Não existe suíte de testes automatizados no projeto ainda.

## Fluxo de trabalho: issues

Backlog vive em GitHub Issues (`guilherme015/cantina-`), não em checklist de README. Padrão: **1 issue = 1 branch = 1 PR**. Use a skill `/fix-issue <número>` para seguir o fluxo completo.

## Arquitetura

- Rotas em `src/app/(auth)` e `src/app/(dashboard)` (route groups)
- Server actions por domínio em `src/app/actions/*.ts` (ex.: `vendas.ts`, `financeiro.ts`, `cardapio.ts`)
- Schema do banco é só `supabase/schema.sql` — não há pasta de migrations. Mudança de schema = editar esse arquivo e aplicar manualmente no SQL Editor do Supabase.
- Componentes de UI em `src/components/ui` seguem padrão shadcn/ui sobre Radix — reaproveite antes de criar um novo.

## Revisores automáticos

Um hook Stop (`.claude/hooks/check-reviewers.sh`) checa o diff não commitado a cada turno e bloqueia o fim do turno se:
- Tocou Vendas/Fiado/Contas a Pagar/Contas a Receber/Extrato sem o subagente `financeiro-reviewer` ter revisado o diff atual
- Tocou `supabase/schema.sql` ou rotas/actions de auth sem o `supabase-security-reviewer` ter revisado

O rastreio é por hash do diff (marker em `/tmp/claude-cantina-hooks/`), não por commit — só cobre mudanças ainda não commitadas. Depois de commitar, quem pega o que passou é a revisão de PR.

Use o `e2e-smoke-tester` manualmente antes de qualquer PR ir pra merge (não é hookável por path, então não é automático).

## Armadilha conhecida

`next.config.ts` já teve `typescript.ignoreBuildErrors` e `eslint.ignoreDuringBuilds` setados como `true` (commit `bb2b0b7`) e foi revertido em seguida (`6b5fd7e`) porque escondia erros reais. **Nunca reative essas flags** — `npm run build` só é um check confiável enquanto elas ficarem `false`/ausentes.
