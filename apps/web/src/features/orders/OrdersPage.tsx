import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, call, errorMessage } from "../../api/client";
import { formatMoney, formatShortDateTime } from "../../shared/format";
import { Alert, Card, Loading, PageTitle, StatusBadge } from "../../shared/ui";

export function OrdersPage() {
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => call(api.GET("/v1/orders")) });

  return (
    <>
      <PageTitle>Meus pedidos</PageTitle>
      {orders.isPending && <Loading />}
      {orders.isError && <Alert>{errorMessage(orders.error)}</Alert>}
      {orders.data?.length === 0 && (
        <Alert kind="info">
          Você ainda não tem pedidos. <Link to="/" className="underline">Veja os eventos</Link>.
        </Alert>
      )}
      <ul className="space-y-3">
        {orders.data?.map((order) => {
          const quantity = order.items.reduce((sum, i) => sum + i.quantity, 0);
          return (
            <li key={order.id}>
              <Link to={`/pedidos/${order.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-brand-600">
                <Card className="flex flex-wrap items-center justify-between gap-3 transition hover:border-brand-600">
                  <div>
                    <p className="font-medium">
                      {quantity} {quantity === 1 ? "ingresso" : "ingressos"} · {formatMoney(order.totalCents)}
                    </p>
                    <p className="text-sm text-slate-500">Pedido {order.id.slice(0, 8)}</p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={order.status} />
                    {order.status === "reserved" && (
                      <p className="mt-1 text-xs text-slate-500">
                        Reserva até {formatShortDateTime(order.expiresAt)}
                      </p>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
