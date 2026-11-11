import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";
import { z } from "zod";
import { errorMessage } from "../../api/client";
import { Alert, Button, Card, Field, PageTitle } from "../../shared/ui";
import { useLogin } from "./session";

const schema = z.object({
  email: z.email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha"),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(from, { replace: true }) }),
  );

  return (
    <div className="mx-auto max-w-sm">
      <PageTitle>Entrar</PageTitle>
      <Card>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {login.isError && <Alert>{errorMessage(login.error)}</Alert>}
          <Field label="E-mail" type="email" autoComplete="email" error={formState.errors.email?.message} {...register("email")} />
          <Field label="Senha" type="password" autoComplete="current-password" error={formState.errors.password?.message} {...register("password")} />
          <Button type="submit" loading={login.isPending} className="w-full">
            Entrar
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        Ainda não tem conta?{" "}
        <Link to="/cadastro" state={{ from }} className="font-medium text-brand-700 underline">
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}
