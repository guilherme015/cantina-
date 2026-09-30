"use server"

import { redirect } from "next/navigation"
import { headers, cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { senhaAtendeCriterios } from "@/lib/senha"
import { sessaoVeioDeRecuperacao } from "@/lib/sessao-recuperacao"

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect("/login?error=credenciais_invalidas")
  }

  redirect("/vendas")
}

// Volta pro /login preservando o link de convite (quando houver) — sem isso,
// um erro de senha fraca jogaria a pessoa de volta no cadastro de igreja nova
// e ela perderia o convite que tinha na URL.
function voltarAoLogin(erro: string, convite: string | null): never {
  const base = convite ? `/login?convite=${encodeURIComponent(convite)}&` : "/login?"
  redirect(`${base}error=${erro}`)
}

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get("email") as string
  const password = formData.get("password")
  const nomeIgreja = (formData.get("nomeIgreja") as string)?.trim()
  const convite = (formData.get("convite") as string | null)?.trim() || null

  if (convite) {
    // Confere o link antes de criar a conta pra dar uma mensagem decente. O
    // trigger de cadastro confere de novo (é ele que garante contra corrida):
    // se o convite for usado por outra pessoa entre esta checagem e o
    // INSERT, o cadastro inteiro é abortado no banco.
    const { data: conviteValido } = await supabase.rpc("consultar_convite", { p_token: convite })
    if (!conviteValido || conviteValido.length === 0) {
      redirect("/login?error=convite_invalido")
    }
  } else if (!nomeIgreja) {
    redirect("/login?error=nome_igreja_obrigatorio")
  }

  // Validação client-side (checklist) é só UX — sem conferir aqui de novo,
  // um POST direto no form action passaria por cima da senha fraca. Confere
  // o tipo porque um POST manual pode mandar qualquer coisa no campo (ou
  // nada), e senhaAtendeCriterios espera string.
  if (typeof password !== "string" || !senhaAtendeCriterios(password)) {
    voltarAoLogin("senha_fraca", convite)
  }

  // A criação da igreja (ou a entrada numa igreja existente, quando vem
  // `convite`) e do vínculo acontece num trigger no banco
  // (trg_criar_igreja_no_cadastro, disparado por AFTER INSERT ON auth.users),
  // atômico com a criação do usuário — não dá pra fazer isso aqui na
  // server action porque o client não tem mais permissão de INSERT em
  // igrejas/igreja_membros (ver supabase/schema.sql). Com convite, o papel
  // vem do convite, nunca do que o client mandar.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: convite ? { convite } : { nome_igreja: nomeIgreja } },
  })

  if (error) {
    if (error.code === "user_already_exists") {
      voltarAoLogin("email_ja_cadastrado", convite)
    }
    if (error.code === "weak_password") {
      voltarAoLogin("senha_fraca", convite)
    }
    if (convite) {
      // O trigger aborta o cadastro se o convite deixou de valer no meio do
      // caminho (usado/expirado/revogado) — o GoTrue devolve isso como um
      // erro genérico de banco. Distingue pra não culpar o e-mail.
      const { data: aindaValido } = await supabase.rpc("consultar_convite", { p_token: convite })
      if (!aindaValido || aindaValido.length === 0) {
        redirect("/login?error=convite_invalido")
      }
    }
    voltarAoLogin("erro_cadastro", convite)
  }

  redirect("/vendas")
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

async function urlBase(): Promise<string> {
  const h = await headers()
  const origin = h.get("origin")
  if (origin) return origin
  const proto = h.get("x-forwarded-proto") ?? "https"
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  return `${proto}://${host}`
}

export async function solicitarRecuperacaoSenha(formData: FormData) {
  const supabase = await createClient()
  const email = (formData.get("email") as string)?.trim()

  if (!email) {
    redirect("/recuperar-senha?error=email_obrigatorio")
  }

  const base = await urlBase()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${base}/auth/confirm?next=/redefinir-senha`,
  })

  // Sempre responde sucesso para não revelar quais e-mails têm conta.
  redirect("/recuperar-senha?enviado=1")
}

export async function redefinirSenha(formData: FormData) {
  const supabase = await createClient()

  // A checagem em redefinir-senha/page.tsx só decide o que renderizar —
  // uma server action é o próprio endpoint (chamável direto via POST com o
  // Next-Action id, sem passar pela página), então SEM conferir aqui de
  // novo, qualquer sessão logada normalmente ainda conseguiria trocar a
  // senha (issue #39 continuava aberta mesmo com a página bloqueando).
  if (!(await sessaoVeioDeRecuperacao(supabase))) {
    redirect("/login?error=link_invalido")
  }

  const password = formData.get("password") as string
  const confirmar = formData.get("confirmar") as string

  if (!password || !senhaAtendeCriterios(password)) {
    redirect("/redefinir-senha?error=senha_fraca")
  }
  if (password !== confirmar) {
    redirect("/redefinir-senha?error=senhas_diferentes")
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    if (error.code === "same_password") {
      redirect("/redefinir-senha?error=senha_igual")
    }
    // O Supabase pode rejeitar uma senha que já passou em
    // senhaAtendeCriterios acima (ex.: proteção de senha vazada, se
    // ligada no projeto) — mesma mensagem do resto do fluxo em vez de cair
    // no genérico.
    if (error.code === "weak_password") {
      redirect("/redefinir-senha?error=senha_fraca")
    }
    redirect("/redefinir-senha?error=erro_generico")
  }

  // Encerra a sessão de recuperação em vez de seguir logado: fecha a janela
  // residual do fix da issue #39 (essa mesma sessão, com o token de
  // recuperação, poderia voltar em /redefinir-senha e trocar a senha de
  // novo enquanto durasse) e garante que só quem sabe a senha nova
  // consegue entrar a partir daqui.
  const { error: errSignOut } = await supabase.auth.signOut()
  if (errSignOut) {
    // auth-js só limpa a sessão local sozinho em 401/403/404 — num erro de
    // rede ou 5xx do Supabase, ela ficaria válida no servidor com o cookie
    // intacto. Apaga os cookies da sessão na unha em vez de confiar só no
    // signOut: a janela de 30min de sessaoVeioDeRecuperacao já limita o
    // estrago, mas não custa fechar de vez.
    const cookieStore = await cookies()
    for (const c of cookieStore.getAll()) {
      if (c.name.startsWith("sb-")) cookieStore.delete(c.name)
    }
  }
  redirect("/login?senha_alterada=1")
}
