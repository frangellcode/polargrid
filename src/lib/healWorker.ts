/// <reference lib="webworker" />
import { heal } from './heal'

/** Runs the healing fill off the main thread, so the screen keeps moving. */
self.onmessage = (e: MessageEvent<{ id: number; width: number; height: number; rgba: Uint8ClampedArray; mask: Uint8Array }>) => {
  const { id, width, height, rgba, mask } = e.data
  try {
    const out = heal({ width, height, rgba, mask })
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, rgba: out }, [out.buffer])
  } catch (error) {
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, error: String(error) })
  }
}
