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
- Schema do banco é só `supabase/schema.sql` — não há pasta de migrations. Mudança de schema = editar esse arquivo e aplicar manualmente no SQL Editor do Supabase. Exceção: `supabase/migration-multi-igreja.sql` é um script ALTER-based único, pra atualizar um projeto Supabase que já tinha o schema antigo (sem `igreja_id`) — ver seção abaixo.
- Componentes de UI em `src/components/ui` seguem padrão shadcn/ui sobre Radix — reaproveite antes de criar um novo.

## Multi-igreja (tenant)

Isolamento de dados é por igreja (`igreja_id`), não por usuário (`user_id`) — um usuário pertence a exatamente 1 igreja (`igreja_membros`, `UNIQUE(user_id)`, sem convite de membro ainda), e vários usuários da mesma igreja compartilham os mesmos dados. Decisão de produto: o Cantina+ vai virar módulo de um SaaS multi-igreja maior (histórico completo na issue #18).

- RLS usa `private.minhas_igrejas()` (função `SECURITY DEFINER`, schema `private` não exposto pelo PostgREST) em vez de repetir a subquery em `igreja_membros` diretamente numa policy — isso causa `infinite recursion detected in policy` (42P17) no Postgres.
- Cadastro cria a igreja + vínculo de owner via trigger `AFTER INSERT ON auth.users` (`criar_igreja_no_cadastro`), não na server action de signup — RLS travaria o INSERT antes do vínculo existir (ovo e galinha), e se a confirmação de e-mail estiver ligada no projeto, `auth.uid()` fica nulo depois do `signUp()`.
- Fechamento de caixa é a RPC `fechar_caixa` (`SECURITY DEFINER`; não existe policy de INSERT client-side em `tab_fechamento_caixa` — a RPC é o único caminho de escrita), com `pg_advisory_xact_lock` por `(igreja, dia)` (`private.chave_lock_fechamento`) pra fechar a corrida entre uma venda sendo confirmada e o cálculo do resumo. Um trigger em `tab_extrato_financeiro` usa o mesmo lock (modo compartilhado) pra rejeitar INSERT/UPDATE/DELETE de um dia já fechado.
- Reabrir o caixa é a RPC `reabrir_caixa` (mesmo padrão de `fechar_caixa`, mesmo lock) — exige justificativa não vazia, grava um snapshot completo do fechamento em `tab_reaberturas_caixa` (auditoria imutável: sem policy de INSERT client-side, `user_id`/`fechado_por` com `ON DELETE SET NULL` pra não desaparecer se a conta for excluída) e só então apaga a linha de `tab_fechamento_caixa`. Só reabre o dia de **hoje** — a nível de banco, não só na UI — porque a tela de fechamento só sabe fechar "hoje"; reabrir um dia passado o deixaria aberto pra sempre.
- `numero_pedido` em `tab_vendas` é numerado por igreja via trigger (`numerar_venda_por_igreja`), não por uma sequência global — evita revelar volume de vendas de outras igrejas.
- Toda função `SECURITY DEFINER` usa `SET search_path = ''` com nomes totalmente qualificados (`public.tabela`) — sem isso, uma tabela temporária com o mesmo nome de uma tabela real sequestra o INSERT/SELECT (mesma classe do CVE-2018-1058).
- Server actions resolvem a igreja do usuário logado via `getIgrejaIdAtual()` (`src/lib/igreja.ts`) e filtram por `igreja_id` — `user_id` nas tabelas de negócio continua existindo só como registro de "quem fez", não é mais usado para isolamento.
- **Passo manual pendente:** aplicar `supabase/migration-multi-igreja.sql` no SQL Editor do projeto Supabase real — ver checklist na issue #19. Sem isso o app não funciona em produção (código já espera `igreja_id`).
- Backlog conhecido, documentado e não bloqueante: hardening de baixo risco aceito por ora — `user_id` forjável no `WITH CHECK` das tabelas de negócio e FKs de tabelas filhas sem `igreja_id` (#21); `tab_fechamento_caixa.user_id` ainda em `ON DELETE CASCADE` (perde o fechamento e a trava do dia se a conta de quem fechou for excluída) (#23).

## Revisores automáticos

Um hook Stop (`.claude/hooks/check-reviewers.sh`) checa o diff não commitado a cada turno e bloqueia o fim do turno se:
- Tocou Vendas/Fiado/Contas a Pagar/Contas a Receber/Extrato sem o subagente `financeiro-reviewer` ter revisado o diff atual
- Tocou `supabase/schema.sql` ou rotas/actions de auth sem o `supabase-security-reviewer` ter revisado

O rastreio é por hash do diff (marker em `/tmp/claude-cantina-hooks/`), não por commit — só cobre mudanças ainda não commitadas. Depois de commitar, quem pega o que passou é a revisão de PR.

Use o `e2e-smoke-tester` manualmente antes de qualquer PR ir pra merge (não é hookável por path, então não é automático).

## Armadilha conhecida

`next.config.ts` já teve `typescript.ignoreBuildErrors` e `eslint.ignoreDuringBuilds` setados como `true` (commit `bb2b0b7`) e foi revertido em seguida (`6b5fd7e`) porque escondia erros reais. **Nunca reative essas flags** — `npm run build` só é um check confiável enquanto elas ficarem `false`/ausentes.
