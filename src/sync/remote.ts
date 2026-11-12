// Everything that talks to Supabase. The schema lives in
// supabase/migrations/0001_accounts_sync.sql.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PushRow, Remote, RemoteRow } from './engine'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** False for a build without Supabase settings: accounts are hidden and everything stays on the device. */
export const accountsAvailable = Boolean(url && publishableKey)

let client: Promise<SupabaseClient> | undefined

/** The Supabase client, loaded on first use so people who never sign in don't download it. */
export function getSupabase(): Promise<SupabaseClient> {
  if (!accountsAvailable) return Promise.reject(new Error('Accounts are not set up on this copy of SplitSnap.'))
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url!, publishableKey!, {
      // Implicit flow: reset and confirmation links also work when opened in
      // another browser than the one that asked for them (e.g. a mail app's).
      auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  )
  return client
}

/** A Supabase or network failure as a real Error, keeping the code and HTTP status when there is one. */
export class RemoteError extends Error {
  code?: string
  status?: number
  constructor(error: { message: string; code?: string; status?: number; statusCode?: string | number }) {
    super(error.message)
    this.name = 'RemoteError'
    this.code = error.code
    this.status = error.status ?? (error.statusCode === undefined ? undefined : Number(error.statusCode))
  }
}

/** True when the failure means "couldn't reach the server" rather than "the server said no". */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const message = e instanceof Error ? e.message : String(e)
  if (/failed to fetch|fetch failed|networkerror|network request failed|load failed|timed? ?out/i.test(message)) return true
  // 5xx, including a paused free-tier project.
  return e instanceof RemoteError && e.status !== undefined && e.status >= 500
}

const BUCKET = 'photos'

interface RecordRow {
  key: string
  data: string | null
  deleted: boolean
  changed_at: number | string
  seq: number | string
}

export function supabaseRemote(sb: SupabaseClient, userId: string): Remote {
  const path = (key: string) => `${userId}/${key}`
  return {
    async pull(since, limit) {
      const { data, error } = await sb
        .from('records')
        .select('key, data, deleted, changed_at, seq')
        .eq('user_id', userId)
        .gt('seq', since)
        .order('seq')
        .limit(limit)
      if (error) throw new RemoteError(error)
      return (data as RecordRow[]).map(
        (r): RemoteRow => ({ key: r.key, data: r.data, deleted: r.deleted, changedAt: Number(r.changed_at), seq: Number(r.seq) }),
      )
    },

    async push(rows: PushRow[]) {
      const { error } = await sb.from('records').upsert(
        rows.map((r) => ({ user_id: userId, key: r.key, data: r.data, deleted: r.deleted, changed_at: r.changedAt })),
        { onConflict: 'user_id,key' },
      )
      if (error) throw new RemoteError(error)
    },

    async uploadPhoto(key, data) {
      const { error } = await sb.storage
        .from(BUCKET)
        .upload(path(key), new Blob([data], { type: 'application/octet-stream' }), { upsert: true, contentType: 'application/octet-stream' })
      if (error) throw new RemoteError(error)
    },

    async downloadPhoto(key) {
      const { data, error } = await sb.storage.from(BUCKET).download(path(key))
      if (error) {
        const e = new RemoteError(error)
        // Storage reports a missing object as 404, or as 400 "not found".
        if (e.status === 404 || /not.?found/i.test(e.message)) return null
        throw e
      }
      return new Uint8Array(await data.arrayBuffer())
    },

    async deletePhotos(keys) {
      const { error } = await sb.storage.from(BUCKET).remove(keys.map(path))
      if (error) throw new RemoteError(error)
    },
  }
}

// ---- The vault row: the vault key, wrapped by the password and by the recovery key.

export interface VaultRow {
  wrapped_password: string
  wrapped_recovery: string
}

export async function getVault(sb: SupabaseClient, userId: string): Promise<VaultRow | null> {
  const { data, error } = await sb.from('vaults').select('wrapped_password, wrapped_recovery').eq('user_id', userId).maybeSingle()
  if (error) throw new RemoteError(error)
  return data as VaultRow | null
}

export async function createVault(sb: SupabaseClient, userId: string, vault: VaultRow & { kdf: unknown }) {
  const { error } = await sb.from('vaults').insert({ user_id: userId, ...vault })
  if (error) throw new RemoteError(error)
}

export async function updateVault(sb: SupabaseClient, userId: string, patch: Partial<VaultRow>) {
  const { error } = await sb
    .from('vaults')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw new RemoteError(error)
}

/** Deletes every photo in the user's storage folder. */
export async function deleteAllPhotos(sb: SupabaseClient, userId: string) {
  for (;;) {
    const { data, error } = await sb.storage.from(BUCKET).list(userId, { limit: 1000 })
    if (error) throw new RemoteError(error)
    if (data.length === 0) return
    const { error: removeError } = await sb.storage.from(BUCKET).remove(data.map((f) => `${userId}/${f.name}`))
    if (removeError) throw new RemoteError(removeError)
  }
}
