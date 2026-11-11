import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useLogout, useSession } from "../features/auth/session";

const navLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2 py-1 text-sm font-medium ${isActive ? "text-brand-700 underline" : "text-slate-700 hover:text-brand-700"}`;

export function Layout() {
  const { user, isLoading } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="text-lg font-bold tracking-tight text-brand-700">
            EventMaster
          </Link>
          <nav aria-label="Principal" className="flex flex-wrap items-center gap-2">
            <NavLink to="/" end className={navLink}>
              Eventos
            </NavLink>
            {user && (
              <NavLink to="/pedidos" className={navLink}>
                Meus pedidos
              </NavLink>
            )}
            {user && user.role !== "attendee" && (
              <NavLink to="/organizador" className={navLink}>
                Organizador
              </NavLink>
            )}
            {/* Enquanto a sessão carrega, não mostra "Entrar" para quem já está logado. */}
            {isLoading ? null : user ? (
              <>
                <span className="ml-2 text-sm text-slate-500">{user.name}</span>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm font-medium text-slate-700 hover:text-brand-700"
                  onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/") })}
                >
                  Sair
                </button>
              </>
            ) : (
              <NavLink to="/entrar" className={navLink}>
                Entrar
              </NavLink>
            )}
          </nav>
        </div>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        EventMaster · projeto de estudo. Pagamentos em ambiente de testes.
      </footer>
    </div>
  );
}
