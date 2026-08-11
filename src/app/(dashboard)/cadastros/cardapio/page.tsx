import { Header } from "@/components/layout/header"
import { listarProdutos } from "@/app/actions/produtos"
import { getCardapioPorData } from "@/app/actions/cardapio"
import { CardapioClient } from "./cardapio-client"

export default async function CardapioPage() {
  const hoje = new Date().toISOString().split("T")[0]
  const [produtos, cardapioHoje] = await Promise.all([
    listarProdutos(),
    getCardapioPorData(hoje),
  ])

  return (
    <div>
      <Header
        title="Cardápio do Dia"
        description="Defina quais produtos estarão disponíveis em cada dia"
      />
      <CardapioClient
        produtos={produtos}
        dataInicial={hoje}
        idsIniciais={cardapioHoje?.item_ids ?? []}
      />
    </div>
  )
}
