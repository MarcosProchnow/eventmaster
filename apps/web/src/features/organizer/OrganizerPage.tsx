import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api, call, errorMessage } from "../../api/client";
import { formatShortDateTime } from "../../shared/format";
import { Alert, Card, Loading, PageTitle, StatusBadge } from "../../shared/ui";

const linkButton =
  "inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700";

export function OrganizerPage() {
  const events = useQuery({
    queryKey: ["organizer", "events"],
    queryFn: () => call(api.GET("/v1/organizer/events")),
  });

  return (
    <>
      <PageTitle action={<Link to="/organizador/eventos/novo" className={linkButton}>Novo evento</Link>}>
        Meus eventos
      </PageTitle>
      {events.isPending && <Loading />}
      {events.isError && <Alert>{errorMessage(events.error)}</Alert>}
      {events.data?.length === 0 && <Alert kind="info">Você ainda não criou nenhum evento.</Alert>}
      <ul className="space-y-3">
        {events.data?.map((event) => (
          <li key={event.id}>
            <Link to={`/organizador/eventos/${event.id}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-brand-600">
              <Card className="flex flex-wrap items-center justify-between gap-3 transition hover:border-brand-600">
                <div>
                  <p className="font-medium">{event.title}</p>
                  <p className="text-sm text-slate-500">
                    {formatShortDateTime(event.startsAt)} · {event.city}
                  </p>
                </div>
                <StatusBadge status={event.status} />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
