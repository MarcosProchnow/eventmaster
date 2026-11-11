import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, call, type User } from "../../api/client";

const SESSION_KEY = ["session"] as const;

/**
 * Quem está logado. Os tokens ficam em cookies httpOnly, que o JavaScript não
 * lê; o front só pergunta à API "quem sou eu" (`GET /v1/me`).
 */
export function useSession() {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: async (): Promise<User | null> => {
      try {
        return await call(api.GET("/v1/me"));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { user: query.data ?? null, isLoading: query.isPending };
}

/** Ao trocar de usuário, descarta tudo o que estava em cache do usuário anterior. */
function useSessionChange() {
  const queryClient = useQueryClient();
  return (user: User | null) => {
    queryClient.clear();
    queryClient.setQueryData(SESSION_KEY, user);
  };
}

export function useLogin() {
  const onChange = useSessionChange();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      call(api.POST("/v1/auth/login", { body })),
    onSuccess: onChange,
  });
}

export function useRegister() {
  const onChange = useSessionChange();
  return useMutation({
    mutationFn: (body: {
      name: string;
      email: string;
      password: string;
      role: "attendee" | "organizer";
    }) => call(api.POST("/v1/auth/register", { body })),
    onSuccess: onChange,
  });
}

export function useLogout() {
  const onChange = useSessionChange();
  return useMutation({
    mutationFn: () => call(api.POST("/v1/auth/logout")),
    onSettled: () => onChange(null),
  });
}
