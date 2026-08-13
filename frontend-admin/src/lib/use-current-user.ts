import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { type CurrentUser, useAuthStore } from "@/lib/auth-store"

export function useCurrentUser() {
  const accessToken = useAuthStore((s) => s.accessToken)
  const setUser = useAuthStore((s) => s.setUser)

  return useQuery({
    queryKey: ["me"],
    enabled: !!accessToken,
    queryFn: async () => {
      const { data } = await api.get<CurrentUser>("/auth/me/")
      setUser(data)
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}
