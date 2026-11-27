/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
import { useSearchParams } from "react-router";
import ProjectWorkloadPanel from "@/components/izclick/project-workload-panel";
import TaskCoordinationPanel from "@/components/izclick/task-coordination-panel";
import ProjectCoordinationPanel from "@/components/izclick/project-coordination-panel";

export default function CoordinationPage() {
  const [params] = useSearchParams();
  if (params.has("workload_project")) return <ProjectWorkloadPanel />;
  return params.get("project") ? <ProjectCoordinationPanel /> : <TaskCoordinationPanel />;
}
