import { useCallback, useState } from "react";
import { DocsModal } from "./components/DocsModal";
import { ExplorerView } from "./components/explorer/ExplorerView";
import { PortalNavbar } from "./components/PortalNavbar";
import { PortalSpaceBackdrop } from "./components/PortalSpaceBackdrop";
import { QueryPortalCard } from "./components/QueryPortalCard";
import type { QueryParams } from "./types/portal";

export default function App() {
  const [activeQuery, setActiveQuery] = useState<QueryParams | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [portalCoords, setPortalCoords] = useState({
    ra: "",
    dec: "",
    fieldSizeDeg: "",
  });

  const handleCoordinatesChange = useCallback(
    (ra: string, dec: string, fieldSizeDeg: string) => {
      setPortalCoords({ ra, dec, fieldSizeDeg });
    },
    []
  );

  if (activeQuery) {
    return (
      <ExplorerView
        query={activeQuery}
        onBackToPortal={() => setActiveQuery(null)}
      />
    );
  }

  return (
    <div className="ae-portal-backdrop relative flex min-h-screen flex-col overflow-hidden">
      <PortalSpaceBackdrop
        ra={portalCoords.ra}
        dec={portalCoords.dec}
        fieldSizeDeg={portalCoords.fieldSizeDeg}
      />
      <div className="relative z-10 flex min-h-screen flex-col">
        <PortalNavbar onOpenDocs={() => setDocsOpen(true)} />
        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
          <QueryPortalCard
            onSubmitQuery={setActiveQuery}
            onCoordinatesChange={handleCoordinatesChange}
          />
        </main>
      </div>
      <DocsModal open={docsOpen} onClose={() => setDocsOpen(false)} />
    </div>
  );
}
