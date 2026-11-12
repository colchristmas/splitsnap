import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ChevronRight, ClipboardPaste, ImageUp, PencilLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatedCents } from '../components/AnimatedCents'
import { Wave } from '../components/layouts'
import { ReceiptTile } from '../components/ReceiptTile'
import { Banner, SectionTitle, Tile } from '../components/ui'
import { useBalances } from '../db/balances'
import { createReceipt } from '../db/receipts'
import { db } from '../db/schema'
import { getSetting } from '../db/settings'
import { prepareEngine } from '../lib/ocr/engine'
import { prepareImage } from '../lib/ocr/preprocess'

export function Home() {
  const navigate = useNavigate()
  const camera = useRef<HTMLInputElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const recent = useLiveQuery(() => db.receipts.orderBy('updatedAt').reverse().limit(4).toArray(), []) ?? []
  const open = [...useBalances().byPerson.values()].map((b) => b.openCents)
  const owedToMe = open.filter((c) => c > 0).reduce((a, c) => a + c, 0)
  const iOwe = -open.filter((c) => c < 0).reduce((a, c) => a + c, 0)

  // Starts downloading the scanner while the camera or photo picker is open.
  // Scan shows the same download, and retries if this one fails.
  const warmUpScanner = () => void getSetting('ocrModel').then((m) => prepareEngine(m)).catch(() => {})

  const onImage = async (image: Blob | undefined) => {
    if (!image || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const id = await createReceipt(await prepareImage(image))
      navigate(`/r/${id}/scan`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that image.")
      setBusy(false)
    }
  }

  // ⌘V / Ctrl+V anywhere on this screen pastes a copied screenshot.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!file) return
      e.preventDefault()
      void onImage(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  })

  // Phones have no paste shortcut, so the button reads the clipboard directly.
  // iOS Safari shows its own "Paste" bubble to confirm.
  const pasteFromClipboard = async () => {
    setError(undefined)
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (type) return void (await onImage(await item.getType(type)))
      }
      setError('No image on the clipboard. Copy a screenshot first, then try again.')
    } catch {
      setError("Couldn't read the clipboard. Allow access when asked, or save the screenshot and use Upload.")
    }
  }

  const canReadClipboard = Boolean(navigator.clipboard?.read)
  const pasteKeys = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘V' : 'Ctrl+V'
  const hasKeyboard = matchMedia('(pointer: fine)').matches

  const manual = async () => navigate(`/r/${await createReceipt()}/items`)

  return (
    <>
      <header className="mb-6">
        <h1 className="text-4xl font-bold tracking-tight">SplitSnap</h1>
        <Wave className="mt-1 h-3 w-20 text-teal-600" />
        <p className="mt-2 text-stone-500">Snap a receipt, tap who had what.</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Tile tone="copper" square={false} className="col-span-2 min-h-44" disabled={busy} onClick={() => (warmUpScanner(), camera.current?.click())}>
          <Camera size={36} strokeWidth={1.75} />
          <span className="text-3xl font-bold tracking-tight">Take a photo</span>
        </Tile>
        <Tile tone="olive" disabled={busy} onClick={() => (warmUpScanner(), upload.current?.click())}>
          <ImageUp size={30} strokeWidth={1.75} />
          <span className="text-xl leading-tight font-semibold">Upload a photo</span>
        </Tile>
        {canReadClipboard && (
          <Tile tone="tan" disabled={busy} onClick={() => void pasteFromClipboard()}>
            <ClipboardPaste size={30} strokeWidth={1.75} />
            <span className="text-xl leading-tight font-semibold">Paste a screenshot</span>
          </Tile>
        )}
        <Tile tone="cream" disabled={busy} onClick={() => void manual()}>
          <PencilLine size={30} strokeWidth={1.75} className="text-teal-600" />
          <span className="text-xl leading-tight font-semibold">Enter items by hand</span>
        </Tile>
        {(owedToMe > 0 || iOwe > 0) && (
          <Tile tone="forest" to="/people">
            <span className="flex items-center justify-between text-sm text-stone-300">
              Balances <ChevronRight size={18} />
            </span>
            <div className="grid gap-1.5">
              {owedToMe > 0 && (
                <p>
                  <span className="block text-xs text-stone-300">You're owed</span>
                  <AnimatedCents cents={owedToMe} className="text-xl font-bold" />
                </p>
              )}
              {iOwe > 0 && (
                <p>
                  <span className="block text-xs text-stone-300">You owe</span>
                  <AnimatedCents cents={iOwe} className="text-xl font-bold text-teal-300" />
                </p>
              )}
            </div>
          </Tile>
        )}
      </div>

      {hasKeyboard && (
        <p className="mt-3 text-center text-sm text-stone-500">Tip: press {pasteKeys} here to paste a copied screenshot.</p>
      )}
      {error && (
        <div className="mt-3">
          <Banner tone="warn">{error}</Banner>
        </div>
      )}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void onImage(e.target.files?.[0]).finally(() => (e.target.value = ''))}
      />
      <input
        ref={upload}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void onImage(e.target.files?.[0]).finally(() => (e.target.value = ''))}
      />

      {recent.length > 0 && (
        <>
          <SectionTitle
            action={
              <Link to="/history" className="text-sm font-medium text-teal-700 dark:text-teal-300">
                See all
              </Link>
            }
          >
            Recent
          </SectionTitle>
          <div data-stagger className="grid grid-cols-2 gap-3">
            {recent.map((r, i) => (
              <ReceiptTile key={r.id} receipt={r} index={i} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
