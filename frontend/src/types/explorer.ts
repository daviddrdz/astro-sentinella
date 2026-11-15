export type ExplorerLocale = "en" | "es";

export type ExplorerToolId =
  "hand" | "zoom" | "split" | "subtract" | "region" | "ruler" | "reset";

export type BlendMode = "Normal" | "Subtract" | "Screen" | "Add";

export type BandChannelId = "Ha" | "OIII" | "IR" | "UV" | "BB";

export type ChannelTintId =
  | "grey"
  | "viridis"
  | "magma"
  | "inferno"
  | "cividis"
  | "cubehelix";

export type LayerFilterId = "stretch" | "contrast" | "invert" | "edges";

export type TimelineFilterTab = "all" | "visible" | "filtered";

export interface ExplorerLayer {
  id: string;
  code: string;
  band: BandChannelId;
  blendMode: BlendMode;
  opacity: number;
  visible: boolean;
  tint: ChannelTintId;
  filters: Record<LayerFilterId, boolean>;
}

export interface ExplorerFrame {
  id: string;
  timestamp: string;
  band: BandChannelId;
  filtered: boolean;
  visible: boolean;
  imageUrl?: string;
}

export interface ExplorerSnapshot {
  layers: ExplorerLayer[];
  activeLayerId: string;
  activeFrameIndex: number;
}
