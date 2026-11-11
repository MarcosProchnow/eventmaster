import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router";
import { z } from "zod";
import { api, call, errorMessage, type Event } from "../../api/client";
import { formatMoney, isoToLocalInput, localInputToIso } from "../../shared/format";
import { Alert, Button, Card, Field, inputClass, Loading, PageTitle, StatusBadge } from "../../shared/ui";

const eventSchema = z
  .object({
    title: z.string().trim().min(3, "Mínimo de 3 caracteres").max(120),
    description: z.string().trim().max(5000),
    venue: z.string().trim().min(2, "Informe o local").max(120),
    city: z.string().trim().min(2, "Informe a cidade").max(80),
    startsAt: z.string().min(1, "Informe o início"),
    endsAt: z.string().min(1, "Informe o término"),
  })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt), {
    path: ["endsAt"],
    message: "O término deve ser depois do início",
  });
type EventForm = z.infer<typeof eventSchema>;

const toPayload = (v: EventForm) => ({
  ...v,
  startsAt: localInputToIso(v.startsAt),
  endsAt: localInputToIso(v.endsAt),
});

function EventFormCard({ event }: { event?: Event }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const locked = event?.status === "cancelled";
  const { register, handleSubmit, formState } = useForm<EventForm>({
    resolver: zodResolver(eventSchema),
    defaultValues: event
      ? { ...event, startsAt: isoToLocalInput(event.startsAt), endsAt: isoToLocalInput(event.endsAt) }
      : { description: "" },
  });

  const save = useMutation({
    mutationFn: (values: EventForm) =>
      event
        ? call(api.PATCH("/v1/events/{id}", { params: { path: { id: event.id } }, body: toPayload(values) }))
        : call(api.POST("/v1/events", { body: toPayload(values) })),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["organizer"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.setQueryData(["event", saved.id], saved);
      if (!event) navigate(`/organizador/eventos/${saved.id}`, { replace: true });
    },
  });
  const e = formState.errors;

  return (
    <Card>
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="space-y-4">
        {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
        {save.isSuccess && event && <Alert kind="success">Alterações salvas.</Alert>}
        <fieldset disabled={locked} className="space-y-4">
          <Field label="Título" error={e.title?.message} {...register("title")} />
          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium text-slate-700">
              Descrição
            </label>
            <textarea id="description" rows={4} className={inputClass} {...register("description")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Local" error={e.venue?.message} {...register("venue")} />
            <Field label="Cidade" error={e.city?.message} {...register("city")} />
            <Field label="Início" type="datetime-local" error={e.startsAt?.message} {...register("startsAt")} />
            <Field label="Término" type="datetime-local" error={e.endsAt?.message} {...register("endsAt")} />
          </div>
          <Button type="submit" loading={save.isPending}>
            {event ? "Salvar alterações" : "Criar rascunho"}
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}

const ticketSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60),
  price: z.coerce.number<number>("Informe o preço").min(0, "Preço inválido").max(1_000_000),
  quantity: z.coerce.number<number>("Informe a quantidade").int("Use um número inteiro").min(1, "Mínimo de 1"),
});
type TicketForm = z.infer<typeof ticketSchema>;

function TicketTypesCard({ event }: { event: Event }) {
  const queryClient = useQueryClient();
  const key = ["event", event.id, "ticket-types"];
  const types = useQuery({
    queryKey: key,
    queryFn: () => call(api.GET("/v1/events/{id}/ticket-types", { params: { path: { id: event.id } } })),
  });
  const { register, handleSubmit, reset, formState } = useForm<TicketForm>({
    resolver: zodResolver(ticketSchema),
  });
  const add = useMutation({
    mutationFn: (values: TicketForm) =>
      call(
        api.POST("/v1/events/{id}/ticket-types", {
          params: { path: { id: event.id } },
          // O formulário usa reais; a API, centavos inteiros.
          body: { name: values.name, priceCents: Math.round(values.price * 100), quantity: values.quantity },
        }),
      ),
    onSuccess: () => {
      reset();
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const e = formState.errors;

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Tipos de ingresso</h2>
      {types.isPending && <Loading />}
      {types.data?.length === 0 && (
        <p className="mb-3 text-sm text-slate-600">Adicione ao menos um tipo de ingresso para poder publicar.</p>
      )}
      {types.data && types.data.length > 0 && (
        <table className="mb-4 w-full text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th scope="col" className="py-1 font-medium">Nome</th>
              <th scope="col" className="py-1 font-medium">Preço</th>
              <th scope="col" className="py-1 font-medium">Vendidos / total</th>
            </tr>
          </thead>
          <tbody>
            {types.data.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="py-2">{t.name}</td>
                <td className="py-2">{formatMoney(t.priceCents)}</td>
                <td className="py-2 tabular-nums">
                  {t.quantity - t.available} / {t.quantity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {event.status !== "cancelled" && (
        <form onSubmit={handleSubmit((values) => add.mutate(values))} noValidate className="grid items-start gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Field label="Nome" placeholder="Ex.: Pista" error={e.name?.message} {...register("name")} />
          <Field label="Preço (R$)" type="number" step="0.01" min="0" error={e.price?.message} {...register("price")} />
          <Field label="Quantidade" type="number" min="1" error={e.quantity?.message} {...register("quantity")} />
          <Button type="submit" variant="secondary" loading={add.isPending} className="sm:mt-6">
            Adicionar
          </Button>
          {add.isError && (
            <div className="sm:col-span-4">
              <Alert>{errorMessage(add.error)}</Alert>
            </div>
          )}
        </form>
      )}
    </Card>
  );
}

function StatusCard({ event }: { event: Event }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (action: "publish" | "cancel") =>
      call(api.POST(`/v1/events/{id}/${action}`, { params: { path: { id: event.id } } })),
    onSuccess: (updated) => {
      queryClient.setQueryData(["event", updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["organizer"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  function cancel() {
    if (window.confirm("Cancelar o evento? Ele deixa de aparecer para o público e não pode ser reaberto.")) {
      change.mutate("cancel");
    }
  }

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Publicação</h2>
      {change.isError && (
        <div className="mb-3">
          <Alert>{errorMessage(change.error)}</Alert>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={event.status} />
        {event.status === "draft" && (
          <Button loading={change.isPending} onClick={() => change.mutate("publish")}>
            Publicar evento
          </Button>
        )}
        {event.status !== "cancelled" && (
          <Button variant="danger" disabled={change.isPending} onClick={cancel}>
            Cancelar evento
          </Button>
        )}
      </div>
    </Card>
  );
}

export function EventEditorPage() {
  const { id } = useParams();
  const event = useQuery({
    queryKey: ["event", id],
    queryFn: () => call(api.GET("/v1/events/{id}", { params: { path: { id: id! } } })),
    enabled: Boolean(id),
  });

  if (!id) {
    return (
      <>
        <PageTitle>Novo evento</PageTitle>
        <EventFormCard />
      </>
    );
  }
  if (event.isPending) return <Loading />;
  if (event.isError) return <Alert>{errorMessage(event.error)}</Alert>;

  return (
    <>
      <PageTitle>{event.data.title}</PageTitle>
      <div className="space-y-6">
        <StatusCard event={event.data} />
        {/* `key` recria o formulário quando o evento muda no servidor. */}
        <EventFormCard key={event.data.id} event={event.data} />
        <TicketTypesCard event={event.data} />
      </div>
    </>
  );
}
