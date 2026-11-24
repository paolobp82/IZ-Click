/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { coordinationService } from "@/services/izclick-coordination.service";

export function useIzclickAccess(slug: string | undefined) {
  const { data } = useSWR(slug ? ["izclick-access", slug] : null, () => coordinationService.access(slug!), {
    shouldRetryOnError: false,
  });
  return {
    enabled: data?.enabled === true,
    role: data?.role,
    isCommercial: (data?.business_role ?? data?.role) === "commercial",
    canCreate: data?.role === "commercial" || data?.role === "coordinator" || data?.role === "superadmin",
    canReadAgency: !!data?.role,
  };
}
