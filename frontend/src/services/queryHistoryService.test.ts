import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PORTAL_HISTORY_CONFIG } from "../config/app";
import {
  clearQueryHistory,
  loadQueryHistory,
  saveQueryHistoryEntry,
} from "./queryHistoryService";

const KEY = PORTAL_HISTORY_CONFIG.storageKey;
const QUERY = {
  ra: "83.82",
  dec: "-5.39",
  fieldSizeDeg: "0.5",
  observationDate: "2025-05-01",
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("query history", () => {
  it.each([null, "invalid JSON", "null", "{}", "42"])(
    "handles absent or corrupt storage: %s",
    (raw) => {
      if (raw !== null) localStorage.setItem(KEY, raw);
      expect(loadQueryHistory()).toEqual([]);
    }
  );

  it("filters malformed and invalid entries while preserving valid ones", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        null,
        42,
        {},
        { ...QUERY, ra: 42 },
        { ...QUERY, dec: "91" },
        { ...QUERY, fieldSizeDeg: "0" },
        { ...QUERY, observationDate: "" },
        QUERY,
      ])
    );
    expect(loadQueryHistory()).toEqual([QUERY]);
  });

  it("persists a new entry and moves a repeated query to the front with its latest date", () => {
    const other = { ...QUERY, ra: "84" };
    saveQueryHistoryEntry(QUERY);
    saveQueryHistoryEntry(other);
    const updated = { ...QUERY, observationDate: "2025-05-02" };
    expect(saveQueryHistoryEntry(updated)).toEqual([updated, other]);
    expect(loadQueryHistory()).toEqual([updated, other]);
  });

  it("retains queries with different field sizes", () => {
    saveQueryHistoryEntry(QUERY);
    const wider = { ...QUERY, fieldSizeDeg: "1" };
    expect(saveQueryHistoryEntry(wider)).toEqual([wider, QUERY]);
  });

  it("caps loaded and saved history at the configured limit", () => {
    const entries = Array.from(
      { length: PORTAL_HISTORY_CONFIG.maxItems + 2 },
      (_, index) => ({ ...QUERY, ra: String(index) })
    );
    localStorage.setItem(KEY, JSON.stringify(entries));
    expect(loadQueryHistory()).toEqual(
      entries.slice(0, PORTAL_HISTORY_CONFIG.maxItems)
    );
    const latest = { ...QUERY, ra: "300" };
    const saved = saveQueryHistoryEntry(latest);
    expect(saved).toEqual([
      latest,
      ...entries.slice(0, PORTAL_HISTORY_CONFIG.maxItems - 1),
    ]);
    expect(loadQueryHistory()).toEqual(saved);
  });

  it("does not overwrite history with an invalid query", () => {
    saveQueryHistoryEntry(QUERY);
    const set = vi.spyOn(Storage.prototype, "setItem");
    expect(saveQueryHistoryEntry({ ...QUERY, ra: "invalid" })).toEqual([QUERY]);
    expect(loadQueryHistory()).toEqual([QUERY]);
    expect(set).not.toHaveBeenCalled();
  });

  it("handles storage read and write failures", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    expect(loadQueryHistory()).toEqual([]);
    expect(saveQueryHistoryEntry(QUERY)).toEqual([QUERY]);
  });

  it("clears only application history", () => {
    saveQueryHistoryEntry(QUERY);
    localStorage.setItem("unrelated", "keep");
    clearQueryHistory();
    expect(loadQueryHistory()).toEqual([]);
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });

  it("tolerates storage removal being blocked", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("Denied");
    });
    expect(() => clearQueryHistory()).not.toThrow();
  });
});
