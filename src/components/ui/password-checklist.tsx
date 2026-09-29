"use client"

import { Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { CRITERIOS_SENHA } from "@/lib/senha"

interface Props {
  senha: string
}

export function PasswordChecklist({ senha }: Props) {
  return (
    <ul className="mt-2 space-y-1">
      {CRITERIOS_SENHA.map((criterio) => {
        const atende = criterio.test(senha)
        return (
          <li
            key={criterio.id}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              atende ? "text-green-600" : "text-[var(--muted-foreground)]"
            )}
          >
            {atende ? <Check className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
            {criterio.label}
          </li>
        )
      })}
    </ul>
  )
}
