import type {
  BandChannelId,
  ChannelTintId,
  ExplorerFrame,
  ExplorerLocale,
  ExplorerToolId,
  TimelineFilterTab,
} from "../types/explorer";

export const EXPLORER_CONFIG = {
  framesEndpoint: "/api/frames",
  defaultArcminPerDeg: 60,
  defaultScaleArcmin: 5,
  playbackIntervalMs: 1200,
  opacityMin: 0,
  opacityMax: 100,
  opacityStep: 1,
  defaultNewLayerOpacity: 80,
  zoomMin: 0.5,
  zoomMax: 4,
  zoomStep: 0.25,
  zoomDefault: 1,
  indexStep: 1,
  firstIndex: 0,
  maxUndoHistory: 30,
  progressInitialPct: 15,
  progressMaxPendingPct: 90,
  progressStepPct: 12,
  progressTickMs: 350,
  progressCompletePct: 100,
  iconSizeSm: 14,
  iconSizeMd: 16,
  iconSizeLg: 18,
} as const;

export interface ToolOption {
  id: ExplorerToolId;
  mobileVisible: boolean;
  label: Record<ExplorerLocale, string>;
}

export const EXPLORER_TOOLS: readonly ToolOption[] = [
  { id: "hand", mobileVisible: true, label: { en: "Pan", es: "Mover" } },
  { id: "zoom", mobileVisible: true, label: { en: "Zoom", es: "Zoom" } },
  { id: "split", mobileVisible: true, label: { en: "Split", es: "Dividir" } },
  {
    id: "subtract",
    mobileVisible: true,
    label: { en: "Subtract", es: "Restar" },
  },
  { id: "region", mobileVisible: false, label: { en: "Region", es: "Región" } },
  { id: "ruler", mobileVisible: false, label: { en: "Ruler", es: "Regla" } },
  {
    id: "reset",
    mobileVisible: false,
    label: { en: "Reset", es: "Reiniciar" },
  },
];

export interface BandChannelOption {
  id: BandChannelId;
  label: string;
}

export const BAND_CHANNELS: readonly BandChannelOption[] = [
  { id: "Band 1", label: "Band 1 (0.75 – 1.10 µm) — Optical / Near-IR" },
  { id: "Band 2", label: "Band 2 (1.10 – 1.58 µm) — Near-Infrared" },
  { id: "Band 3", label: "Band 3 (1.58 – 2.14 µm) — Near-Infrared" },
  { id: "Band 4", label: "Band 4 (2.14 – 2.82 µm) — Mid-Near Infrared" },
  { id: "Band 5", label: "Band 5 (2.82 – 3.80 µm) — Infrared" },
  { id: "Band 6", label: "Band 6 (3.80 – 5.00 µm) — Deep Infrared" },
];

export interface ChannelTintOption {
  id: ChannelTintId;
  label: Record<ExplorerLocale, string>;
  hex: string;
}

export const CHANNEL_TINTS: readonly ChannelTintOption[] = [
  { id: "grey", label: { en: "grey", es: "grey" }, hex: "#808080" },
  { id: "viridis", label: { en: "viridis", es: "viridis" }, hex: "#35B779" },
  { id: "magma", label: { en: "magma", es: "magma" }, hex: "#B73779" },
  { id: "inferno", label: { en: "inferno", es: "inferno" }, hex: "#F1602F" },
  { id: "cividis", label: { en: "cividis", es: "cividis" }, hex: "#C8B84A" },
  { id: "cubehelix", label: { en: "cubehelix", es: "cubehelix" }, hex: "#8C6BB1" },
];

export interface TimelineTabOption {
  id: TimelineFilterTab;
  label: Record<ExplorerLocale, string>;
}

export const TIMELINE_TABS: readonly TimelineTabOption[] = [
  { id: "all", label: { en: "All", es: "Todos" } },
  { id: "visible", label: { en: "Visible", es: "Visibles" } },
  { id: "filtered", label: { en: "Filtered", es: "Filtrados" } },
];

export const EXPLORER_COPY: Record<
  ExplorerLocale,
  {
    backToPortal: string;
    docs: string;
    github: string;
    bandChannel: string;
    channelTint: string;
    timeline: string;
    bandAll: string;
    play: string;
    pause: string;
    stepBack: string;
    stepForward: string;
    undo: string;
    redo: string;
    noFrames: string;
    close: string;
    loadingFrame: string;
    frameUnavailable: string;
    retryFrame: string;
  }
> = {
  en: {
    backToPortal: "Back to Portal",
    docs: "Docs",
    github: "GitHub",
    bandChannel: "Detectors",
    channelTint: "Channel Tint",
    timeline: "Timeline",
    bandAll: "Detectors: All",
    play: "Play",
    pause: "Pause",
    stepBack: "Previous frame",
    stepForward: "Next frame",
    undo: "Undo",
    redo: "Redo",
    noFrames: "No frames match the selected filter.",
    close: "Close",
    loadingFrame: "Loading SPHEREx cutout...",
    frameUnavailable:
      "Frame unavailable or rate-limited. Wait a moment and retry.",
    retryFrame: "Retry",
  },
  es: {
    backToPortal: "Volver al Portal",
    docs: "Docs",
    github: "GitHub",
    bandChannel: "Detectores",
    channelTint: "Tinte de canal",
    timeline: "Línea de tiempo",
    bandAll: "Detectores: Todos",
    play: "Reproducir",
    pause: "Pausar",
    stepBack: "Fotograma anterior",
    stepForward: "Fotograma siguiente",
    undo: "Deshacer",
    redo: "Rehacer",
    noFrames: "Ningún fotograma coincide con el filtro.",
    close: "Cerrar",
    loadingFrame: "Cargando recorte SPHEREx...",
    frameUnavailable:
      "Fotograma no disponible o límite de peticiones alcanzado.",
    retryFrame: "Reintentar",
  },
};

export const DEFAULT_EXPLORER_FRAMES: readonly ExplorerFrame[] = [
  {
    id: "f-1810",
    timestamp: "18:10Z",
    band: "Band 1",
    filtered: false,
    visible: false,
  },
  {
    id: "f-1820",
    timestamp: "18:20Z",
    band: "Band 2",
    filtered: false,
    visible: true,
  },
  {
    id: "f-1830",
    timestamp: "18:30Z",
    band: "Band 3",
    filtered: false,
    visible: true,
  },
  {
    id: "f-1840",
    timestamp: "18:40Z",
    band: "Band 4",
    filtered: false,
    visible: true,
  },
  {
    id: "f-1850",
    timestamp: "18:50Z",
    band: "Band 5",
    filtered: true,
    visible: true,
  },
  {
    id: "f-1900",
    timestamp: "19:00Z",
    band: "Band 3",
    filtered: false,
    visible: true,
  },
  {
    id: "f-1910",
    timestamp: "19:10Z",
    band: "Band 2",
    filtered: false,
    visible: true,
  },
  {
    id: "f-1920",
    timestamp: "19:20Z",
    band: "Band 6",
    filtered: false,
    visible: true,
  },
];
