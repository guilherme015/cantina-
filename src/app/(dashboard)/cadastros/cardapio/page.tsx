import { Header } from "@/components/layout/header"
import { listarProdutos } from "@/app/actions/produtos"
import { getCardapioHoje } from "@/app/actions/cardapio"
import { CardapioClient } from "./cardapio-client"

export default async function CardapioPage() {
  const [produtos, cardapioHoje] = await Promise.all([
    listarProdutos(),
    getCardapioHoje(),
  ])

  const idsHoje = cardapioHoje?.tab_cardapio_dia_itens?.map((i: any) => i.item_id) ?? []

  return (
    <div>
      <Header
        title="Cardápio do Dia"
        description="Defina quais produtos estarão disponíveis hoje"
      />
      <CardapioClient produtos={produtos} idsHoje={idsHoje} />
    </div>
  )
}
