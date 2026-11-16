import useSWR from "swr";
import { coordinationService } from "@/services/izclick-coordination.service";

export function useIzclickAccess(slug: string | undefined) {
  const { data } = useSWR(slug ? ["izclick-access", slug] : null, () => coordinationService.access(slug!), {
    shouldRetryOnError: false,
  });
  return {
    enabled: data?.enabled === true,
    role: data?.role,
    canCreate: data?.role === "commercial" || data?.role === "coordinator" || data?.role === "superadmin",
    canReadAgency: !!data?.role,
  };
}
