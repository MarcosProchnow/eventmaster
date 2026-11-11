import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";
import { ApiError } from "../api/client";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { RequireAuth } from "../features/auth/RequireAuth";
import { EventDetailPage } from "../features/events/EventDetailPage";
import { EventsPage } from "../features/events/EventsPage";
import { OrderPage } from "../features/orders/OrderPage";
import { OrdersPage } from "../features/orders/OrdersPage";
import { EventEditorPage } from "../features/organizer/EventEditorPage";
import { OrganizerPage } from "../features/organizer/OrganizerPage";
import { Alert } from "../shared/ui";
import { Layout } from "./Layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Erros 4xx são respostas definitivas da API; só falhas de rede/5xx valem nova tentativa.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<EventsPage />} />
            <Route path="eventos/:id" element={<EventDetailPage />} />
            <Route path="entrar" element={<LoginPage />} />
            <Route path="cadastro" element={<RegisterPage />} />
            <Route path="pedidos" element={<RequireAuth><OrdersPage /></RequireAuth>} />
            <Route path="pedidos/:id" element={<RequireAuth><OrderPage /></RequireAuth>} />
            <Route path="organizador" element={<RequireAuth organizer><OrganizerPage /></RequireAuth>} />
            <Route path="organizador/eventos/novo" element={<RequireAuth organizer><EventEditorPage /></RequireAuth>} />
            <Route path="organizador/eventos/:id" element={<RequireAuth organizer><EventEditorPage /></RequireAuth>} />
            <Route path="*" element={<Alert kind="info">Página não encontrada.</Alert>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
