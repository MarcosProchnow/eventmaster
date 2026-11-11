import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Alert, Loading } from "../../shared/ui";
import { useSession } from "./session";

/**
 * Rota protegida. É só conveniência de navegação: quem decide o que cada
 * usuário pode fazer é a API.
 */
export function RequireAuth({ children, organizer }: { children: ReactNode; organizer?: boolean }) {
  const { user, isLoading } = useSession();
  const location = useLocation();
  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (organizer && user.role === "attendee") {
    return <Alert kind="info">Esta área é para organizadores de eventos.</Alert>;
  }
  return children;
}
