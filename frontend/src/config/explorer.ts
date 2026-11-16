import type {
  BandChannelId,
  BlendMode,
  ChannelTintId,
  ExplorerFrame,
  ExplorerLayer,
  ExplorerLocale,
  ExplorerToolId,
  TimelineFilterTab,
} from "../types/explorer";

export const EXPLORER_CONFIG = {
  framesEndpoint: "/api/frames",
  compareEndpoint: "/api/frames/compare",
  compareMaxFrames: 2,
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
  dragThresholdPx: 4,
  wheelZoomSensitivity: 0.0015,
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
  { id: 1, label: "Band 1 (0.75 – 1.10 µm) — Optical / Near-IR" },
  { id: 2, label: "Band 2 (1.10 – 1.58 µm) — Near-Infrared" },
  { id: 3, label: "Band 3 (1.58 – 2.14 µm) — Near-Infrared" },
  { id: 4, label: "Band 4 (2.14 – 2.82 µm) — Mid-Near Infrared" },
  { id: 5, label: "Band 5 (2.82 – 3.80 µm) — Infrared" },
  { id: 6, label: "Band 6 (3.80 – 5.00 µm) — Deep Infrared" },
];

export interface ChannelTintOption {
  id: ChannelTintId;
  label: string;
}

export const CHANNEL_TINTS: readonly ChannelTintOption[] = [
  { id: "grey", label: "grey" },
  { id: "viridis", label: "viridis" },
  { id: "magma", label: "magma" },
  { id: "inferno", label: "inferno" },
  { id: "cividis", label: "cividis" },
  { id: "cubehelix", label: "cubehelix" },
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
    compareTitle: string;
    compareHint: string;
    frameALabel: string;
    frameBLabel: string;
    selectFromTimeline: string;
    compareAction: string;
    comparing: string;
    clearSelection: string;
    swapFrames: string;
    restasTitle: string;
    noRestas: string;
    viewResult: string;
    viewingResult: string;
    backToFrames: string;
    compareFailed: string;
    pickForCompare: string;
    comparingSkeleton: string;
    startCompare: string;
    cancelCompare: string;
    compareSelectingHint: string;
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
    compareTitle: "Compare",
    compareHint: "Select 2 frames from the timeline to subtract.",
    frameALabel: "Frame A",
    frameBLabel: "Frame B",
    selectFromTimeline: "Select from timeline",
    compareAction: "Compare",
    comparing: "Comparing...",
    clearSelection: "Clear",
    swapFrames: "Swap",
    restasTitle: "Restas",
    noRestas: "No subtractions yet.",
    viewResult: "View",
    viewingResult: "Viewing",
    backToFrames: "Back to frame",
    compareFailed: "Compare endpoint is not available yet.",
    pickForCompare: "Select for compare",
    comparingSkeleton: "Computing sector subtraction...",
    startCompare: "Compare 2 frames",
    cancelCompare: "Cancel",
    compareSelectingHint: "Click 2 frames in the timeline to select them.",
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
    compareTitle: "Comparar",
    compareHint: "Selecciona 2 fotogramas en la línea de tiempo para restar.",
    frameALabel: "Fotograma A",
    frameBLabel: "Fotograma B",
    selectFromTimeline: "Selecciona en la línea de tiempo",
    compareAction: "Comparar",
    comparing: "Comparando...",
    clearSelection: "Limpiar",
    swapFrames: "Intercambiar",
    restasTitle: "Restas",
    noRestas: "Aún no hay restas.",
    viewResult: "Ver",
    viewingResult: "Viendo",
    backToFrames: "Volver al fotograma",
    compareFailed: "El endpoint de comparación aún no está disponible.",
    pickForCompare: "Seleccionar para comparar",
    comparingSkeleton: "Calculando resta entre sectores...",
    startCompare: "Comparar 2 fotogramas",
    cancelCompare: "Cancelar",
    compareSelectingHint:
      "Haz clic en 2 fotogramas de la línea de tiempo para seleccionarlos.",
  },
};

export const DEFAULT_EXPLORER_LAYERS: readonly ExplorerLayer[] = [
  {
    id: "frm-02",
    code: "FRM-02",
    band: 2,
    bands: [2],
    blendMode: "Normal",
    opacity: 70,
    visible: true,
    tint: "magma",
  },
  {
    id: "frm-01",
    code: "FRM-01",
    band: 1,
    bands: [1],
    blendMode: "Normal",
    opacity: 0,
    visible: false,
    tint: "grey",
  },
];

export const DEFAULT_EXPLORER_FRAMES: readonly ExplorerFrame[] = [
  {
    id: "f-1810",
    timestamp: "18:10Z",
    band: 1,
    filtered: false,
    visible: false,
  },
  {
    id: "f-1820",
    timestamp: "18:20Z",
    band: 2,
    filtered: false,
    visible: true,
  },
  {
    id: "f-1830",
    timestamp: "18:30Z",
    band: 3,
    filtered: false,
    visible: true,
  },
  {
    id: "f-1840",
    timestamp: "18:40Z",
    band: 1,
    filtered: false,
    visible: true,
  },
  {
    id: "f-1850",
    timestamp: "18:50Z",
    band: 1,
    filtered: true,
    visible: true,
  },
  {
    id: "f-1900",
    timestamp: "19:00Z",
    band: 3,
    filtered: false,
    visible: true,
  },
  {
    id: "f-1910",
    timestamp: "19:10Z",
    band: 2,
    filtered: false,
    visible: true,
  },
  {
    id: "f-1920",
    timestamp: "19:20Z",
    band: 6,
    filtered: false,
    visible: true,
  },
];
