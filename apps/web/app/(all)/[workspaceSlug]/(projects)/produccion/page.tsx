import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { ProductionWorkspacePanel } from "@/app/components/izclick/production-workspace-panel";
import type { Route } from "./+types/page";

export default function ProductionWorkspacePage({ params }: Route.ComponentProps) {
  return (
    <>
      <PageHead title="Producción | IZ-Click" />
      <AppHeader header={<div className="px-4 font-semibold">Producción · Vista consolidada</div>} />
      <ContentWrapper>
        <div className="h-full overflow-y-auto">
          <ProductionWorkspacePanel workspaceSlug={params.workspaceSlug} />
        </div>
      </ContentWrapper>
    </>
  );
}
