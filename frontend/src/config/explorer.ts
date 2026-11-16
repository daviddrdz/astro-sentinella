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
  spectrumEndpoint: "/api/frames/spectrum",
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
    id: "spectrum",
    mobileVisible: true,
    label: { en: "Spectrum", es: "Espectro" },
  },
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
    spectrumTitle: string;
    spectrumHint: string;
    spectrumLoading: string;
    spectrumError: string;
    spectrumNoCoverage: string;
    spectrumSourceNote: string;
    spectrumWavelength: string;
    spectrumFlux: string;
    spectrumChunk: string;
    spectrumShowTable: string;
    spectrumClose: string;
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
    spectrumTitle: "Chunk spectrum",
    spectrumHint:
      "Click anywhere on the frame to see the spectrum of that area.",
    spectrumLoading: "Extracting spectrum from the 102 SPHEREx channels...",
    spectrumError: "Spectrum unavailable. Try again in a moment.",
    spectrumNoCoverage: "No SPHEREx mosaic coverage for this area.",
    spectrumSourceNote:
      "All-mission SPHEREx mosaic (quick-look, not tied to this date). For science, use the IRSA spectrophotometry tool.",
    spectrumWavelength: "Wavelength (µm)",
    spectrumFlux: "Surface brightness",
    spectrumChunk: "Chunk",
    spectrumShowTable: "Show data table",
    spectrumClose: "Close spectrum",
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
    spectrumTitle: "Espectro del chunk",
    spectrumHint: "Haz clic en el frame para ver el espectro de esa zona.",
    spectrumLoading: "Extrayendo el espectro de los 102 canales SPHEREx...",
    spectrumError: "Espectro no disponible. Intenta de nuevo en un momento.",
    spectrumNoCoverage: "El mosaico SPHEREx no cubre esta zona.",
    spectrumSourceNote:
      "Mosaico SPHEREx de toda la misión (quick-look, no corresponde a esta fecha). Para ciencia, usa la herramienta de espectrofotometría de IRSA.",
    spectrumWavelength: "Longitud de onda (µm)",
    spectrumFlux: "Brillo superficial",
    spectrumChunk: "Chunk",
    spectrumShowTable: "Ver tabla de datos",
    spectrumClose: "Cerrar espectro",
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

/** Geometry and styling of the inline spectrum chart (SVG user units). */
export const SPECTRUM_CHART = {
  width: 360,
  height: 220,
  margin: { top: 22, right: 12, bottom: 36, left: 52 },
  xTicksUm: [1, 2, 3, 4, 5],
  xDomainMinUm: 0.7,
  xDomainMaxUm: 5.1,
  yTickTarget: 4,
  yPadRatio: 0.08,
  yLabelGap: 6,
  xLabelOffset: 14,
  axisTitleInset: 4,
  yTitleX: 11,
  refLabelGap: 6,
  lineWidth: 2,
  markerRadius: 4,
  markerRing: 2,
  refLineOpacity: 0.35,
  crosshairOpacity: 0.6,
  coordDecimals: 1,
  wavelengthDecimals: 3,
  tooltipMinPct: 20,
  tooltipMaxPct: 80,
  percent: 100,
  half: 2,
  /** Common bright features in SPHEREx spectra, drawn as faint references. */
  referenceLines: [
    { um: 1.875, label: "Paα" },
    { um: 3.3, label: "PAH" },
    { um: 4.052, label: "Brα" },
  ],
} as const;

export const SPECTRUM_FORMAT = {
  fluxSignificantDigits: 3,
  fluxExpDigits: 2,
  fluxSmallAbs: 0.01,
  fluxLargeAbs: 1e4,
  niceResiduals: [
    { atLeast: 7, nice: 10 },
    { atLeast: 3, nice: 5 },
    { atLeast: 1.5, nice: 2 },
  ],
  niceBase: 10,
  tickPrecision: 12,
  clickDecimals: 4,
  coordDecimals: 4,
  chunkArcsecDecimals: 0,
} as const;
