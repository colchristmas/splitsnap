import { useLiveQuery } from 'dexie-react-hooks'
import type { OcrModel } from '../lib/ocr/engine'
import { db } from './schema'

export interface Settings {
  ocrModel: OcrModel
}

const DEFAULTS: Settings = { ocrModel: 'accurate' }

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const row = await db.settings.get(key)
  return (row?.value as Settings[K]) ?? DEFAULTS[key]
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await db.settings.put({ key, value })
}

export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useLiveQuery(() => getSetting(key), [key]) ?? DEFAULTS[key]
}
