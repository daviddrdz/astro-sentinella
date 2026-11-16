export type ExplorerLocale = "en" | "es";

export type ExplorerToolId =
  "hand" | "zoom" | "split" | "subtract" | "region" | "ruler" | "reset";

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
