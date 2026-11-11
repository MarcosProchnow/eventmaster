import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";
import { z } from "zod";
import { errorMessage } from "../../api/client";
import { Alert, Button, Card, Field, PageTitle } from "../../shared/ui";
import { useRegister } from "./session";

// Mesmas regras da API; a API valida de novo, o front só antecipa o erro.
const schema = z.object({
  name: z.string().trim().min(2, "Informe seu nome"),
  email: z.email("Informe um e-mail válido"),
  password: z.string().min(10, "A senha deve ter ao menos 10 caracteres").max(128),
  role: z.enum(["attendee", "organizer"]),
});
type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const signUp = useRegister();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: "attendee" },
  });

  const onSubmit = handleSubmit((values) =>
    signUp.mutate(values, {
      onSuccess: (user) => navigate(user.role === "organizer" ? "/organizador" : from, { replace: true }),
    }),
  );

  return (
    <div className="mx-auto max-w-sm">
      <PageTitle>Criar conta</PageTitle>
      <Card>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {signUp.isError && <Alert>{errorMessage(signUp.error)}</Alert>}
          <Field label="Nome" autoComplete="name" error={formState.errors.name?.message} {...register("name")} />
          <Field label="E-mail" type="email" autoComplete="email" error={formState.errors.email?.message} {...register("email")} />
          <Field label="Senha (mínimo de 10 caracteres)" type="password" autoComplete="new-password" error={formState.errors.password?.message} {...register("password")} />
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">Quero</legend>
            <div className="space-y-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" value="attendee" {...register("role")} /> Comprar ingressos
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" value="organizer" {...register("role")} /> Organizar eventos
              </label>
            </div>
          </fieldset>
          <Button type="submit" loading={signUp.isPending} className="w-full">
            Criar conta
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        Já tem conta?{" "}
        <Link to="/entrar" state={{ from }} className="font-medium text-brand-700 underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
