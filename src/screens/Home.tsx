import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ChevronRight, ClipboardPaste, ImageUp, PencilLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ReceiptRow } from '../components/ReceiptRow'
import { Banner, Button, Card, SectionTitle } from '../components/ui'
import { useBalances } from '../db/balances'
import { createReceipt } from '../db/receipts'
import { db } from '../db/schema'
import { formatCents } from '../lib/money'
import { prepareImage } from '../lib/ocr/preprocess'

export function Home() {
  const navigate = useNavigate()
  const camera = useRef<HTMLInputElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const recent = useLiveQuery(() => db.receipts.orderBy('updatedAt').reverse().limit(5).toArray(), []) ?? []
  const open = [...useBalances().byPerson.values()].map((b) => b.openCents)
  const owedToMe = open.filter((c) => c > 0).reduce((a, c) => a + c, 0)
  const iOwe = -open.filter((c) => c < 0).reduce((a, c) => a + c, 0)

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
      <header className="mb-5">
        <h1 className="text-3xl font-bold tracking-tight">SplitSnap</h1>
        <p className="text-stone-500">Snap a receipt, tap who had what.</p>
      </header>

      <Card className="grid gap-3">
        <Button variant="primary" size="lg" disabled={busy} onClick={() => camera.current?.click()}>
          <Camera size={22} /> Take a photo
        </Button>
        <Button size="lg" disabled={busy} onClick={() => upload.current?.click()}>
          <ImageUp size={22} /> Upload a photo
        </Button>
        {canReadClipboard && (
          <Button size="lg" disabled={busy} onClick={() => void pasteFromClipboard()}>
            <ClipboardPaste size={22} /> Paste a screenshot
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={() => void manual()}>
          <PencilLine size={18} /> Enter items by hand
        </Button>
        {hasKeyboard && (
          <p className="text-center text-sm text-stone-500">Tip: press {pasteKeys} here to paste a copied screenshot.</p>
        )}
        {error && <Banner tone="warn">{error}</Banner>}
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
      </Card>

      {(owedToMe > 0 || iOwe > 0) && (
        <Link to="/people" className="mt-3 block">
          <Card className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-stone-500">Balances</p>
              <p className="font-semibold">
                {owedToMe > 0 && `You're owed ${formatCents(owedToMe)}`}
                {owedToMe > 0 && iOwe > 0 && ' · '}
                {iOwe > 0 && `You owe ${formatCents(iOwe)}`}
              </p>
            </div>
            <ChevronRight size={18} className="text-stone-400" />
          </Card>
        </Link>
      )}

      {recent.length > 0 && (
        <>
          <SectionTitle
            action={
              <Link to="/history" className="text-sm font-medium text-teal-700 dark:text-teal-400">
                See all
              </Link>
            }
          >
            Recent
          </SectionTitle>
          <Card className="divide-y divide-stone-100 p-0! dark:divide-stone-800">
            {recent.map((r) => (
              <ReceiptRow key={r.id} receipt={r} />
            ))}
          </Card>
        </>
      )}
    </>
  )
}
