import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ImageUp, PencilLine } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ReceiptRow } from '../components/ReceiptRow'
import { Banner, Button, Card, SectionTitle } from '../components/ui'
import { createReceipt } from '../db/receipts'
import { db } from '../db/schema'
import { prepareImage } from '../lib/ocr/preprocess'

export function Home() {
  const navigate = useNavigate()
  const camera = useRef<HTMLInputElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const recent = useLiveQuery(() => db.receipts.orderBy('updatedAt').reverse().limit(5).toArray(), []) ?? []

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(undefined)
    try {
      const id = await createReceipt(await prepareImage(file))
      navigate(`/r/${id}/scan`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that photo.")
      setBusy(false)
    }
  }

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
        <Button variant="ghost" disabled={busy} onClick={() => void manual()}>
          <PencilLine size={18} /> Enter items by hand
        </Button>
        {error && <Banner tone="warn">{error}</Banner>}
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0]).finally(() => (e.target.value = ''))}
        />
        <input
          ref={upload}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0]).finally(() => (e.target.value = ''))}
        />
      </Card>

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
