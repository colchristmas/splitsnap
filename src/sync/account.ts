// Accounts: signing up and in, the recovery key, password changes and resets.
// The password never leaves the device: Supabase gets a secret derived from it
// (see crypto.ts), and the same derivation unwraps the vault key.

import type { AuthError, SupabaseClient, User } from '@supabase/supabase-js'
import { clearAllData } from '../db/backup'
import { ensureSelf } from '../db/people'
import { db } from '../db/schema'
import {
  KDF_PARAMS,
  WrongKeyError,
  derivePasswordKeys,
  deriveWorkingKeys,
  newRecoveryKey,
  newVaultKey,
  normalizeEmail,
  parseRecoveryKey,
  recordKey,
  recoveryWrapKey,
  unwrapVault,
  wrapVault,
  type WorkingKeys,
} from './crypto'
import { accountHasData, deviceHasData, linkDevice, type LinkMode } from './engine'
import { RemoteError, createVault, deleteAllPhotos, getSupabase, getVault, isNetworkError, supabaseRemote, updateVault } from './remote'
import { startSync, stopSync, syncNow } from './runner'
import { syncState, type SavedKeys } from './store'

export const MIN_PASSWORD_LENGTH = 10

/** Signed in and unlocked, but this device isn't linked to the account yet. */
export interface PendingLink {
  keys: SavedKeys
  /** Set when the account's vault was just created: show it once. */
  recoveryKey?: string
  /** Both this device and the account have data, so the person picks merge or replace. */
  needsChoice: boolean
  /** What to do when there's no choice to make. */
  defaultMode: LinkMode
}

// ---- Signing up and in

export async function signUp(email: string, password: string): Promise<{ kind: 'confirm-email' } | { kind: 'unlocked'; pending: PendingLink }> {
  checkPassword(password)
  const sb = await getSupabase()
  const { authSecret, wrapKey } = await derivePasswordKeys(email, password)
  const { data, error } = await sb.auth.signUp({
    email: normalizeEmail(email),
    password: authSecret,
    options: { emailRedirectTo: `${location.origin}/account?confirmed=1` },
  })
  if (error) throw friendly(error)
  // With email confirmation on, Supabase doesn't say an email is taken; it
  // returns a user with no identities instead.
  if (data.user && data.user.identities?.length === 0) throw new Error('That email already has an account. Sign in instead.')
  if (!data.session || !data.user) return { kind: 'confirm-email' }
  return { kind: 'unlocked', pending: await unlock(sb, data.user, email, wrapKey) }
}

export async function signIn(email: string, password: string): Promise<PendingLink> {
  const sb = await getSupabase()
  const { authSecret, wrapKey } = await derivePasswordKeys(email, password)
  const { data, error } = await sb.auth.signInWithPassword({ email: normalizeEmail(email), password: authSecret })
  if (error) throw friendly(error)
  return unlock(sb, data.user, email, wrapKey)
}

/** Opens the vault, creating it (and the recovery key) on the account's first sign-in. */
async function unlock(sb: SupabaseClient, user: User, email: string, wrapKey: CryptoKey): Promise<PendingLink> {
  const vault = await getVault(sb, user.id)
  if (vault) return pendingFor(sb, user.id, email, await unwrapPassword(vault.wrapped_password, wrapKey))

  const vaultKey = newVaultKey()
  const recovery = newRecoveryKey()
  await createVault(sb, user.id, {
    kdf: KDF_PARAMS,
    wrapped_password: await wrapVault(vaultKey, wrapKey, 'password'),
    wrapped_recovery: await wrapVault(vaultKey, await recoveryWrapKey(recovery.bytes), 'recovery'),
  })
  return pendingFor(sb, user.id, email, vaultKey, recovery.text)
}

async function pendingFor(
  sb: SupabaseClient,
  userId: string,
  email: string,
  vaultKey: Uint8Array<ArrayBuffer>,
  recoveryKey?: string,
): Promise<PendingLink> {
  const keys: SavedKeys = { id: 'current', userId, email: normalizeEmail(email), ...(await deriveWorkingKeys(vaultKey)) }
  const [remoteHas, localHas] = await Promise.all([accountHasData(supabaseRemote(sb, userId)), deviceHasData(db)])
  return { keys, recoveryKey, needsChoice: remoteHas && localHas, defaultMode: remoteHas ? 'replace' : 'merge' }
}

/** Links this device to the account (merging or replacing its data), saves the keys and starts syncing. */
export async function finishLink(pending: PendingLink, mode: LinkMode) {
  const sb = await getSupabase()
  stopSync()
  await syncState.reset()
  await linkDevice({ db, state: syncState, remote: supabaseRemote(sb, pending.keys.userId), keys: pending.keys }, mode)
  await ensureSelf()
  await syncState.keys.put(pending.keys)
  await startSync()
}

/**
 * Signs in again after the session ended, keeping this device's data and keys.
 * Returns a PendingLink if the account was reset elsewhere and has new keys,
 * so the device has to be linked afresh.
 */
export async function signInAgain(password: string): Promise<PendingLink | null> {
  const saved = await requireKeys()
  const sb = await getSupabase()
  const { authSecret, wrapKey } = await derivePasswordKeys(saved.email, password)
  const { data, error } = await sb.auth.signInWithPassword({ email: saved.email, password: authSecret })
  if (error) throw friendly(error)
  const pending = await unlock(sb, data.user, saved.email, wrapKey)
  if (data.user.id === saved.userId && (await sameKeys(pending.keys, saved))) {
    void syncNow().catch(() => {})
    return null
  }
  return { ...pending, needsChoice: true }
}

const sameKeys = async (a: WorkingKeys, b: WorkingKeys) =>
  (await recordKey(a.macKey, 'splitsnap', 'key-check')) === (await recordKey(b.macKey, 'splitsnap', 'key-check'))

// ---- Password and recovery key, while signed in

export async function changePassword(current: string, next: string) {
  checkPassword(next)
  const saved = await requireKeys()
  const sb = await getSupabase()
  const vaultKey = await openVault(sb, saved, current)
  const fresh = await derivePasswordKeys(saved.email, next)
  const { error } = await sb.auth.updateUser({ password: fresh.authSecret })
  if (error) throw friendly(error)
  await retry(async () => updateVault(sb, saved.userId, { wrapped_password: await wrapVault(vaultKey, fresh.wrapKey, 'password') }))
}

/** Replaces the recovery key; the old one stops working. Returns the new one, to show once. */
export async function replaceRecoveryKey(password: string): Promise<string> {
  const saved = await requireKeys()
  const sb = await getSupabase()
  const vaultKey = await openVault(sb, saved, password)
  const recovery = newRecoveryKey()
  await updateVault(sb, saved.userId, { wrapped_recovery: await wrapVault(vaultKey, await recoveryWrapKey(recovery.bytes), 'recovery') })
  return recovery.text
}

/** Unwraps the vault with the password, which also proves the password is right. */
async function openVault(sb: SupabaseClient, saved: SavedKeys, password: string) {
  const vault = await getVault(sb, saved.userId)
  if (!vault) throw new Error("This account's keys are missing. Sign out and sign in again.")
  const { wrapKey } = await derivePasswordKeys(saved.email, password)
  return unwrapPassword(vault.wrapped_password, wrapKey)
}

async function unwrapPassword(wrapped: string, wrapKey: CryptoKey) {
  try {
    return await unwrapVault(wrapped, wrapKey, 'password')
  } catch (e) {
    if (e instanceof WrongKeyError) throw new Error('Wrong password.')
    throw e
  }
}

// ---- Forgot password

export async function sendPasswordReset(email: string) {
  const sb = await getSupabase()
  const { error } = await sb.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: `${location.origin}/account?reset=1` })
  if (error) throw friendly(error)
}

/** The account a reset link signed in to, or null if the link has expired. */
export async function resetLinkUser(): Promise<User | null> {
  const sb = await getSupabase()
  const { data } = await sb.auth.getSession()
  return data.session?.user ?? null
}

/** Sets a new password using the recovery key. The data is kept. */
export async function resetWithRecoveryKey(recoveryText: string, newPassword: string): Promise<PendingLink> {
  checkPassword(newPassword)
  const recovery = parseRecoveryKey(recoveryText)
  if (!recovery) throw new Error("That isn't a recovery key. It's 32 letters and numbers, in groups of 4.")
  const sb = await getSupabase()
  const user = await requireResetUser()
  const fresh = await derivePasswordKeys(user.email!, newPassword)
  const vault = await getVault(sb, user.id)
  if (!vault) {
    // Never finished a first sign-in, so there's nothing to recover yet.
    await setPassword(sb, fresh.authSecret)
    return unlock(sb, user, user.email!, fresh.wrapKey)
  }
  let vaultKey: Uint8Array<ArrayBuffer>
  try {
    vaultKey = await unwrapVault(vault.wrapped_recovery, await recoveryWrapKey(recovery), 'recovery')
  } catch (e) {
    if (e instanceof WrongKeyError) throw new Error("That recovery key doesn't match this account.")
    throw e
  }
  await setPassword(sb, fresh.authSecret)
  await retry(async () => updateVault(sb, user.id, { wrapped_password: await wrapVault(vaultKey, fresh.wrapKey, 'password') }))
  return pendingFor(sb, user.id, user.email!, vaultKey)
}

/**
 * Without the recovery key: deletes everything in the account and starts a
 * new vault under the new password. Other devices are signed out.
 */
export async function startFresh(newPassword: string): Promise<PendingLink> {
  checkPassword(newPassword)
  const sb = await getSupabase()
  const user = await requireResetUser()
  await deleteAllPhotos(sb, user.id)
  for (const table of ['records', 'vaults']) {
    const { error } = await sb.from(table).delete().eq('user_id', user.id)
    if (error) throw new RemoteError(error)
  }
  const fresh = await derivePasswordKeys(user.email!, newPassword)
  await setPassword(sb, fresh.authSecret)
  await sb.auth.signOut({ scope: 'others' }).catch(() => {})
  return unlock(sb, user, user.email!, fresh.wrapKey)
}

async function requireResetUser(): Promise<User> {
  const user = await resetLinkUser()
  if (!user?.email) throw new Error('This reset link has expired. Ask for a new one.')
  return user
}

async function setPassword(sb: SupabaseClient, authSecret: string) {
  const { error } = await sb.auth.updateUser({ password: authSecret })
  if (error) throw friendly(error)
}

// ---- Signing out and deleting

export class UnsyncedChangesError extends Error {
  constructor() {
    super("Some changes on this device haven't synced yet.")
    this.name = 'UnsyncedChangesError'
  }
}

/**
 * Syncs one last time, signs out and removes the account's data from this
 * device (it stays in the account). Throws UnsyncedChangesError if the last
 * sync fails, unless `force` is set.
 */
export async function signOut({ force = false } = {}) {
  if (!force) {
    try {
      await syncNow()
    } catch {
      throw new UnsyncedChangesError()
    }
  }
  stopSync()
  const sb = await getSupabase()
  await sb.auth.signOut({ scope: 'local' }).catch(() => {})
  await syncState.reset()
  await clearAllData()
  await ensureSelf()
}

/** Deletes the account and everything in it. This device keeps its own copy of the data. */
export async function deleteAccount(password: string) {
  const saved = await requireKeys()
  const sb = await getSupabase()
  await openVault(sb, saved, password)
  stopSync()
  await deleteAllPhotos(sb, saved.userId)
  const { error } = await sb.rpc('delete_my_account')
  if (error) throw new RemoteError(error)
  await sb.auth.signOut({ scope: 'local' }).catch(() => {})
  await syncState.reset()
}

// ---- Helpers

async function requireKeys(): Promise<SavedKeys> {
  const keys = await syncState.keys.get('current')
  if (!keys) throw new Error("You're not signed in.")
  return keys
}

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
}

async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i >= attempts) throw e
      await new Promise((r) => setTimeout(r, 500 * i))
    }
  }
}

/** Supabase's auth errors, in plain words. */
function friendly(error: AuthError): Error {
  if (isNetworkError(error)) return new Error("Can't reach the server. Check your connection and try again.")
  switch (error.code) {
    case 'invalid_credentials':
      return new Error('Wrong email or password.')
    case 'email_not_confirmed':
      return new Error('Confirm your email first: open the link we sent you, then sign in here.')
    case 'user_already_exists':
    case 'email_exists':
      return new Error('That email already has an account. Sign in instead.')
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return new Error('Too many tries. Wait a few minutes and try again.')
    case 'email_address_invalid':
      return new Error("That email address doesn't look right.")
    default:
      return new Error(error.message)
  }
}
