import { RotateCcw } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SavedShareText } from '../lib/types'
import { Banner, Button, Card, SectionTitle } from './ui'

/**
 * The message a Share button sends: the generated text until the user edits
 * it, then their version. Edits are saved (debounced) through `onSave` when
 * given; `outdated` means the split changed after they started editing.
 */
export function useShareDraft(generated: string, saved?: SavedShareText, onSave?: (s: SavedShareText | undefined) => void) {
  // null = follow what's saved; otherwise the user's latest edit (undefined = reset).
  const [local, setLocal] = useState<{ value: SavedShareText | undefined } | null>(null)
  const pending = useRef<{ value: SavedShareText | undefined } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const flush = () => {
    clearTimeout(timer.current)
    if (pending.current) onSave?.(pending.current.value)
    pending.current = null
  }
  // Leaving the screen mid-edit still saves the last keystrokes.
  useEffect(() => () => flush(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const current = local ? local.value : saved
  const save = (value: SavedShareText | undefined, now = false) => {
    setLocal({ value })
    pending.current = { value }
    clearTimeout(timer.current)
    if (now) flush()
    else timer.current = setTimeout(flush, 400)
  }

  return {
    text: current?.text ?? generated,
    edited: Boolean(current),
    outdated: Boolean(current && current.base !== generated),
    setText: (text: string) => save(text === generated ? undefined : { text, base: current?.base ?? generated }),
    reset: () => save(undefined, true),
  }
}

export function ShareTextBox({
  draft,
  hint,
}: {
  draft: ReturnType<typeof useShareDraft>
  hint: string
}) {
  // Grow to fit the whole message (including wrapped lines), so it never
  // scrolls inside its own box on a phone.
  const area = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [draft.text])

  return (
    <>
      <SectionTitle
        action={
          draft.edited && (
            <Button variant="ghost" size="sm" onClick={draft.reset}>
              <RotateCcw size={16} /> Reset
            </Button>
          )
        }
      >
        Message to share
      </SectionTitle>
      {draft.outdated && (
        <div className="mb-2">
          <Banner tone="warn">The split changed after you edited this message. Reset to get the new amounts.</Banner>
        </div>
      )}
      <Card className="p-1!">
        <textarea
          ref={area}
          value={draft.text}
          onChange={(e) => draft.setText(e.target.value)}
          rows={4}
          aria-label="Message to share"
          className="w-full resize-none overflow-hidden rounded-xl bg-transparent px-3 py-2 leading-relaxed outline-none focus:ring-2 focus:ring-teal-600"
        />
      </Card>
      <p className="mt-1 px-1 text-xs text-stone-500">{hint}</p>
    </>
  )
}
