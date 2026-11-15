import { useState } from "react";
import { DocsModal } from "./components/DocsModal";
import { ExplorerPlaceholder } from "./components/ExplorerPlaceholder";
import { PortalNavbar } from "./components/PortalNavbar";
import { QueryPortalCard } from "./components/QueryPortalCard";
import type { QueryParams } from "./types/portal";

export default function App() {
  const [activeQuery, setActiveQuery] = useState<QueryParams | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);

  if (activeQuery) {
    return (
      <ExplorerPlaceholder
        query={activeQuery}
        onBackToPortal={() => setActiveQuery(null)}
      />
    );
  }

  return (
    <div className="ae-portal-backdrop flex min-h-screen flex-col">
      <PortalNavbar onOpenDocs={() => setDocsOpen(true)} />
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <QueryPortalCard onSubmitQuery={setActiveQuery} />
      </main>
      <DocsModal open={docsOpen} onClose={() => setDocsOpen(false)} />
    </div>
  );
}
