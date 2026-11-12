import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check, ChevronDown, Cloud, CloudOff, Copy, Download, KeyRound, Lock, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { PageTitle } from '../components/layouts'
import { Banner, Button, Card, SectionTitle, Segmented, cx } from '../components/ui'
import {
  MIN_PASSWORD_LENGTH,
  UnsyncedChangesError,
  changePassword,
  deleteAccount,
  finishLink,
  replaceRecoveryKey,
  resetLinkUser,
  resetWithRecoveryKey,
  sendPasswordReset,
  signIn,
  signInAgain,
  signOut,
  signUp,
  startFresh,
  type PendingLink,
} from '../sync/account'
import type { LinkMode } from '../sync/engine'
import { accountsAvailable, getSupabase, isNetworkError } from '../sync/remote'
import { describeStatus, syncNow, useSyncStatus } from '../sync/runner'
import { syncState, type SavedKeys } from '../sync/store'

/** Steps that take over the page until they're done. */
type Flow =
  | { kind: 'recovery-key'; text: string; pending?: PendingLink }
  | { kind: 'choose'; pending: PendingLink }
  | { kind: 'linking'; mode: LinkMode }
  | { kind: 'reset' }

export function Account() {
  const [params, setParams] = useSearchParams()
  const keys = useLiveQuery(async () => (await syncState.keys.get('current')) ?? null, [])
  const [flow, setFlow] = useState<Flow | null>(() => (params.has('reset') ? { kind: 'reset' } : null))
  const [linkError, setLinkError] = useState<string>()
  const confirmed = params.has('confirmed')

  // A confirmation link signs in through the URL; loading the client reads it and tidies the address bar.
  useEffect(() => {
    if (confirmed && accountsAvailable) void getSupabase()
  }, [confirmed])

  const link = (pending: PendingLink, mode?: LinkMode) => {
    if (!mode && pending.needsChoice) return setFlow({ kind: 'choose', pending })
    const chosen = mode ?? pending.defaultMode
    setFlow({ kind: 'linking', mode: chosen })
    setLinkError(undefined)
    finishLink(pending, chosen).then(
      () => {
        setFlow(null)
        setParams({}, { replace: true })
      },
      (e: unknown) => {
        setLinkError(messageOf(e))
        setFlow(null)
      },
    )
  }

  /** After unlocking: show a new recovery key first, then link this device. */
  const proceed = (pending: PendingLink) => {
    if (pending.recoveryKey) setFlow({ kind: 'recovery-key', text: pending.recoveryKey, pending })
    else link(pending)
  }

  let body: ReactNode
  if (!accountsAvailable) body = <NotAvailable />
  else if (flow?.kind === 'recovery-key')
    body = <RecoveryKeyView text={flow.text} onDone={() => (flow.pending ? link(flow.pending) : setFlow(null))} />
  else if (flow?.kind === 'choose') body = <ChooseView onPick={(mode) => link(flow.pending, mode)} />
  else if (flow?.kind === 'linking') body = <LinkingView mode={flow.mode} />
  else if (flow?.kind === 'reset')
    body = (
      <ResetView
        onDone={proceed}
        onCancel={() => {
          setFlow(null)
          setParams({}, { replace: true })
        }}
      />
    )
  else if (keys === undefined) body = null
  else if (keys) body = <SignedIn keys={keys} onRecoveryKey={(text) => setFlow({ kind: 'recovery-key', text })} onRelink={proceed} />
  else
    body = (
      <SignedOut notice={confirmed ? 'Email confirmed. Sign in to finish setting up your account.' : undefined} error={linkError} onUnlocked={proceed} />
    )

  return (
    <>
      <Link to="/settings" className="-ml-1 mb-3 inline-flex items-center gap-1 text-sm font-medium text-teal-700 dark:text-teal-400">
        <ArrowLeft size={16} /> Settings
      </Link>
      <PageTitle>Account</PageTitle>
      {body}
    </>
  )
}

// ---- Signed out

function SignedOut({ notice, error, onUnlocked }: { notice?: string; error?: string; onUnlocked: (p: PendingLink) => void }) {
  const [mode, setMode] = useState<'sign-in' | 'create' | 'forgot'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [sent, setSent] = useState<string>()
  const action = useAction(error)

  const switchTo = (m: typeof mode) => {
    setMode(m)
    setSent(undefined)
    action.clear()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void action.run(async () => {
      if (mode === 'forgot') {
        await sendPasswordReset(email)
        setSent(`If ${email.trim()} has an account, we've emailed it a link to set a new password.`)
        return
      }
      if (mode === 'create') {
        if (password !== again) throw new Error("The two passwords don't match.")
        const result = await signUp(email, password)
        if (result.kind === 'unlocked') return onUnlocked(result.pending)
        setMode('sign-in')
        setPassword('')
        setAgain('')
        setSent(`We've emailed a link to ${email.trim()}. Open it to confirm your address, then sign in here.`)
        return
      }
      onUnlocked(await signIn(email, password))
    })
  }

  const cta = { 'sign-in': ['Sign in', 'Unlocking…'], create: ['Create account', 'Creating…'], forgot: ['Email me a reset link', 'Sending…'] }[mode]

  return (
    <>
      <PrivacyNote />
      <Card className="mt-4 grid gap-4">
        {mode !== 'forgot' && (
          <Segmented
            value={mode}
            options={[
              { value: 'sign-in', label: 'Sign in' },
              { value: 'create', label: 'Create account' },
            ]}
            onChange={switchTo}
          />
        )}
        {mode === 'forgot' && (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            We'll email you a link. To keep your data you'll also need your recovery key.
          </p>
        )}
        <form className="grid gap-3" onSubmit={submit}>
          <TextInput label="Email" type="email" autoComplete="username" inputMode="email" required value={email} onChange={setEmail} />
          {mode !== 'forgot' && (
            <TextInput
              label="Password"
              type="password"
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'create' ? MIN_PASSWORD_LENGTH : undefined}
              hint={mode === 'create' ? `At least ${MIN_PASSWORD_LENGTH} characters. A long passphrase is best: it protects your data.` : undefined}
              value={password}
              onChange={setPassword}
            />
          )}
          {mode === 'create' && (
            <TextInput label="Password again" type="password" autoComplete="new-password" required value={again} onChange={setAgain} />
          )}
          {notice && !sent && <Banner tone="ok">{notice}</Banner>}
          {sent && <Banner tone="info">{sent}</Banner>}
          {action.error && <Banner tone="warn">{action.error}</Banner>}
          <Button type="submit" variant="primary" disabled={action.busy}>
            {action.busy ? cta[1] : cta[0]}
          </Button>
        </form>
        <button
          type="button"
          className="justify-self-start text-sm font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
          onClick={() => switchTo(mode === 'forgot' ? 'sign-in' : 'forgot')}
        >
          {mode === 'forgot' ? 'Back to sign in' : 'Forgot your password?'}
        </button>
      </Card>
    </>
  )
}

function PrivacyNote() {
  return (
    <Card className="grid gap-2">
      <p className="flex items-center gap-2 font-semibold">
        <ShieldCheck size={18} className="text-teal-700 dark:text-teal-400" /> Sync your receipts, privately
      </p>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        With an account, your people, receipts and photos sync across your devices. They're encrypted on this device before
        they're uploaded, so only you can read them. The server can't.
      </p>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        That's why you'll also get a recovery key. If you forget your password and lose the key, the copy in your account can't
        be recovered. No account? Everything keeps working on this device.
      </p>
    </Card>
  )
}

// ---- Steps

function RecoveryKeyView({ text, onDone }: { text: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }
  const download = () => {
    const note = `SplitSnap recovery key\n\n${text}\n\nIf you forget your password, this key lets you set a new one without losing your data.\nKeep it somewhere safe and private, like a password manager.\n`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([note], { type: 'text/plain' }))
    a.download = 'splitsnap-recovery-key.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <Card className="grid gap-4">
      <p className="flex items-center gap-2 font-semibold">
        <KeyRound size={18} className="text-teal-700 dark:text-teal-400" /> Save your recovery key
      </p>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        If you forget your password, this key is the only way back to your data. Keep it somewhere safe, like a password
        manager. It's only shown now.
      </p>
      <p
        aria-label={`Recovery key: ${text}`}
        className="grid grid-cols-4 gap-1.5 rounded-[1.25rem] bg-stone-100 p-3 text-center font-mono text-base font-semibold tracking-wider select-all dark:bg-stone-800"
      >
        {text.split('-').map((group, i) => (
          <span key={i}>{group}</span>
        ))}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void copy()}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" onClick={download}>
          <Download size={16} /> Download as a file
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-teal-700" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I've saved my recovery key
      </label>
      <Button variant="primary" disabled={!saved} onClick={onDone}>
        Continue
      </Button>
    </Card>
  )
}

function ChooseView({ onPick }: { onPick: (mode: LinkMode) => void }) {
  return (
    <Card className="grid gap-3">
      <p className="font-semibold">This device already has receipts</p>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Your account has data too. What should happen to this device's people and receipts?
      </p>
      <Button variant="primary" onClick={() => onPick('merge')}>
        Keep both
      </Button>
      <p className="-mt-1 px-1 text-xs text-stone-500 dark:text-stone-400">
        Adds this device's data to your account. People with the same name become one person.
      </p>
      <Button
        onClick={() => {
          if (confirm("Remove this device's people and receipts and use only your account's? Export a backup first if you might need them.")) onPick('replace')
        }}
      >
        Use my account's data only
      </Button>
      <p className="-mt-1 px-1 text-xs text-stone-500 dark:text-stone-400">Removes this device's data and replaces it with your account's.</p>
    </Card>
  )
}

function LinkingView({ mode }: { mode: LinkMode }) {
  return (
    <Card className="grid gap-2">
      <p className="flex items-center gap-2 font-semibold">
        <RefreshCw size={18} className="animate-spin text-teal-700 dark:text-teal-400" /> Setting up sync…
      </p>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        {mode === 'merge' ? 'Combining this device with your account.' : 'Downloading your account.'} Photos can take a minute.
        Keep this page open.
      </p>
    </Card>
  )
}

/** Opened from the reset email: set a new password with the recovery key, or start over without it. */
function ResetView({ onDone, onCancel }: { onDone: (p: PendingLink) => void; onCancel: () => void }) {
  const [email, setEmail] = useState<string | null>()
  const [withoutKey, setWithoutKey] = useState(false)
  const [key, setKey] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const action = useAction()

  useEffect(() => {
    resetLinkUser().then(
      (u) => setEmail(u?.email ?? null),
      () => setEmail(null),
    )
  }, [])

  if (email === undefined) return <Card>Checking the link…</Card>
  if (email === null)
    return (
      <Card className="grid gap-3">
        <Banner tone="warn">This reset link has expired or was already used. Ask for a new one from the sign-in page.</Banner>
        <Button className="justify-self-start" onClick={onCancel}>
          Back to sign in
        </Button>
      </Card>
    )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void action.run(async () => {
      if (password !== again) throw new Error("The two passwords don't match.")
      if (withoutKey) {
        if (!confirm('Delete everything in your account and start over? Devices that are signed in keep their own copy.')) return
        onDone(await startFresh(password))
      } else {
        onDone(await resetWithRecoveryKey(key, password))
      }
    })
  }

  return (
    <Card className="grid gap-4">
      <p className="font-semibold">Set a new password for {email}</p>
      <form className="grid gap-3" onSubmit={submit}>
        {withoutKey ? (
          <Banner tone="warn">
            Without the recovery key, the data in your account can't be decrypted. Starting over deletes it and gives you a new,
            empty account under the same email. Any device that's still signed in keeps its own copy, and you can add it back
            from there.
          </Banner>
        ) : (
          <TextInput
            label="Recovery key"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            value={key}
            onChange={setKey}
            className="font-mono"
          />
        )}
        <TextInput
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          value={password}
          onChange={setPassword}
        />
        <TextInput label="New password again" type="password" autoComplete="new-password" required value={again} onChange={setAgain} />
        {action.error && <Banner tone="warn">{action.error}</Banner>}
        <Button type="submit" variant={withoutKey ? 'secondary' : 'primary'} disabled={action.busy}>
          {action.busy ? 'Working…' : withoutKey ? 'Delete my data and start over' : 'Set new password'}
        </Button>
      </form>
      <button
        type="button"
        className="justify-self-start text-sm font-medium text-teal-700 underline-offset-2 hover:underline dark:text-teal-400"
        onClick={() => {
          setWithoutKey(!withoutKey)
          action.clear()
        }}
      >
        {withoutKey ? 'I have my recovery key' : "I don't have my recovery key"}
      </button>
    </Card>
  )
}

// ---- Signed in

function SignedIn({ keys, onRecoveryKey, onRelink }: { keys: SavedKeys; onRecoveryKey: (text: string) => void; onRelink: (p: PendingLink) => void }) {
  const status = useSyncStatus()
  const [open, setOpen] = useState<'password' | 'recovery' | 'delete' | null>(null)
  const toggle = (which: typeof open) => setOpen(open === which ? null : which)
  const now = useNow()
  const trouble = status.kind === 'offline' || status.kind === 'error' || status.kind === 'needs-sign-in'

  return (
    <>
      <Card className="grid gap-3">
        <div className="flex items-center gap-3">
          <span className={cx('rounded-blob grid size-11 shrink-0 place-items-center', trouble ? 'bg-amber-200 text-amber-900' : 'bg-teal-400 text-stone-900')}>
            {trouble ? <CloudOff size={22} /> : <Cloud size={22} />}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{keys.email}</p>
            <p className="text-sm text-stone-600 dark:text-stone-400" aria-live="polite">
              {describeStatus(status, now)}
            </p>
          </div>
        </div>
        {status.kind === 'needs-sign-in' ? (
          <SignInAgain onRelink={onRelink} />
        ) : (
          <Button size="sm" className="justify-self-start" disabled={status.kind === 'syncing'} onClick={() => void syncNow().catch(() => {})}>
            <RefreshCw size={16} className={status.kind === 'syncing' ? 'animate-spin' : undefined} /> Sync now
          </Button>
        )}
      </Card>
      <p className="mt-3 px-1 text-xs text-stone-500 dark:text-stone-400">
        Everything is encrypted on this device before it's uploaded. Only your signed-in devices can read it.
      </p>

      <SectionTitle>Security</SectionTitle>
      <Card className="grid gap-4">
        <Disclosure icon={<Lock size={16} />} label="Change password" open={open === 'password'} onToggle={() => toggle('password')}>
          <ChangePasswordForm />
        </Disclosure>
        <Disclosure icon={<KeyRound size={16} />} label="Make a new recovery key" open={open === 'recovery'} onToggle={() => toggle('recovery')}>
          <PasswordForm
            note="Your current recovery key stops working once the new one is made."
            cta="Make a new key"
            onSubmit={async (password) => onRecoveryKey(await replaceRecoveryKey(password))}
          />
        </Disclosure>
      </Card>

      <SectionTitle>This account</SectionTitle>
      <Card className="grid gap-4">
        <SignOutButton />
        <Disclosure danger label="Delete account" open={open === 'delete'} onToggle={() => toggle('delete')}>
          <PasswordForm
            note="Deletes your account and everything synced to it, for good. This device keeps its own copy of your data."
            cta="Delete my account"
            danger
            onSubmit={async (password) => {
              if (!confirm('Delete your SplitSnap account and all the data in it? This cannot be undone.')) return
              await deleteAccount(password)
            }}
          />
        </Disclosure>
      </Card>
    </>
  )
}

function SignInAgain({ onRelink }: { onRelink: (p: PendingLink) => void }) {
  return (
    <PasswordForm
      note="Your session ended, so sync is paused. Changes on this device are kept."
      cta="Sign in again"
      onSubmit={async (password) => {
        const pending = await signInAgain(password)
        if (pending) onRelink(pending)
      }}
    />
  )
}

function ChangePasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [done, setDone] = useState(false)
  const action = useAction()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setDone(false)
    void action.run(async () => {
      if (next !== again) throw new Error("The two new passwords don't match.")
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setAgain('')
      setDone(true)
    })
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <TextInput label="Current password" type="password" autoComplete="current-password" required value={current} onChange={setCurrent} />
      <TextInput
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. Your recovery key keeps working.`}
        value={next}
        onChange={setNext}
      />
      <TextInput label="New password again" type="password" autoComplete="new-password" required value={again} onChange={setAgain} />
      {action.error && <Banner tone="warn">{action.error}</Banner>}
      {done && <Banner tone="ok">Password changed. Use it next time you sign in on another device.</Banner>}
      <Button type="submit" size="sm" className="justify-self-start" disabled={action.busy}>
        {action.busy ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  )
}

/** A password field and one button, for actions that need the password again. */
function PasswordForm({ note, cta, danger, onSubmit }: { note: string; cta: string; danger?: boolean; onSubmit: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('')
  const action = useAction()
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void action.run(() => onSubmit(password))
      }}
    >
      <p className="text-sm text-stone-600 dark:text-stone-400">{note}</p>
      <TextInput label="Password" type="password" autoComplete="current-password" required value={password} onChange={setPassword} />
      {action.error && <Banner tone="warn">{action.error}</Banner>}
      <Button type="submit" size="sm" variant={danger ? 'danger' : 'secondary'} className="justify-self-start" disabled={action.busy}>
        {action.busy ? 'Working…' : cta}
      </Button>
    </form>
  )
}

function SignOutButton() {
  const action = useAction()
  const run = () =>
    void action.run(async () => {
      if (!confirm("Sign out? SplitSnap's data is removed from this device. It stays in your account and comes back when you sign in again.")) return
      try {
        await signOut()
      } catch (e) {
        if (!(e instanceof UnsyncedChangesError)) throw e
        if (!confirm("Some changes on this device haven't synced, so signing out now loses them. Sign out anyway?")) return
        await signOut({ force: true })
      }
    })
  return (
    <div className="grid gap-3">
      <Button size="sm" className="justify-self-start" disabled={action.busy} onClick={run}>
        <LogOut size={16} /> {action.busy ? 'Signing out…' : 'Sign out'}
      </Button>
      {action.error && <Banner tone="warn">{action.error}</Banner>}
    </div>
  )
}

// ---- Bits

function NotAvailable() {
  return (
    <Card className="grid gap-2">
      <p className="font-semibold">Accounts aren't set up in this copy of SplitSnap</p>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Everything stays on this device. To turn accounts on, add <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code> and rebuild (see the README).
      </p>
    </Card>
  )
}

function Disclosure({
  icon,
  label,
  danger,
  open,
  onToggle,
  children,
}: {
  icon?: ReactNode
  label: string
  danger?: boolean
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="grid gap-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cx('flex items-center gap-2 text-left text-sm font-medium', danger ? 'text-red-700 dark:text-red-400' : 'text-stone-800 dark:text-stone-200')}
      >
        {icon}
        {label}
        <ChevronDown size={16} className={cx('ml-auto transition-transform', open && 'rotate-180')} />
      </button>
      {open && children}
    </div>
  )
}

const INPUT =
  'w-full rounded-[1rem] bg-white px-3.5 py-2.5 text-base font-normal ring-1 ring-teal-200 outline-none transition focus:ring-2 focus:ring-teal-600 dark:bg-stone-950 dark:ring-stone-700'

function TextInput({
  label,
  hint,
  onChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { label: string; hint?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <input {...props} onChange={(e) => onChange(e.target.value)} className={cx(INPUT, className)} />
      {hint && <span className="text-xs font-normal text-stone-500 dark:text-stone-400">{hint}</span>}
    </label>
  )
}

/** Busy and error state for one form's action. */
function useAction(initialError?: string) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true)
    setError(undefined)
    try {
      await fn()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, clear: () => setError(undefined) }
}

const messageOf = (e: unknown) =>
  isNetworkError(e) ? "Can't reach the server. Check your connection and try again." : e instanceof Error ? e.message : String(e)

/** The current time, updated every 30 s, so "Synced 3 min ago" stays true. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}
