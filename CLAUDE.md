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
- `supabase/migration-multi-igreja.sql` já foi aplicada no projeto Supabase real (29/09/2026) — ver checklist na issue #19.
- Backlog conhecido, documentado e não bloqueante: hardening de baixo risco aceito por ora — `user_id` forjável no `WITH CHECK` das tabelas de negócio e FKs de tabelas filhas sem `igreja_id` (#21).
- `tab_fechamento_caixa.user_id` é `ON DELETE SET NULL` (não `CASCADE`, corrigido na #23): excluir a conta de quem fechou o caixa não apaga o fechamento nem a trava do dia — só perde o registro de quem fechou. `tab_extrato_financeiro.user_id` continua em `CASCADE`, então excluir a conta de alguém com lançamento num dia já fechado falha (o trigger de dia fechado rejeita o DELETE em cascata) — comportamento aceitável por ora, sem fluxo de exclusão de conta própria no app hoje.

## Fiado (Contas a Receber)

Toda linha de `tab_contas_receber` nasce de uma venda fiado (`criarVenda` sempre grava `venda_id`) — cancelar a venda e excluir/receber a conta precisam ficar sincronizados, senão um lado fica com um dado que o outro já não tem mais (histórico: issue #13). `cancelarVenda` (`src/app/actions/vendas.ts`), `excluirContaReceber` e `baixarContaReceber` (`src/app/actions/financeiro.ts`) comparam `valor_devido` da conta com `total` da venda — **só valor, não cliente**: corrigir o nome do cliente não muda de quem é o dinheiro, então não deveria impedir tratar a conta como "a mesma dívida" — pra decidir se a conta ainda representa o que a venda registrou:
- **Valor não foi editado:** cancelar a venda também apaga a conta (e excluir a conta também cancela a venda, se ela ainda não estava cancelada). O `DELETE` sempre repete a comparação de valor na própria condição (não só numa leitura anterior) — se o valor mudou entre a leitura e o delete (outro membro editando ao mesmo tempo), 0 linhas são apagadas e cai no caminho de desvincular abaixo, nunca perde dinheiro por corrida.
- **Valor foi editado** (ex.: operador mudou de R$20 pra R$30 pra "juntar" consumo de outro dia numa cobrança só): cancelar a venda **desvincula** a conta (`venda_id = null`) em vez de apagar — perderia dinheiro que não tem relação com aquela venda especificamente. A conta sobrevive como uma dívida independente, sem venda de origem (senão `baixarContaReceber` bloquearia receber, por checar se a venda ligada foi cancelada). Se a corrida acontece bem no meio de uma baixa (`baixarContaReceber` marca `pago=true` no instante em que `cancelarVenda` cancela a venda de origem), o mesmo desvincula desfaz a baixa (`pago=false`) em vez de apagar.
- Backlog conhecido, não bloqueante: se o fiado da manhã (R$20) é "juntado" à conta da tarde (R$30, edição) e depois só o fiado da manhã é excluído/cancelado individualmente (não a conta already-merged), a venda da manhã é cancelada mesmo o consumo tendo realmente acontecido — o "Total do dia" de Vendas cai, mas o dinheiro entra certo pela conta que ficou com R$30. Editar o valor de uma conta fiado é, na prática, uma decisão consciente de "essa conta não representa mais 1:1 aquela venda".

## Cardápio do Dia

Vendas só oferece produtos que estão no cardápio de hoje (`tab_cardapio_dia` + `tab_cardapio_dia_itens`) — sem cardápio configurado pra hoje, `listarItensCardapioHoje` retorna `[]` (nenhum fallback pra "mostrar todo o catálogo ativo"; isso já existiu e foi removido porque contradizia a própria ideia de "cardápio do dia"). A restrição é reforçada **no servidor**: `criarVenda` (`src/app/actions/vendas.ts`) rejeita qualquer `item_id` que não esteja no cardápio de hoje e ativo, mesmo que a tela mande — sem essa checagem, uma aba de Vendas esquecida aberta de um dia anterior (ou uma chamada direta à action) venderia qualquer coisa. `salvarCardapioHoje`/`copiarUltimoCardapio` (`src/app/actions/cardapio.ts`) filtram produto desativado (`tab_itens.ativo`) tanto na cópia quanto na listagem.
- Backlog conhecido, não bloqueante: `salvarCardapioHoje` faz DELETE + INSERT (não atômico) — dois membros da mesma igreja salvando o cardápio de hoje ao mesmo tempo podem gerar a união das duas seleções em vez da que "venceu" por último.

## Datas

Use sempre `hojeBR()`/`dataBR()` (`src/lib/data-br.ts`, fuso `America/Sao_Paulo` explícito) pra qualquer "data de hoje" usada como filtro ou gravada no banco — nunca `new Date().toISOString().split("T")[0]`. Como o Brasil é UTC-3, das ~21h às 23h59 (horário de SP) o UTC já é o dia seguinte, então o corte cru pega a data errada bem no horário de pico de uma cantina. Já foi bug real em `cardapio.ts`, `vendas.ts` e no default do campo de data de Contas a Pagar — corrigidos, mas qualquer novo "hoje" no código precisa vir de `data-br.ts`, inclusive em client components (as funções não dependem do fuso da máquina, só do parâmetro `timeZone` explícito do `Intl.DateTimeFormat`).

## Senha forte

Critérios de senha (mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número, 1 caractere especial) vivem só em `src/lib/senha.ts` (`CRITERIOS_SENHA` + `senhaAtendeCriterios`) — é a mesma fonte usada pelo checklist visual (`PasswordChecklist`) e pela validação de verdade no servidor (`signup`/`redefinirSenha` em `src/app/actions/auth.ts`). Nunca duplique os critérios em outro lugar: o checklist só é confiável enquanto for exatamente o que o servidor aplica.

## Recuperação de senha

`/redefinir-senha` só pode ser acessada por uma sessão que veio de verdade do link de recuperação por e-mail — `sessaoVeioDeRecuperacao()` (`src/lib/sessao-recuperacao.ts`) confere isso lendo o claim `amr` (authentication method reference) do JWT via `getClaims()`, com janela de 30min (o `amr` fica gravado na sessão até ela expirar — até 400 dias — então sem checar o timestamp uma sessão antiga que passou pelo fluxo continuaria liberada pra sempre). A checagem roda **tanto na página quanto na server action `redefinirSenha`** — a action é a fronteira de verdade, porque é um endpoint POST próprio, chamável direto sem passar pela página.
- Limitação conhecida, fora do alcance deste código: alguém com acesso ao console do navegador de uma sessão já logada ainda consegue ler o cookie (não é `httpOnly`, por design do `@supabase/ssr` — o client do browser precisa ler a sessão) e chamar a API do Supabase Auth direto, ignorando o app inteiro. Só se fecha com `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD` do lado do GoTrue (se exposto no dashboard do projeto).

## Revisores automáticos

Um hook Stop (`.claude/hooks/check-reviewers.sh`) checa o diff não commitado a cada turno e bloqueia o fim do turno se:
- Tocou Vendas/Fiado/Contas a Pagar/Contas a Receber/Extrato sem o subagente `financeiro-reviewer` ter revisado o diff atual
- Tocou `supabase/schema.sql` ou rotas/actions de auth sem o `supabase-security-reviewer` ter revisado

O rastreio é por hash do diff (marker em `/tmp/claude-cantina-hooks/`), não por commit — só cobre mudanças ainda não commitadas. Depois de commitar, quem pega o que passou é a revisão de PR.

Use o `e2e-smoke-tester` manualmente antes de qualquer PR ir pra merge (não é hookável por path, então não é automático).

## Armadilha conhecida

`next.config.ts` já teve `typescript.ignoreBuildErrors` e `eslint.ignoreDuringBuilds` setados como `true` (commit `bb2b0b7`) e foi revertido em seguida (`6b5fd7e`) porque escondia erros reais. **Nunca reative essas flags** — `npm run build` só é um check confiável enquanto elas ficarem `false`/ausentes.
