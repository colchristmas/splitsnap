// Decides when to sync, and tells the UI how it went.

import Dexie, { type ObservabilitySet } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from '../db/schema'
import { sync } from './engine'
import { accountsAvailable, getSupabase, isNetworkError, supabaseRemote } from './remote'
import { syncState } from './store'

export type SyncStatus =
  | { kind: 'signed-out' }
  | { kind: 'waiting' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number }
  | { kind: 'offline' }
  | { kind: 'needs-sign-in' }
  | { kind: 'error'; message: string }

let status: SyncStatus = { kind: 'signed-out' }
const listeners = new Set<() => void>()

function setStatus(next: SyncStatus) {
  status = next
  for (const l of listeners) l()
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => status,
  )
}

/** One line for the UI. */
export function describeStatus(s: SyncStatus, now = Date.now()): string {
  switch (s.kind) {
    case 'signed-out':
      return 'Not signed in'
    case 'waiting':
      return 'Waiting to sync'
    case 'syncing':
      return 'Syncing…'
    case 'synced': {
      const minutes = Math.floor((now - s.at) / 60_000)
      return minutes < 1 ? 'Synced just now' : minutes < 60 ? `Synced ${minutes} min ago` : `Synced at ${new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    }
    case 'offline':
      return "Can't reach the server. Changes are saved here and will sync later."
    case 'needs-sign-in':
      return 'Sign in again to keep syncing'
    case 'error':
      return `Sync failed: ${s.message}`
  }
}

/** Thrown when there's no valid session for the saved account. */
export class NeedsSignInError extends Error {
  constructor() {
    super('Sign in again to keep syncing.')
    this.name = 'NeedsSignInError'
  }
}

let running: Promise<void> | undefined
let again = false

/** Syncs now, or once more right after the sync already running. Rejects when it fails. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await syncOnce()
      } while (again)
    } finally {
      running = undefined
    }
  })()
  return running
}

async function syncOnce() {
  const keys = await syncState.keys.get('current')
  if (!keys) return setStatus({ kind: 'signed-out' })
  setStatus({ kind: 'syncing' })
  try {
    const sb = await getSupabase()
    const { data, error } = await sb.auth.getSession()
    if (error) throw error
    if (!data.session || data.session.user.id !== keys.userId) throw new NeedsSignInError()
    const ctx = { db, state: syncState, remote: supabaseRemote(sb, keys.userId), keys }
    // One tab at a time, so two tabs never push the same change twice.
    await (navigator.locks ? navigator.locks.request('splitsnap-sync', () => sync(ctx)) : sync(ctx))
    setStatus({ kind: 'synced', at: Date.now() })
  } catch (e) {
    if (e instanceof NeedsSignInError) setStatus({ kind: 'needs-sign-in' })
    // A record this device can't decrypt: the account's keys changed (it was
    // reset from another device), so this device has to sign in again.
    else if (e instanceof DOMException && e.name === 'OperationError') setStatus({ kind: 'needs-sign-in' })
    else if (isNetworkError(e)) setStatus({ kind: 'offline' })
    else setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

let stops: (() => void)[] = []

const SETTLE_MS = 2000
const EVERY_MS = 5 * 60_000

/** Starts syncing in the background if this device is signed in. Safe to call more than once. */
export async function startSync() {
  if (stops.length > 0) return
  if (!accountsAvailable || !(await syncState.keys.get('current'))) return setStatus({ kind: 'signed-out' })
  setStatus({ kind: 'waiting' })

  const kick = () => void syncNow().catch(() => {})
  const visible = () => document.visibilityState === 'visible'

  // Any change to the app's data (here or in another tab), once edits settle.
  let timer: ReturnType<typeof setTimeout> | undefined
  const appData = `idb://${db.name}/`
  const onMutated = (parts: ObservabilitySet) => {
    if (!Object.keys(parts).some((p) => p.startsWith(appData) && !p.startsWith(`${appData}settings/`))) return
    clearTimeout(timer)
    timer = setTimeout(kick, SETTLE_MS)
  }
  const onVisible = () => visible() && kick()
  const interval = setInterval(() => visible() && kick(), EVERY_MS)

  Dexie.on.storagemutated.subscribe(onMutated)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', kick)
  stops = [
    () => Dexie.on.storagemutated.unsubscribe(onMutated),
    () => document.removeEventListener('visibilitychange', onVisible),
    () => window.removeEventListener('online', kick),
    () => clearInterval(interval),
    () => clearTimeout(timer),
  ]
  kick()
}

/** Stops background syncing (when signing out). */
export function stopSync() {
  for (const stop of stops) stop()
  stops = []
  setStatus({ kind: 'signed-out' })
}
