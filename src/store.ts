import { create } from "zustand";

export type Tab = "convert" | "profiles" | "history";

interface UIState {
  tab: Tab;
  setTab: (t: Tab) => void;
}

export const useUI = create<UIState>((set) => ({
  tab: "convert",
  setTab: (tab) => set({ tab }),
}));
