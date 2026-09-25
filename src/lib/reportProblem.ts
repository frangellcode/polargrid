import { App } from '@capacitor/app'
import { Device } from '@capacitor/device'
import { isNativeApp } from './native'
import type { Language } from './translations'

export const SUPPORT_EMAIL = 'frangellcode@gmail.com'

/**
 * Opens the person's mail app with a report already addressed and the details
 * that make a bug reproducible filled in below where they write. A plain
 * mailto: — no server, nothing sent unless they press send themselves.
 */
export async function reportProblem(language: Language, labels: { subject: string; prompt: string }) {
  const details = [`Language: ${language}`]
  try {
    const device = await Device.getInfo()
    details.unshift(`Device: ${device.model} · ${device.operatingSystem} ${device.osVersion}`)
    if (isNativeApp) {
      const app = await App.getInfo()
      details.unshift(`App: ${app.version} (${app.build})`)
    } else {
      details.unshift(`App: web · ${navigator.userAgent}`)
    }
  } catch {
    // A report without the details is still a report.
  }

  const body = `${labels.prompt}\n\n\n\n—\n${details.join('\n')}`
  window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(labels.subject)}&body=${encodeURIComponent(body)}`
}
