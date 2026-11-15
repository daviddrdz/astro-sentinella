import {
  Columns2,
  Diff,
  Hand,
  RotateCcw,
  Ruler,
  SquareDashed,
  ZoomIn,
} from "lucide-react";
import {
  CHANNEL_TINTS,
  EXPLORER_CONFIG,
  EXPLORER_COPY,
  EXPLORER_TOOLS,
} from "../../config/explorer";
import type {
  ChannelTintId,
  ExplorerLocale,
  ExplorerToolId,
} from "../../types/explorer";

interface ExplorerToolbarProps {
  activeTool: ExplorerToolId;
  locale: ExplorerLocale;
  onSelectTool: (tool: ExplorerToolId) => void;
  channelTint: ChannelTintId;
  onChangeChannelTint: (tint: ChannelTintId) => void;
}

function ToolIcon({ id }: { id: ExplorerToolId }) {
  const size = EXPLORER_CONFIG.iconSizeLg;
  switch (id) {
    case "hand":
      return <Hand size={size} aria-hidden="true" />;
    case "zoom":
      return <ZoomIn size={size} aria-hidden="true" />;
    case "split":
      return <Columns2 size={size} aria-hidden="true" />;
    case "subtract":
      return <Diff size={size} aria-hidden="true" />;
    case "region":
      return <SquareDashed size={size} aria-hidden="true" />;
    case "ruler":
      return <Ruler size={size} aria-hidden="true" />;
    case "reset":
      return <RotateCcw size={size} aria-hidden="true" />;
  }
}

export function ExplorerToolbar({
  activeTool,
  locale,
  onSelectTool,
  channelTint,
  onChangeChannelTint,
}: ExplorerToolbarProps) {
  const mobileTools = EXPLORER_TOOLS.filter((tool) => tool.mobileVisible);
  const copy = EXPLORER_COPY[locale];

  const tintSelect = (
    <label className="flex flex-col gap-1 text-[10px] font-medium text-[var(--ae-text-muted)]">
      <span>{copy.channelTint}</span>
      <select
        aria-label={copy.channelTint}
        value={channelTint}
        onChange={(event) =>
          onChangeChannelTint(event.target.value as ChannelTintId)
        }
        className="select select-bordered select-xs w-28 bg-[var(--ae-bg-base)] px-1 text-[10px] text-[var(--ae-text-primary)]"
      >
        {CHANNEL_TINTS.map((tint) => (
          <option key={tint.id} value={tint.id}>
            {tint.label[locale]}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      {/* Desktop vertical tool rail */}
      <aside
        aria-label="Canvas tools"
        className="hidden w-14 shrink-0 flex-col items-center gap-1.5 border-r border-[var(--ae-border-subtle)] bg-[var(--ae-bg-base)] py-3 md:flex"
      >
        {EXPLORER_TOOLS.map((tool) => {
          const isActive = activeTool === tool.id;
          const label = tool.label[locale];
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelectTool(tool.id)}
              aria-label={label}
              aria-pressed={isActive}
              title={label}
              className={`btn btn-square h-10 w-10 border transition-colors ${
                isActive
                  ? "border-[var(--ae-primary)] bg-[var(--ae-primary)]/15 text-[var(--ae-primary)]"
                  : "border-transparent bg-transparent text-[var(--ae-text-muted)] hover:bg-[var(--ae-bg-elevated)] hover:text-[var(--ae-text-primary)]"
              }`}
            >
              <ToolIcon id={tool.id} />
            </button>
          );
        })}
        {tintSelect}
      </aside>

      {/* Mobile compact tool dock */}
      <nav
        aria-label="Mobile canvas tools"
        className="fixed bottom-[124px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-[var(--ae-border-subtle)] bg-[var(--ae-bg-base)]/95 p-1.5 shadow-xl backdrop-blur md:hidden"
      >
        {mobileTools.map((tool) => {
          const isActive = activeTool === tool.id;
          const label = tool.label[locale];
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelectTool(tool.id)}
              aria-label={label}
              aria-pressed={isActive}
              title={label}
              className={`btn btn-square h-9 w-9 border transition-colors ${
                isActive
                  ? "border-[var(--ae-primary)] bg-[var(--ae-primary)]/15 text-[var(--ae-primary)]"
                  : "border-transparent bg-transparent text-[var(--ae-text-muted)]"
              }`}
            >
              <ToolIcon id={tool.id} />
            </button>
          );
        })}
        {tintSelect}
      </nav>
    </>
  );
}
