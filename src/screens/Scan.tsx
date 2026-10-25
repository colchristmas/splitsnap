import { RotateCcw, RotateCw, ScanText } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ActionBar, useReceiptContext } from '../components/layouts'
import { Banner, Button, Card } from '../components/ui'
import { useImageUrl } from '../db/hooks'
import { applyParsed } from '../db/receipts'
import { db } from '../db/schema'
import { getSetting } from '../db/settings'
import { recognize, type OcrProgress } from '../lib/ocr/engine'
import { prepareImage } from '../lib/ocr/preprocess'
import { parseReceipt } from '../lib/receipt/parse'

type State =
  | { kind: 'running'; progress?: OcrProgress }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }

export function Scan() {
  const receipt = useReceiptContext()
  const navigate = useNavigate()
  const photo = useImageUrl(receipt.imageId)
  const [state, setState] = useState<State>({ kind: 'running' })
  const started = useRef(false)

  const run = async () => {
    setState({ kind: 'running' })
    try {
      const image = receipt.imageId ? await db.images.get(receipt.imageId) : undefined
      if (!image) throw new Error('The photo for this receipt is missing.')
      const lines = await recognize(image.blob, await getSetting('ocrModel'), (progress) =>
        setState({ kind: 'running', progress }),
      )
      const parsed = parseReceipt(lines)
      if (parsed.items.length === 0) return setState({ kind: 'empty' })
      await applyParsed(receipt.id, parsed)
      navigate(`/r/${receipt.id}/items`, { replace: true })
    } catch (e) {
      console.error(e)
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (receipt.imageId) void run()
    else navigate(`/r/${receipt.id}/items`, { replace: true })
  })

  const rotate = async (deg: 90 | 270) => {
    const image = receipt.imageId ? await db.images.get(receipt.imageId) : undefined
    if (!image) return
    await db.images.put({ ...image, blob: await prepareImage(image.blob, deg) })
    void run()
  }

  const running = state.kind === 'running'

  return (
    <>
      <Card className="overflow-hidden p-0!">
        {photo && <img src={photo} alt="Receipt photo" className={running ? 'w-full opacity-60' : 'w-full'} />}
      </Card>

      <div className="mt-4" aria-live="polite">
        {running && <ProgressView progress={state.progress} />}
        {state.kind === 'empty' && (
          <Banner tone="warn">
            No items found. If the photo is sideways, rotate it and try again — or enter the items by hand.
          </Banner>
        )}
        {state.kind === 'error' && <Banner tone="warn">Scanning failed: {state.message}</Banner>}
      </div>

      <ActionBar>
        <Button disabled={running} onClick={() => void rotate(270)} aria-label="Rotate left">
          <RotateCcw size={18} />
        </Button>
        <Button disabled={running} onClick={() => void rotate(90)} aria-label="Rotate right">
          <RotateCw size={18} />
        </Button>
        {running ? (
          <Button className="flex-1" disabled>
            Scanning…
          </Button>
        ) : (
          <>
            <Button className="flex-1" onClick={() => void run()}>
              <ScanText size={18} /> Scan again
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => navigate(`/r/${receipt.id}/items`, { replace: true })}>
              Enter by hand
            </Button>
          </>
        )}
      </ActionBar>
    </>
  )
}

function ProgressView({ progress }: { progress?: OcrProgress }) {
  let text = 'Getting ready…'
  let fraction: number | undefined
  if (progress?.stage === 'download') {
    const mb = (b: number) => (b / 1e6).toFixed(1)
    text = `Downloading the scanner: ${mb(progress.loaded)} of ${mb(progress.total)} MB. This only happens once.`
    fraction = progress.total ? progress.loaded / progress.total : undefined
  } else if (progress?.stage === 'starting') {
    text = 'Starting the scanner…'
  } else if (progress?.stage === 'reading') {
    text = 'Reading your receipt…'
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm text-stone-600 dark:text-stone-300">{text}</p>
      <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <div
          className={fraction === undefined ? 'h-full w-1/3 animate-pulse rounded-full bg-teal-600' : 'h-full rounded-full bg-teal-600 transition-[width]'}
          style={fraction === undefined ? undefined : { width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
      <p className="text-xs text-stone-500">Everything runs on this device. Your receipt never leaves your phone.</p>
    </div>
  )
}
