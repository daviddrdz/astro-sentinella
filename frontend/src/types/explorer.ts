export type ExplorerLocale = "en" | "es";
export type ExplorerViewMode = "2d" | "3d";

export type ExplorerToolId =
  | "hand"
  | "zoom"
  | "split"
  | "subtract"
  | "region"
  | "ruler"
  | "spectrum"
  | "reset";

export type BlendMode = "Normal" | "Subtract" | "Screen" | "Add";

export type BandChannelId = 1 | 2 | 3 | 4 | 5 | 6;

export type ChannelTintId =
  "grey" | "viridis" | "magma" | "inferno" | "cividis" | "cubehelix";

export type TimelineFilterTab = "all" | "visible" | "filtered";

export interface ExplorerLayer {
  id: string;
  code: string;
  band: BandChannelId;
  bands: BandChannelId[];
  blendMode: BlendMode;
  opacity: number;
  visible: boolean;
  tint: ChannelTintId;
}

export interface ExplorerFrame {
  id: string;
  timestamp: string;
  band: BandChannelId;
  filtered: boolean;
  visible: boolean;
  imageUrl?: string;
  detector?: BandChannelId;
  wavelengthMinUm?: number;
  wavelengthMaxUm?: number;
}

export interface ExplorerSnapshot {
  layers: ExplorerLayer[];
  activeLayerId: string;
  activeFrameIndex: number;
}

/** Chunk bounds as fractions of the rendered image (top-left origin). */
export interface ChunkBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SpectrumPoint {
  wavelengthUm: number;
  bandwidthUm: number;
  /** null where the mosaic has no coverage for that channel. */
  flux: number | null;
}

export interface ChunkSpectrum {
  chunk: {
    row: number;
    col: number;
    rows: number;
    cols: number;
    sizeArcsec: number;
    bounds: ChunkBounds;
  };
  center: { ra: number; dec: number };
  pixelCount: number;
  unit: string;
  source: string;
  points: SpectrumPoint[];
}

export type SpectrumState =
  | { status: "idle" }
  | { status: "loading"; pending: { x: number; y: number } }
  | { status: "loaded"; data: ChunkSpectrum }
  | { status: "error"; message: string };
export interface SubtractionResult {
  id: string;
  frameA: ExplorerFrame;
  frameB: ExplorerFrame;
  createdAt: string;
  status: "loading" | "ready" | "error";
  imageUrl?: string;
  summary?: string;
  errorMessage?: string;
}
