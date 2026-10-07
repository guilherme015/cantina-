import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Header } from "@/components/layout/header"
import { obterDetalheCliente } from "@/app/actions/clientes"
import { ClienteDetalheClient } from "./cliente-detalhe-client"

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detalhe = await obterDetalheCliente(id)
  if (!detalhe) notFound()

  return (
    <div>
      <Link
        href="/cadastros/clientes"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-3"
      >
        <ArrowLeft className="w-4 h-4" />
        Clientes
      </Link>
      <Header
        title={detalhe.cliente.nome}
        description="Dívidas em aberto e histórico do cliente"
      />
      <ClienteDetalheClient detalhe={detalhe} />
    </div>
  )
}
