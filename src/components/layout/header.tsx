"use client"

import { formatDate } from "@/lib/utils"

interface HeaderProps {
  title: string
  description?: string
}

export function Header({ title, description }: HeaderProps) {
  const today = formatDate(new Date())

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{title}</h1>
        {description && (
          <p className="text-sm text-[var(--muted-foreground)] mt-1">{description}</p>
        )}
      </div>
      <div className="text-sm text-[var(--muted-foreground)] bg-white border border-[var(--border)] px-3 py-1.5 rounded-md">
        {today}
      </div>
    </div>
  )
}
