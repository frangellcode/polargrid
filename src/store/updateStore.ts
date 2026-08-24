import { create } from 'zustand'

interface UpdateStoreState {
  /** True once a new service worker has finished installing behind the one
   *  currently controlling the page — drives the red "1" badge on the
   *  "Actualizar app" button in HomeScreen. */
  updateAvailable: boolean
  setUpdateAvailable: (available: boolean) => void
}

export const useUpdateStore = create<UpdateStoreState>((set) => ({
  updateAvailable: false,
  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
}))
