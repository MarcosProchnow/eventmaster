import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { api, call, errorMessage } from "../../api/client";
import { formatDateTime } from "../../shared/format";
import { Alert, Button, Card, inputClass, Loading, PageTitle } from "../../shared/ui";

const PAGE_SIZE = 9;

export function EventsPage() {
  // Busca, cidade e página ficam na URL: o resultado pode ser compartilhado e o "voltar" funciona.
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const city = params.get("cidade") ?? "";
  const page = Math.max(1, Number(params.get("pagina")) || 1);

  const events = useQuery({
    queryKey: ["events", { q, city, page }],
    queryFn: () =>
      call(
        api.GET("/v1/events", {
          params: {
            query: { page, pageSize: PAGE_SIZE, ...(q && { q }), ...(city.length >= 2 && { city }) },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    const nextQ = String(form.get("q") ?? "").trim();
    const nextCity = String(form.get("cidade") ?? "").trim();
    if (nextQ) next.set("q", nextQ);
    if (nextCity) next.set("cidade", nextCity);
    setParams(next);
  }

  const goTo = (target: number) => {
    const next = new URLSearchParams(params);
    next.set("pagina", String(target));
    setParams(next);
  };

  const totalPages = events.data ? Math.max(1, Math.ceil(events.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageTitle>Eventos</PageTitle>
      <form onSubmit={onSearch} role="search" className="mb-6 flex flex-wrap gap-3">
        <input name="q" defaultValue={q} placeholder="Buscar por nome" aria-label="Buscar por nome" className={`${inputClass} max-w-xs`} />
        <input name="cidade" defaultValue={city} placeholder="Cidade" aria-label="Cidade" className={`${inputClass} max-w-48`} />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {events.isPending && <Loading />}
      {events.isError && <Alert>{errorMessage(events.error)}</Alert>}
      {events.data && events.data.items.length === 0 && (
        <Alert kind="info">Nenhum evento encontrado{q || city ? " para esta busca" : ""}.</Alert>
      )}

      {events.data && events.data.items.length > 0 && (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.data.items.map((event) => (
              <li key={event.id}>
                <Link to={`/eventos/${event.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-brand-600">
                  <Card className="h-full transition hover:border-brand-600">
                    <h2 className="text-lg font-semibold">{event.title}</h2>
                    <p className="mt-2 text-sm text-slate-600">{formatDateTime(event.startsAt)}</p>
                    <p className="text-sm text-slate-600">
                      {event.venue} · {event.city}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <nav aria-label="Paginação" className="mt-6 flex items-center justify-center gap-4 text-sm">
              <Button variant="secondary" disabled={page <= 1} onClick={() => goTo(page - 1)}>
                Anterior
              </Button>
              <span>
                Página {page} de {totalPages}
              </span>
              <Button variant="secondary" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>
                Próxima
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
