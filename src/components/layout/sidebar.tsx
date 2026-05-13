"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ShoppingCart,
  Package,
  Calendar,
  ArrowDownCircle,
  ArrowUpCircle,
  TrendingUp,
  Settings,
  UtensilsCrossed,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"

const navItems = [
  {
    label: "Vendas",
    href: "/vendas",
    icon: ShoppingCart,
  },
  {
    label: "Separador",
    separator: true,
  },
  {
    label: "Cardápio do Dia",
    href: "/cadastros/cardapio",
    icon: Calendar,
  },
  {
    label: "Produtos",
    href: "/cadastros/produtos",
    icon: Package,
  },
  {
    label: "Separador",
    separator: true,
  },
  {
    label: "Extrato",
    href: "/financeiro/extrato",
    icon: TrendingUp,
  },
  {
    label: "Contas a Receber",
    href: "/financeiro/contas-receber",
    icon: ArrowDownCircle,
  },
  {
    label: "Contas a Pagar",
    href: "/financeiro/contas-pagar",
    icon: ArrowUpCircle,
  },
  {
    label: "Separador",
    separator: true,
  },
  {
    label: "Configurações",
    href: "/configuracoes",
    icon: Settings,
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-[240px] bg-white border-r border-[var(--border)] flex flex-col z-40">
      <div className="flex items-center gap-2 px-6 py-5 border-b border-[var(--border)]">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--primary)]">
          <UtensilsCrossed className="w-4 h-4 text-white" />
        </div>
        <span className="text-lg font-bold text-[var(--foreground)]">Cantina+</span>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item, index) => {
            if (item.separator) {
              return <li key={index} className="py-2"><Separator /></li>
            }

            const Icon = item.icon!
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

            return (
              <li key={item.href}>
                <Link
                  href={item.href!}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[var(--primary)] text-white"
                      : "text-[var(--secondary-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="px-6 py-4 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--muted-foreground)]">Cantina+ v1.0</p>
      </div>
    </aside>
  )
}
