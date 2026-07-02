import Link from "next/link"
import { UtensilsCrossed } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="flex flex-col items-center text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--primary)] mb-4">
          <UtensilsCrossed className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-[var(--foreground)] mb-2">404</h1>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">
          Página não encontrada.
        </p>
        <Link
          href="/vendas"
          className="h-11 px-6 inline-flex items-center rounded-lg bg-[var(--primary)] text-white text-sm font-semibold hover:bg-[var(--primary)]/90 transition-colors"
        >
          Voltar para Vendas
        </Link>
      </div>
    </div>
  )
}
