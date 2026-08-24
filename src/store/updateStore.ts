import { create } from 'zustand'

interface UpdateStoreState {
  /** True once a new service worker has finished installing and is waiting
   *  to take over — drives the red "1" badge on the "Actualizar app" button
   *  in HomeScreen. Only ever set by pwaUpdate.ts's onNeedRefresh. */
  updateAvailable: boolean
  setUpdateAvailable: (available: boolean) => void
  /** Tells the waiting service worker to actually take over (skipWaiting).
   *  Set once by pwaUpdate.ts at startup; App.tsx calls it once the fake
   *  update animation's progress bar finishes filling. No-op until then. */
  applyUpdate: () => void
  setApplyUpdate: (fn: () => void) => void
}

export const useUpdateStore = create<UpdateStoreState>((set) => ({
  updateAvailable: false,
  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
  applyUpdate: () => {},
  setApplyUpdate: (fn) => set({ applyUpdate: fn }),
}))
