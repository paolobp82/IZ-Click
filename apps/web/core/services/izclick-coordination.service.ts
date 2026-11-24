/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type BusinessRole = "commercial" | "coordinator" | "producer" | "superadmin";
export type CoordinationProject = {
  project_id: string;
  project_name: string;
  project_identifier: string;
  commercial_id: string | null;
  producer_id: string | null;
  status: "pending" | "assigned";
  workflow_status: "active" | "completed" | "cancelled";
  client: string;
  start_date: string | null;
  due_date: string | null;
  quotation_url: string;
  version: number;
};
export type BusinessMember = { user_id: string; email: string; name: string; role: BusinessRole | null };
export type ProducerWorkload = {
  producer_id: string;
  producer_name: string;
  active_count: number;
  overdue_count: number;
  due_soon_count: number;
  projects: CoordinationProject[];
};
export type ProjectConversation = {
  comments: { id: string; body: string; created_by_id: string; created_at: string }[];
  assignments: {
    id: string;
    actor_id: string;
    previous_producer_id: string | null;
    new_producer_id: string;
    created_at: string;
  }[];
};

export type CoordinationTask = {
  id: string;
  project_id: string;
  name: string;
  identifier: string;
  project_name: string;
  state: string;
  closed: boolean;
  clients: string[];
  start_date: string | null;
  due_date: string | null;
  commercial_id: string | null;
  producer_id: string | null;
  status: "pending" | "assigned";
  version: number;
  url: string;
  history: {
    actor_id: string | null;
    previous_producer_id: string | null;
    new_producer_id: string | null;
    created_at: string;
  }[];
};
export type TaskWorkload = {
  producer_id: string;
  producer_name: string;
  active_count: number;
  overdue_count: number;
  due_soon_count: number;
  tasks: CoordinationTask[];
};

class CoordinationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  private path(slug: string) {
    return `/api/workspaces/${slug}/izclick`;
  }
  async tasks(slug: string): Promise<{ role: BusinessRole; current_user_id: string; tasks: CoordinationTask[] }> {
    return (await this.get(`${this.path(slug)}/tasks/`)).data;
  }
  async taskWorkload(slug: string): Promise<TaskWorkload[]> {
    return (await this.get(`${this.path(slug)}/tasks/workload/`)).data;
  }
  async assignTask(slug: string, task: CoordinationTask, producer_id: string) {
    return this.post(`${this.path(slug)}/tasks/${task.id}/assign/`, {
      producer_id,
      expected_version: task.version,
      expected_producer_id: task.producer_id,
    });
  }
  async access(
    slug: string
  ): Promise<{
    enabled: boolean;
    role: BusinessRole | null;
    business_role?: BusinessRole | null;
    current_user_id: string;
  }> {
    return (await this.get(`${this.path(slug)}/access/`)).data;
  }
  async createProject(slug: string, data: Record<string, string | null>): Promise<{ id: string }> {
    return (await this.post(`/api/workspaces/${slug}/projects/`, data)).data;
  }
  async projects(
    slug: string
  ): Promise<{ role: BusinessRole | null; current_user_id: string; projects: CoordinationProject[] }> {
    return (await this.get(`${this.path(slug)}/projects/`)).data;
  }
  async workload(slug: string): Promise<ProducerWorkload[]> {
    return (await this.get(`${this.path(slug)}/workload/`)).data;
  }
  async roles(slug: string): Promise<BusinessMember[]> {
    return (await this.get(`${this.path(slug)}/roles/`)).data;
  }
  async setRole(slug: string, user_id: string, role: string) {
    return this.patch(`${this.path(slug)}/roles/`, { user_id, role });
  }
  async assign(slug: string, project: CoordinationProject, producer_id: string) {
    return this.post(`${this.path(slug)}/projects/${project.project_id}/assign/`, {
      producer_id,
      expected_producer_id: project.producer_id,
      expected_version: project.version,
    });
  }
  async update(slug: string, project: CoordinationProject, data: Partial<CoordinationProject>) {
    return this.patch(`${this.path(slug)}/projects/${project.project_id}/`, { ...data, version: project.version });
  }
  async conversation(slug: string, id: string): Promise<ProjectConversation> {
    return (await this.get(`${this.path(slug)}/projects/${id}/comments/`)).data;
  }
  async comment(slug: string, id: string, body: string) {
    return this.post(`${this.path(slug)}/projects/${id}/comments/`, { body });
  }
}
export const coordinationService = new CoordinationService();
