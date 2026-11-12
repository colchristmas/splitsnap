// End-to-end encryption for synced data. Everything here runs on the device;
// the server only ever sees the outputs (an auth secret, wrapped keys and
// ciphertext). Built on Web Crypto only.
//
//   password ──PBKDF2──▶ master ──HKDF──▶ authSecret  (Supabase's "password")
//                                  └─HKDF──▶ wrapKey ──wraps──▶ vault key
//   recovery key ─────────HKDF──▶ recoveryKey ──wraps──▶ vault key
//   vault key ──HKDF──▶ encKey (AES-GCM, records and photos)
//             └─HKDF──▶ macKey (HMAC, opaque record keys)

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** OWASP's 2023 recommendation for PBKDF2-SHA256. Changing it changes every user's auth secret. */
export const KDF_ITERATIONS = 600_000
export const KDF_PARAMS = { alg: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, v: 1 } as const

export interface WorkingKeys {
  encKey: CryptoKey
  macKey: CryptoKey
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

const bytes = (text: string) => encoder.encode(text)
const random = (length: number) => crypto.getRandomValues(new Uint8Array(length))
const hkdfParams = (info: string): HkdfParams => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: bytes(info) })

/**
 * Stretches the password once, then splits it into the secret Supabase checks
 * (so Supabase never sees the password) and the key that unwraps the vault.
 */
export async function derivePasswordKeys(email: string, password: string, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', bytes(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits'])
  const master = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bytes(`splitsnap-v1:${normalizeEmail(email)}`), iterations },
    base,
    256,
  )
  const hkdf = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey'])
  const auth = new Uint8Array(await crypto.subtle.deriveBits(hkdfParams('splitsnap auth'), hkdf, 256))
  const wrapKey = await crypto.subtle.deriveKey(hkdfParams('splitsnap wrap'), hkdf, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
  return { authSecret: toBase64Url(auth), wrapKey }
}

// ---- Recovery key: 160 random bits, written as 8 groups of 4 Crockford base32 characters.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const RECOVERY_BYTES = 20

export function newRecoveryKey(): { text: string; bytes: Uint8Array<ArrayBuffer> } {
  const key = random(RECOVERY_BYTES)
  let bits = 0
  let value = 0
  let out = ''
  for (const b of key) {
    value = ((value << 8) | b) & 0xfff
    bits += 8
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return { text: out.match(/.{4}/g)!.join('-'), bytes: key }
}

/** Reads a typed recovery key, forgiving case, spaces, dashes and look-alike letters. Null if it isn't one. */
export function parseRecoveryKey(text: string): Uint8Array<ArrayBuffer> | null {
  const clean = text
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (clean.length !== 32) return null
  const out = new Uint8Array(RECOVERY_BYTES)
  let bits = 0
  let value = 0
  let i = 0
  for (const ch of clean) {
    const v = CROCKFORD.indexOf(ch)
    if (v < 0) return null
    value = ((value << 5) | v) & 0xfff
    bits += 5
    if (bits >= 8) {
      out[i++] = (value >>> (bits - 8)) & 0xff
      bits -= 8
    }
  }
  return out
}

export async function recoveryWrapKey(recovery: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const hkdf = await crypto.subtle.importKey('raw', recovery, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(hkdfParams('splitsnap recovery'), hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

// ---- Vault key: the one random key everything is encrypted under.

export const newVaultKey = () => random(32)

export type WrapLabel = 'password' | 'recovery'

export async function wrapVault(vaultKey: Uint8Array<ArrayBuffer>, wrapKey: CryptoKey, label: WrapLabel): Promise<string> {
  return toBase64(await encryptBytes(wrapKey, vaultKey, `splitsnap vault ${label}`))
}

/** Throws WrongKeyError when the key doesn't match (wrong password or recovery key). */
export async function unwrapVault(wrapped: string, wrapKey: CryptoKey, label: WrapLabel): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return await decryptBytes(wrapKey, fromBase64(wrapped), `splitsnap vault ${label}`)
  } catch {
    throw new WrongKeyError()
  }
}

export class WrongKeyError extends Error {
  constructor() {
    super("That key doesn't unlock this account.")
    this.name = 'WrongKeyError'
  }
}

/** The keys sync uses day to day. Non-extractable, so they can be kept on the device without exposing the vault key. */
export async function deriveWorkingKeys(vaultKey: Uint8Array<ArrayBuffer>): Promise<WorkingKeys> {
  const hkdf = await crypto.subtle.importKey('raw', vaultKey, 'HKDF', false, ['deriveKey'])
  const [encKey, macKey] = await Promise.all([
    crypto.subtle.deriveKey(hkdfParams('splitsnap data'), hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    crypto.subtle.deriveKey(hkdfParams('splitsnap record keys'), hkdf, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
  ])
  return { encKey, macKey }
}

// ---- Records

/** The server-side name of a record: an HMAC of its table and id, so the server learns neither. */
export async function recordKey(macKey: CryptoKey, table: string, id: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', macKey, bytes(`${table}:${id}`)))
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * AES-GCM with a random 96-bit IV, returned as iv ‖ ciphertext. `aad` binds
 * the ciphertext to its record key, so the server can't swap two records.
 */
export async function encryptBytes(key: CryptoKey, plain: Uint8Array<ArrayBuffer>, aad: string): Promise<Uint8Array<ArrayBuffer>> {
  const iv = random(12)
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: bytes(aad) }, key, plain))
  const out = new Uint8Array(iv.length + sealed.length)
  out.set(iv)
  out.set(sealed, iv.length)
  return out
}

export async function decryptBytes(key: CryptoKey, data: Uint8Array<ArrayBuffer>, aad: string): Promise<Uint8Array<ArrayBuffer>> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.subarray(0, 12), additionalData: bytes(aad) },
    key,
    data.subarray(12),
  )
  return new Uint8Array(plain)
}

export async function encryptJson(key: CryptoKey, value: unknown, aad: string): Promise<string> {
  return toBase64(await encryptBytes(key, bytes(canonicalJson(value)), aad))
}

export async function decryptJson<T>(key: CryptoKey, data: string, aad: string): Promise<T> {
  return JSON.parse(decoder.decode(await decryptBytes(key, fromBase64(data), aad))) as T
}

// ---- Helpers

/** JSON with object keys sorted, so equal records always serialize (and hash) the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}

/** A fast 53-bit hash (cyrb53), only for noticing that a record changed since it was last synced. */
export function hashString(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function toBase64(data: Uint8Array): string {
  let text = ''
  for (let i = 0; i < data.length; i += 0x8000) text += String.fromCharCode(...data.subarray(i, i + 0x8000))
  return btoa(text)
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const toBase64Url = (data: Uint8Array) => toBase64(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
