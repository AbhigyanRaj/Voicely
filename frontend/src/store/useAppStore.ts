import { create } from 'zustand';

interface AppState {
  selectedModuleId: string | null;
  setSelectedModuleId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedModuleId: null,
  setSelectedModuleId: (id) => set({ selectedModuleId: id }),
}));
