import { describe, expect, it } from 'vitest'
import {
  WrongKeyError,
  canonicalJson,
  decryptJson,
  derivePasswordKeys,
  deriveWorkingKeys,
  encryptJson,
  fromBase64,
  newRecoveryKey,
  newVaultKey,
  parseRecoveryKey,
  recordKey,
  recoveryWrapKey,
  toBase64,
  unwrapVault,
  wrapVault,
} from './crypto'

// The real 600,000 iterations would make each test take about a second.
const FAST = 1000

describe('password keys', () => {
  it('are the same for the same email and password, ignoring email case', async () => {
    const a = await derivePasswordKeys('Sam@Example.com ', 'correct horse', FAST)
    const b = await derivePasswordKeys('sam@example.com', 'correct horse', FAST)
    expect(a.authSecret).toBe(b.authSecret)
  })

  it('differ by password and by email, and never contain the password', async () => {
    const a = await derivePasswordKeys('sam@example.com', 'correct horse', FAST)
    const b = await derivePasswordKeys('sam@example.com', 'correct horsf', FAST)
    const c = await derivePasswordKeys('alex@example.com', 'correct horse', FAST)
    expect(new Set([a.authSecret, b.authSecret, c.authSecret]).size).toBe(3)
    expect(a.authSecret).not.toContain('correct')
    expect(a.authSecret).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

describe('vault', () => {
  it('unwraps with the right password and refuses the wrong one', async () => {
    const vault = newVaultKey()
    const { wrapKey } = await derivePasswordKeys('sam@example.com', 'right password', FAST)
    const wrapped = await wrapVault(vault, wrapKey, 'password')
    expect(await unwrapVault(wrapped, wrapKey, 'password')).toEqual(vault)

    const wrong = await derivePasswordKeys('sam@example.com', 'wrong password', FAST)
    await expect(unwrapVault(wrapped, wrong.wrapKey, 'password')).rejects.toBeInstanceOf(WrongKeyError)
  })

  it('unwraps with the recovery key, however it is typed', async () => {
    const vault = newVaultKey()
    const recovery = newRecoveryKey()
    const wrapped = await wrapVault(vault, await recoveryWrapKey(recovery.bytes), 'recovery')

    const typed = ` ${recovery.text.toLowerCase().replace(/-/g, ' ')} `
    const parsed = parseRecoveryKey(typed)
    expect(parsed).toEqual(recovery.bytes)
    expect(await unwrapVault(wrapped, await recoveryWrapKey(parsed!), 'recovery')).toEqual(vault)
  })

  it('does not accept a password-wrapped vault as a recovery-wrapped one', async () => {
    const vault = newVaultKey()
    const { wrapKey } = await derivePasswordKeys('sam@example.com', 'pw', FAST)
    const wrapped = await wrapVault(vault, wrapKey, 'password')
    await expect(unwrapVault(wrapped, wrapKey, 'recovery')).rejects.toBeInstanceOf(WrongKeyError)
  })
})

describe('recovery key', () => {
  it('is 8 groups of 4 Crockford base32 characters', () => {
    const { text } = newRecoveryKey()
    expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/)
  })

  it('reads look-alike letters as digits and rejects wrong lengths', () => {
    const { text, bytes } = newRecoveryKey()
    expect(parseRecoveryKey(text.replace(/0/g, 'O').replace(/1/g, 'l'))).toEqual(bytes)
    expect(parseRecoveryKey(text.slice(0, -1))).toBeNull()
    expect(parseRecoveryKey('not a key')).toBeNull()
  })
})

describe('records', () => {
  it('round-trip, and a ciphertext moved to another record key fails', async () => {
    const { encKey, macKey } = await deriveWorkingKeys(newVaultKey())
    const keyA = await recordKey(macKey, 'receipts', 'a')
    const keyB = await recordKey(macKey, 'receipts', 'b')
    expect(keyA).toMatch(/^[0-9a-f]{64}$/)
    expect(keyA).not.toBe(keyB)

    const data = await encryptJson(encKey, { store: 'Costco' }, keyA)
    expect(await decryptJson(encKey, data, keyA)).toEqual({ store: 'Costco' })
    await expect(decryptJson(encKey, data, keyB)).rejects.toThrow()
  })

  it('encrypt the same value differently each time', async () => {
    const { encKey } = await deriveWorkingKeys(newVaultKey())
    const [a, b] = await Promise.all([encryptJson(encKey, { x: 1 }, 'k'), encryptJson(encKey, { x: 1 }, 'k')])
    expect(a).not.toBe(b)
  })
})

describe('helpers', () => {
  it('canonicalJson sorts keys at every level and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[{"y":2,"z":1}]},"b":1}')
  })

  it('base64 round-trips binary data longer than one 32 KB chunk', () => {
    // getRandomValues fills at most 64 KB per call.
    const data = crypto.getRandomValues(new Uint8Array(60_000))
    expect(fromBase64(toBase64(data))).toEqual(data)
  })
})
