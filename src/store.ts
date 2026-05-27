import { create } from "zustand";
import type { EngineId } from "./lib/api";

export type Tab = "convert" | "profiles" | "history";

interface UIState {
  tab: Tab;
  setTab: (t: Tab) => void;
  selectedEngine: EngineId;
  setSelectedEngine: (e: EngineId) => void;
}

export const useUI = create<UIState>((set) => ({
  tab: "convert",
  setTab: (tab) => set({ tab }),
  selectedEngine: "seedvc",
  setSelectedEngine: (selectedEngine) => set({ selectedEngine }),
}));
