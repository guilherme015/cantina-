"use client"

import { useState } from "react"
import { PasswordInput } from "@/components/ui/password-input"
import { PasswordChecklist } from "@/components/ui/password-checklist"

interface Props {
  id?: string
  name: string
  placeholder?: string
  autoComplete?: string
}

// Campo de senha com o botão de olho e o checklist de critérios juntos,
// pra cadastro e redefinição de senha — os dois lugares onde uma senha
// NOVA é definida (login não precisa: a senha já existe).
export function PasswordFieldChecklist({ id, name, placeholder, autoComplete = "new-password" }: Props) {
  const [senha, setSenha] = useState("")

  return (
    <div>
      {/* Sem `value` de propósito: um input controlado faz o React copiar o
          valor digitado pro atributo HTML `value`, deixando a senha visível
          no DOM (inspecionável, e explorável por um seletor CSS tipo
          input[value$="a"] — "CSS keylogger"). Não controlado, o DOM nunca
          guarda o valor — só o estado em memória, que é o suficiente pro
          checklist. */}
      <PasswordInput
        id={id}
        name={name}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => setSenha(e.target.value)}
        className="w-full h-11"
      />
      <PasswordChecklist senha={senha} />
    </div>
  )
}
