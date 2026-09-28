"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"

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

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const nomeIgreja = (formData.get("nomeIgreja") as string)?.trim()

  if (!nomeIgreja) {
    redirect("/login?error=nome_igreja_obrigatorio")
  }

  // A criação da igreja e do vínculo de owner acontece num trigger no banco
  // (trg_criar_igreja_no_cadastro, disparado por AFTER INSERT ON auth.users),
  // atômico com a criação do usuário — não dá pra fazer isso aqui na
  // server action porque o client não tem mais permissão de INSERT em
  // igrejas/igreja_membros (ver supabase/schema.sql).
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nome_igreja: nomeIgreja } },
  })

  if (error) {
    if (error.code === "user_already_exists") {
      redirect("/login?error=email_ja_cadastrado")
    }
    if (error.code === "weak_password") {
      redirect("/login?error=senha_fraca")
    }
    redirect("/login?error=erro_cadastro")
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

  const password = formData.get("password") as string
  const confirmar = formData.get("confirmar") as string

  if (!password || password.length < 6) {
    redirect("/redefinir-senha?error=senha_curta")
  }
  if (password !== confirmar) {
    redirect("/redefinir-senha?error=senhas_diferentes")
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    if (error.code === "same_password") {
      redirect("/redefinir-senha?error=senha_igual")
    }
    redirect("/redefinir-senha?error=erro_generico")
  }

  redirect("/vendas")
}
