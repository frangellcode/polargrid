import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

interface ColorPickerPlugin {
  /** Opens iOS's colour picker (with its eyedropper); resolves with the final
   *  "#rrggbb" when the sheet closes. */
  pick(options: { color: string }): Promise<{ color: string }>
  addListener(event: 'colorChange', listener: (data: { color: string }) => void): Promise<PluginListenerHandle>
}

/** ios/App/App/ColorPickerPlugin.swift. Native-only. */
export const ColorPicker = registerPlugin<ColorPickerPlugin>('ColorPicker')
