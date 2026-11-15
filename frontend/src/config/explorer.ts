import type {
  BandChannelId,
  BlendMode,
  ChannelTintId,
  ExplorerFrame,
  ExplorerLayer,
  ExplorerLocale,
  ExplorerToolId,
  LayerFilterId,
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

export const BLEND_MODES: readonly BlendMode[] = [
  "Normal",
  "Subtract",
  "Screen",
  "Add",
];

export interface BandChannelOption {
  id: BandChannelId;
  label: string;
}

export const BAND_CHANNELS: readonly BandChannelOption[] = [
  { id: "Ha", label: "H-alpha 656nm" },
  { id: "OIII", label: "OIII 501nm" },
  { id: "IR", label: "Infrared 850nm" },
  { id: "UV", label: "Ultraviolet 280nm" },
  { id: "BB", label: "Broadband RGB" },
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

export interface LayerFilterOption {
  id: LayerFilterId;
  label: Record<ExplorerLocale, string>;
}

export const LAYER_FILTERS: readonly LayerFilterOption[] = [
  { id: "stretch", label: { en: "Stretch", es: "Estirar" } },
  { id: "contrast", label: { en: "Contrast", es: "Contraste" } },
  { id: "invert", label: { en: "Invert", es: "Invertir" } },
  { id: "edges", label: { en: "Edges", es: "Bordes" } },
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
    mergeExport: string;
    docs: string;
    github: string;
    layers: string;
    addLayer: string;
    blendMode: string;
    bandChannel: string;
    channelTint: string;
    opacity: string;
    filters: string;
    mergeVisible: string;
    timeline: string;
    bandAll: string;
    bandPrefix: string;
    play: string;
    pause: string;
    stepBack: string;
    stepForward: string;
    undo: string;
    redo: string;
    noFrames: string;
    noLayers: string;
    toggleVisibility: string;
    close: string;
    loadingFrame: string;
    frameUnavailable: string;
    retryFrame: string;
  }
> = {
  en: {
    backToPortal: "Back to Portal",
    mergeExport: "Merge / Export",
    docs: "Docs",
    github: "GitHub",
    layers: "Layers",
    addLayer: "+ Add",
    blendMode: "Blend Mode",
    bandChannel: "Band / Channel",
    channelTint: "Channel Tint",
    opacity: "Opacity",
    filters: "Filters",
    mergeVisible: "Merge Visible",
    timeline: "Timeline",
    bandAll: "Band: All",
    bandPrefix: "Band:",
    play: "Play",
    pause: "Pause",
    stepBack: "Previous frame",
    stepForward: "Next frame",
    undo: "Undo",
    redo: "Redo",
    noFrames: "No frames match the selected filter.",
    noLayers: "No layers loaded.",
    toggleVisibility: "Toggle layer visibility",
    close: "Close",
    loadingFrame: "Loading SPHEREx cutout...",
    frameUnavailable:
      "Frame unavailable or rate-limited. Wait a moment and retry.",
    retryFrame: "Retry",
  },
  es: {
    backToPortal: "Volver al Portal",
    mergeExport: "Combinar / Exportar",
    docs: "Docs",
    github: "GitHub",
    layers: "Capas",
    addLayer: "+ Añadir",
    blendMode: "Modo de mezcla",
    bandChannel: "Banda / Canal",
    channelTint: "Tinte de canal",
    opacity: "Opacidad",
    filters: "Filtros",
    mergeVisible: "Combinar visibles",
    timeline: "Línea de tiempo",
    bandAll: "Banda: Todas",
    bandPrefix: "Banda:",
    play: "Reproducir",
    pause: "Pausar",
    stepBack: "Fotograma anterior",
    stepForward: "Fotograma siguiente",
    undo: "Deshacer",
    redo: "Rehacer",
    noFrames: "Ningún fotograma coincide con el filtro.",
    noLayers: "No hay capas cargadas.",
    toggleVisibility: "Alternar visibilidad de capa",
    close: "Cerrar",
    loadingFrame: "Cargando recorte SPHEREx...",
    frameUnavailable:
      "Fotograma no disponible o límite de peticiones alcanzado.",
    retryFrame: "Reintentar",
  },
};

export const DEFAULT_EXPLORER_LAYERS: readonly ExplorerLayer[] = [
  {
    id: "frm-04",
    code: "FRM-04",
    band: "Ha",
    blendMode: "Normal",
    opacity: 100,
    visible: true,
    tint: "grey",
    filters: { stretch: false, contrast: false, invert: false, edges: false },
  },
  {
    id: "frm-03",
    code: "FRM-03",
    band: "OIII",
    blendMode: "Screen",
    opacity: 100,
    visible: false,
    tint: "viridis",
    filters: { stretch: false, contrast: false, invert: false, edges: false },
  },
  {
    id: "frm-02",
    code: "FRM-02",
    band: "IR",
    blendMode: "Normal",
    opacity: 70,
    visible: false,
    tint: "inferno",
    filters: { stretch: false, contrast: true, invert: false, edges: false },
  },
  {
    id: "frm-01",
    code: "FRM-01",
    band: "UV",
    blendMode: "Normal",
    opacity: 0,
    visible: false,
    tint: "cubehelix",
    filters: { stretch: false, contrast: false, invert: false, edges: false },
  },
];

export const DEFAULT_EXPLORER_FRAMES: readonly ExplorerFrame[] = [
  {
    id: "f-1810",
    timestamp: "18:10Z",
    band: "UV",
    filtered: false,
    visible: false,
  },
  {
    id: "f-1820",
    timestamp: "18:20Z",
    band: "IR",
    filtered: false,
    visible: true,
  },
  {
    id: "f-1830",
    timestamp: "18:30Z",
    band: "OIII",
    filtered: false,
    visible: true,
  },
  {
    id: "f-1840",
    timestamp: "18:40Z",
    band: "Ha",
    filtered: false,
    visible: true,
  },
  {
    id: "f-1850",
    timestamp: "18:50Z",
    band: "Ha",
    filtered: true,
    visible: true,
  },
  {
    id: "f-1900",
    timestamp: "19:00Z",
    band: "OIII",
    filtered: false,
    visible: true,
  },
  {
    id: "f-1910",
    timestamp: "19:10Z",
    band: "IR",
    filtered: false,
    visible: true,
  },
  {
    id: "f-1920",
    timestamp: "19:20Z",
    band: "BB",
    filtered: false,
    visible: true,
  },
];
