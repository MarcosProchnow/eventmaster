import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api, ApiError, call, errorMessage, type Payment } from "../../api/client";
import { formatMoney, formatShortDateTime } from "../../shared/format";
import { Alert, Button, Card, Loading, PageTitle, StatusBadge } from "../../shared/ui";

type Method = Payment["method"];
const METHODS: { value: Method; label: string }[] = [
  { value: "pix", label: "Pix" },
  { value: "boleto", label: "Boleto" },
  { value: "card", label: "Cartão" },
];

function Instructions({ payment }: { payment: Payment }) {
  const i = payment.instructions;
  return (
    <Alert kind="info">
      <p className="font-medium">Pagamento iniciado (ambiente de testes: nenhum valor é cobrado).</p>
      {i.kind === "pix" && (
        <p className="mt-1">
          Pix copia e cola: <code className="break-all">{i.copyPaste}</code>
        </p>
      )}
      {i.kind === "boleto" && (
        <p className="mt-1">
          Linha digitável: <code className="break-all">{i.digitableLine}</code> · vencimento {i.dueDate}
        </p>
      )}
      {i.kind === "card" && <p className="mt-1">{i.message}</p>}
      <p className="mt-2">Esta página atualiza sozinha quando o pagamento for confirmado.</p>
    </Alert>
  );
}

export function OrderPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<Method>("pix");

  const order = useQuery({
    queryKey: ["orders", id],
    queryFn: () => call(api.GET("/v1/orders/{id}", { params: { path: { id } } })),
    // Enquanto aguarda pagamento, consulta de novo a cada 4 s (a confirmação chega por webhook na API).
    refetchInterval: (query) => (query.state.data?.status === "reserved" ? 4000 : false),
  });
  const isPaid = order.data?.status === "paid";

  const tickets = useQuery({
    queryKey: ["orders", id, "tickets"],
    queryFn: () => call(api.GET("/v1/orders/{id}/tickets", { params: { path: { id } } })),
    enabled: isPaid,
  });

  const pay = useMutation({
    mutationFn: () => call(api.POST("/v1/orders/{id}/pay", { params: { path: { id } }, body: { method } })),
    onError: () => void queryClient.invalidateQueries({ queryKey: ["orders", id] }),
  });

  if (order.isPending) return <Loading />;
  if (order.isError) {
    const notFound = order.error instanceof ApiError && order.error.status === 404;
    return <Alert>{notFound ? "Pedido não encontrado." : errorMessage(order.error)}</Alert>;
  }

  const data = order.data;
  const quantity = data.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <>
      <PageTitle action={<StatusBadge status={data.status} />}>Pedido {data.id.slice(0, 8)}</PageTitle>
      <div className="space-y-6">
        <Card>
          <p className="text-lg font-semibold">
            {quantity} {quantity === 1 ? "ingresso" : "ingressos"} · {formatMoney(data.totalCents)}
          </p>
          <Link to={`/eventos/${data.eventId}`} className="text-sm text-brand-700 underline">
            Ver o evento
          </Link>
        </Card>

        {data.status === "reserved" && (
          <Card>
            <h2 className="mb-1 text-lg font-semibold">Pagamento</h2>
            <p className="mb-4 text-sm text-slate-600">
              Seus ingressos estão reservados até {formatShortDateTime(data.expiresAt)}.
            </p>
            {pay.isError && <Alert>{errorMessage(pay.error)}</Alert>}
            {pay.data ? (
              <Instructions payment={pay.data} />
            ) : (
              <div className="space-y-4">
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-slate-700">Forma de pagamento</legend>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {METHODS.map((m) => (
                      <label key={m.value} className="flex items-center gap-2">
                        <input type="radio" name="method" checked={method === m.value} onChange={() => setMethod(m.value)} />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button loading={pay.isPending} onClick={() => pay.mutate()}>
                  Pagar {formatMoney(data.totalCents)}
                </Button>
              </div>
            )}
          </Card>
        )}

        {data.status === "expired" && (
          <Alert kind="info">A reserva expirou e os ingressos voltaram a ficar disponíveis.</Alert>
        )}
        {data.status === "cancelled" && (
          <Alert kind="info">O pagamento não foi aprovado e o pedido foi cancelado.</Alert>
        )}

        {isPaid && (
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Seus ingressos</h2>
            {tickets.isPending && <Loading />}
            {tickets.isError && <Alert>{errorMessage(tickets.error)}</Alert>}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tickets.data?.map((ticket, index) => (
                <li key={ticket.id} className="rounded-lg border border-slate-200 p-4 text-center">
                  <QRCodeSVG value={ticket.code} size={160} className="mx-auto" title={`QR code do ingresso ${index + 1}`} />
                  <p className="mt-3 text-sm font-medium">Ingresso {index + 1}</p>
                  <p className="break-all font-mono text-xs text-slate-500">{ticket.code}</p>
                  {ticket.checkedInAt && <p className="mt-1 text-xs text-emerald-700">Entrada registrada</p>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
