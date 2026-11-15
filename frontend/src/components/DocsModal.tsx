import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface DocsModalProps {
  open: boolean;
  onClose: () => void;
}

export function DocsModal({ open, onClose }: DocsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="docs-modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
      className="modal"
    >
      <div className="modal-box border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)] text-[var(--ae-text-primary)]">
        <div className="flex items-center justify-between gap-4">
          <h2
            id="docs-modal-title"
            className="text-[length:var(--ae-text-xl)] font-semibold"
          >
            Documentation
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close documentation"
            className="btn btn-ghost btn-sm btn-square"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 text-[length:var(--ae-text-base)] text-[var(--ae-text-secondary)]">
          <p>
            Enter sky coordinates (RA in HMS or degrees | Dec in DMS or
            degrees), field size in degrees, and observation date to inspect
            available frames in Explorer.
          </p>
          <div className="rounded-md border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-elevated)] p-3 font-mono text-[length:var(--ae-text-sm)]">
            RA: 05h 35m 17s | Dec: -05° 23&apos; 28&quot; | Field: 0.5 deg |
            Date: 2026-10-12
          </div>
        </div>
      </div>
    </dialog>
  );
}
