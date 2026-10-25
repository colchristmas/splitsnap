import { Check, Download, HardDrive, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PageTitle } from '../components/layouts'
import { Banner, Button, Card, SectionTitle, Segmented, cx } from '../components/ui'
import { clearAllData, exportBackup, importBackup } from '../db/backup'
import { ensureSelf } from '../db/people'
import { setSetting, useSetting } from '../db/settings'
import { OCR_MODELS, isModelDownloaded, prepareEngine, pruneModels, type OcrModel, type OcrProgress } from '../lib/ocr/engine'

export function Settings() {
  return (
    <>
      <PageTitle>Settings</PageTitle>
      <ScannerSettings />
      <StorageSettings />
      <BackupSettings />
      <p className="mt-8 text-center text-xs text-stone-500">
        SplitSnap keeps everything on this device. Nothing is uploaded anywhere.
      </p>
    </>
  )
}

function ScannerSettings() {
  const model = useSetting('ocrModel')
  const [ready, setReady] = useState<boolean>()
  const [progress, setProgress] = useState<OcrProgress>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    void isModelDownloaded(model).then(setReady)
  }, [model])

  const download = async () => {
    setError(undefined)
    try {
      await prepareEngine(model, setProgress)
      setReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProgress(undefined)
    }
  }

  return (
    <>
      <SectionTitle>Scanner</SectionTitle>
      <Card className="grid gap-3">
        <Segmented<OcrModel>
          value={model}
          options={(Object.keys(OCR_MODELS) as OcrModel[]).map((m) => ({
            value: m,
            label: `${OCR_MODELS[m].label} · ${OCR_MODELS[m].sizeMB} MB`,
          }))}
          onChange={async (m) => {
            await setSetting('ocrModel', m)
            await pruneModels(m)
          }}
        />
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {model === 'accurate'
            ? 'Reads faded and crumpled receipts best. A bit slower on older phones.'
            : 'About three times faster with a smaller download. Expect a few more typos to fix.'}
        </p>
        {ready ? (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
            <Check size={16} /> Downloaded and ready offline
          </p>
        ) : (
          <Button size="sm" className="justify-self-start" disabled={Boolean(progress)} onClick={() => void download()}>
            <Download size={16} />
            {progress?.stage === 'download'
              ? `Downloading… ${Math.round((progress.loaded / (progress.total || 1)) * 100)}%`
              : progress
                ? 'Starting…'
                : 'Download now for offline use'}
          </Button>
        )}
        {error && <Banner tone="warn">{error}</Banner>}
      </Card>
    </>
  )
}

function StorageSettings() {
  const [persisted, setPersisted] = useState<boolean>()
  const [usage, setUsage] = useState<string>()

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
    void navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1e6).toFixed(1)} MB used`))
  }, [])

  return (
    <>
      <SectionTitle>Storage</SectionTitle>
      <Card className="grid gap-3">
        <p className="flex items-center gap-2 text-sm">
          <HardDrive size={16} className="text-stone-400" />
          {usage ?? 'Checking…'}
          {persisted !== undefined && (
            <span className={cx('ml-auto font-medium', persisted ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}>
              {persisted ? 'Protected' : 'Not protected'}
            </span>
          )}
        </p>
        {persisted === false && (
          <>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Your browser may clear SplitSnap's data if space runs low or, on iPhone, if the app isn't opened for about a
              week. Add it to your Home Screen (Share → Add to Home Screen) and export a backup now and then.
            </p>
            <Button size="sm" className="justify-self-start" onClick={() => void navigator.storage.persist().then(setPersisted)}>
              Ask to keep my data
            </Button>
          </>
        )}
      </Card>
    </>
  )
}

function BackupSettings() {
  const [photos, setPhotos] = useState(true)
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string }>()
  const fileInput = useRef<HTMLInputElement>(null)

  const doExport = async () => {
    const blob = await exportBackup(photos)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `splitsnap-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const doImport = async (file: File | undefined) => {
    if (!file) return
    const replace = confirm(
      'Replace everything on this device with the backup?\n\nOK = replace. Cancel = merge the backup into what is already here.',
    )
    try {
      await importBackup(await file.text(), replace ? 'replace' : 'merge')
      await ensureSelf()
      setMessage({ tone: 'ok', text: replace ? 'Backup restored.' : 'Backup merged.' })
    } catch (e) {
      setMessage({ tone: 'warn', text: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <>
      <SectionTitle>Backup</SectionTitle>
      <Card className="grid gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-teal-700" checked={photos} onChange={(e) => setPhotos(e.target.checked)} />
          Include receipt photos (bigger file)
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void doExport()}>
            <Download size={16} /> Export backup
          </Button>
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            <Upload size={16} /> Import backup
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void doImport(e.target.files?.[0]).finally(() => (e.target.value = ''))}
          />
        </div>
        {message && <Banner tone={message.tone}>{message.text}</Banner>}
        <Button
          variant="danger"
          size="sm"
          className="justify-self-start"
          onClick={async () => {
            if (!confirm('Delete all people, groups and receipts on this device? This cannot be undone.')) return
            await clearAllData()
            await ensureSelf()
            setMessage({ tone: 'ok', text: 'All data deleted.' })
          }}
        >
          Delete all data
        </Button>
      </Card>
    </>
  )
}
