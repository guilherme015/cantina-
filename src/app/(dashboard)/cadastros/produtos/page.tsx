import { Header } from "@/components/layout/header"
import { exigirAdmin } from "@/lib/auth-contexto"
import { listarProdutos } from "@/app/actions/produtos"
import { ProdutosClient } from "./produtos-client"

export default async function ProdutosPage() {
  await exigirAdmin()
  const produtos = await listarProdutos()

  return (
    <div>
      <Header
        title="Produtos"
        description="Gerencie os itens disponíveis para venda"
      />
      <ProdutosClient produtos={produtos} />
    </div>
  )
}
