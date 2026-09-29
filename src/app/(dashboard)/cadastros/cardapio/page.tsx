import { Header } from "@/components/layout/header"
import { listarProdutos } from "@/app/actions/produtos"
import { getCardapioHoje } from "@/app/actions/cardapio"
import { hojeBR } from "@/lib/data-br"
import { CardapioClient } from "./cardapio-client"

export default async function CardapioPage() {
  const [produtos, cardapioHoje] = await Promise.all([
    listarProdutos(),
    getCardapioHoje(),
  ])

  return (
    <div>
      <Header
        title="Cardápio do Dia"
        description="Defina quais produtos estarão disponíveis em cada dia"
      />
      <CardapioClient produtos={produtos} dataInicial={hojeBR()} idsIniciais={cardapioHoje?.item_ids ?? []} />
    </div>
  )
}
