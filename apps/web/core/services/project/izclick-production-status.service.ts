import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type WorkspaceProductionStatus = {
  id: string;
  name: string;
  color: string;
  group: "backlog" | "unstarted" | "started" | "completed" | "cancelled";
  sequence: number;
  project_count: number;
  is_active: boolean;
  origin: "catalogue" | "plane";
};
export type StatusValues = Pick<WorkspaceProductionStatus, "name" | "color" | "group" | "sequence">;

/** Native Plane session/CSRF. No second authentication or database. */
export class ProductionStatusesService extends APIService {
  constructor() { super(API_BASE_URL); }
  private endpoint(slug: string) {
    return `/api/workspaces/${encodeURIComponent(slug)}/izclick-production-statuses/`;
  }
  async list(slug: string): Promise<WorkspaceProductionStatus[]> {
    return this.get(this.endpoint(slug)).then((result) => result.data);
  }
  async create(slug: string, data: StatusValues): Promise<WorkspaceProductionStatus> {
    return this.post(this.endpoint(slug), data).then((result) => result.data);
  }
  async remove(slug: string, id: string, replacementId: string): Promise<void> {
    await this.delete(`${this.endpoint(slug)}${encodeURIComponent(id)}/?replacement_id=${encodeURIComponent(replacementId)}`);
  }
  async update(slug: string, id: string, data: StatusValues): Promise<WorkspaceProductionStatus> {
    return this.patch(`${this.endpoint(slug)}${encodeURIComponent(id)}/`, data).then((result) => result.data);
  }
}
