"use client"

import { useState } from "react"
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
  LogOut,
  Menu,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { logout } from "@/app/actions/auth"

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
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Barra superior mobile */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-[var(--border)] flex items-center gap-3 px-4 z-50">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-[var(--secondary)] transition-colors"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--primary)]">
            <UtensilsCrossed className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold text-[var(--foreground)]">Cantina+</span>
        </div>
      </div>

      {/* Backdrop mobile */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 h-screen w-[240px] bg-white border-r border-[var(--border)] flex flex-col z-40 transition-transform duration-200",
          "max-lg:top-14 max-lg:h-[calc(100vh-3.5rem)]",
          open ? "translate-x-0" : "max-lg:-translate-x-full"
        )}
      >
        <div className="hidden lg:flex items-center gap-2 px-6 py-5 border-b border-[var(--border)]">
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
                    onClick={() => setOpen(false)}
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

        <div className="px-3 py-4 border-t border-[var(--border)]">
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium text-[var(--secondary-foreground)] hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sair
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
