import { SiGithub } from "@icons-pack/react-simple-icons";

interface PortalNavbarProps {
  onOpenDocs: () => void;
}

export function PortalNavbar({ onOpenDocs }: PortalNavbarProps) {
  return (
    <header className="navbar w-full border-b border-[var(--ae-border-subtle)] bg-[var(--ae-bg-surface)]/80 px-4 backdrop-blur-sm sm:px-6">
      <div className="flex-1">
        <span className="text-[length:var(--ae-text-base)] font-semibold tracking-tight text-[var(--ae-text-primary)]">
          Astro Earth
        </span>
      </div>
      <nav aria-label="Portal navigation" className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenDocs}
          className="btn btn-ghost btn-sm text-[length:var(--ae-text-sm)] font-medium text-[var(--ae-text-secondary)] hover:text-[var(--ae-text-primary)]"
        >
          Docs
        </button>
        <a
          href="https://github.com/daviddrdz/astro-sentinella"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          className="btn btn-ghost btn-sm btn-square text-[var(--ae-text-secondary)] hover:text-[var(--ae-text-primary)]"
        >
          <SiGithub size={18} aria-hidden="true" />
        </a>
      </nav>
    </header>
  );
}
