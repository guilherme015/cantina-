# Cantina+

Sistema de gestão de cantinas para igrejas, escolas e pequenos eventos.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS v4**
- **Supabase** (PostgreSQL + Auth)
- **Radix UI** + componentes estilo shadcn/ui

## Setup

### 1. Instalar dependências

```bash
npm install
```

### 2. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto chamado `cantina-plus`.
2. Em **Settings → API**, copie `Project URL` e `anon public key`.
3. Cole em `.env.local` (use `.env.example` como referência).

### 3. Criar as tabelas

No Supabase, vá em **SQL Editor** e execute `supabase/schema.sql`.

### 4. Rodar localmente

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Roadmap (MVP)

- [x] **Fase 1** — Setup do projeto + layout principal
- [ ] **Fase 2** — Autenticação (login/logout)
- [ ] **Fase 3** — Cadastro de Produtos
- [ ] **Fase 4** — Cardápio do Dia
- [ ] **Fase 5** — Vendas (núcleo do sistema)
- [ ] **Fase 6** — Fiado / Contas a Receber
- [ ] **Fase 7** — Contas a Pagar
- [ ] **Fase 8** — Extrato financeiro
- [ ] **Fase 9** — Fechamento do dia
