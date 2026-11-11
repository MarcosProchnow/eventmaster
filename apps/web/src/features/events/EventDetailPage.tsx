import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducer, useRef } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { api, ApiError, call, errorMessage } from "../../api/client";
import { formatDateTime, formatMoney } from "../../shared/format";
import { Alert, Button, Card, Loading, PageTitle } from "../../shared/ui";
import { useSession } from "../auth/session";

const MAX_PER_ORDER = 10;

type Cart = Record<string, number>;
type CartAction = { type: "set"; ticketTypeId: string; quantity: number } | { type: "clear" };

/** O carrinho é estado local da tela; `useReducer` concentra as regras de alteração. */
function cartReducer(cart: Cart, action: CartAction): Cart {
  if (action.type === "clear") return {};
  const next = { ...cart };
  if (action.quantity <= 0) delete next[action.ticketTypeId];
  else next[action.ticketTypeId] = action.quantity;
  return next;
}

export function EventDetailPage() {
  const { id = "" } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [cart, dispatch] = useReducer(cartReducer, {});
  // Uma chave por tentativa de compra: repetir o envio (clique duplo, rede instável)
  // não cria um segundo pedido. Muda quando o carrinho muda.
  const idempotencyKey = useRef(crypto.randomUUID());

  const event = useQuery({
    queryKey: ["event", id],
    queryFn: () => call(api.GET("/v1/events/{id}", { params: { path: { id } } })),
  });
  const ticketTypes = useQuery({
    queryKey: ["event", id, "ticket-types"],
    queryFn: () => call(api.GET("/v1/events/{id}/ticket-types", { params: { path: { id } } })),
    enabled: event.isSuccess,
  });

  const reserve = useMutation({
    mutationFn: () =>
      call(
        api.POST("/v1/events/{id}/orders", {
          params: { path: { id }, header: { "idempotency-key": idempotencyKey.current } },
          body: {
            items: Object.entries(cart).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })),
          },
        }),
      ),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      navigate(`/pedidos/${order.id}`);
    },
    onError: () => {
      // O estoque pode ter mudado: mostra as quantidades atuais.
      void queryClient.invalidateQueries({ queryKey: ["event", id, "ticket-types"] });
    },
  });

  function setQuantity(ticketTypeId: string, quantity: number) {
    dispatch({ type: "set", ticketTypeId, quantity });
    idempotencyKey.current = crypto.randomUUID();
    reserve.reset();
  }

  if (event.isPending) return <Loading />;
  if (event.isError) {
    const notFound = event.error instanceof ApiError && event.error.status === 404;
    return <Alert>{notFound ? "Evento não encontrado." : errorMessage(event.error)}</Alert>;
  }

  const types = ticketTypes.data ?? [];
  const totalQuantity = Object.values(cart).reduce((sum, n) => sum + n, 0);
  // Valor derivado: calculado na renderização, sem estado próprio.
  const totalCents = types.reduce((sum, t) => sum + (cart[t.id] ?? 0) * t.priceCents, 0);
  const started = new Date(event.data.startsAt).getTime() <= Date.now();

  return (
    <>
      <PageTitle>{event.data.title}</PageTitle>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Quando</dt>
              <dd>{formatDateTime(event.data.startsAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Onde</dt>
              <dd>
                {event.data.venue} · {event.data.city}
              </dd>
            </div>
          </dl>
          {event.data.description && (
            <p className="mt-4 whitespace-pre-line text-slate-700">{event.data.description}</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Ingressos</h2>
          {ticketTypes.isPending && <Loading />}
          {started && <Alert kind="info">As vendas deste evento estão encerradas.</Alert>}
          {!started && (
            <ul className="space-y-3">
              {types.map((type) => {
                const quantity = cart[type.id] ?? 0;
                const max = Math.min(type.available, MAX_PER_ORDER - (totalQuantity - quantity));
                return (
                  <li key={type.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{type.name}</p>
                      <p className="text-sm text-slate-600">
                        {formatMoney(type.priceCents)}
                        {type.available === 0 ? " · esgotado" : type.available <= 10 ? ` · restam ${type.available}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" aria-label={`Remover um ingresso ${type.name}`} disabled={quantity === 0} onClick={() => setQuantity(type.id, quantity - 1)}>
                        −
                      </Button>
                      <span aria-live="polite" className="w-6 text-center tabular-nums">
                        {quantity}
                      </span>
                      <Button variant="secondary" aria-label={`Adicionar um ingresso ${type.name}`} disabled={quantity >= max} onClick={() => setQuantity(type.id, quantity + 1)}>
                        +
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!started && types.length > 0 && (
            <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
              <p className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{totalQuantity === 0 ? "—" : formatMoney(totalCents)}</span>
              </p>
              {reserve.isError && <Alert>{errorMessage(reserve.error)}</Alert>}
              {user ? (
                <Button className="w-full" disabled={totalQuantity === 0} loading={reserve.isPending} onClick={() => reserve.mutate()}>
                  Reservar ingressos
                </Button>
              ) : (
                <Link to="/entrar" state={{ from: location.pathname }} className="block rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-700">
                  Entre para comprar
                </Link>
              )}
              <p className="text-xs text-slate-500">
                A reserva vale por 15 minutos. Máximo de {MAX_PER_ORDER} ingressos por pedido.
              </p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
