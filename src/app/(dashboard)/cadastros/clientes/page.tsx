import { Header } from "@/components/layout/header"
import { listarClientes } from "@/app/actions/clientes"
import { ClientesClient } from "./clientes-client"

export default async function ClientesPage() {
  const clientes = await listarClientes()

  return (
    <div>
      <Header
        title="Clientes"
        description="Cadastre quem compra, principalmente no fiado"
      />
      <ClientesClient clientes={clientes} />
    </div>
  )
}
