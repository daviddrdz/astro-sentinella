export type ExplorerLocale = "en" | "es";

export type ExplorerToolId =
  "hand" | "zoom" | "split" | "subtract" | "region" | "ruler" | "reset";

export type BandChannelId =
  | "Band 1"
  | "Band 2"
  | "Band 3"
  | "Band 4"
  | "Band 5"
  | "Band 6";

export type ChannelTintId =
  | "grey"
  | "viridis"
  | "magma"
  | "inferno"
  | "cividis"
  | "cubehelix";

export type TimelineFilterTab = "all" | "visible" | "filtered";

export interface ExplorerFrame {
  id: string;
  timestamp: string;
  band: BandChannelId;
  filtered: boolean;
  visible: boolean;
  imageUrl?: string;
}
