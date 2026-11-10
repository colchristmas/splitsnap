// All motion in the app goes through here (anime.js), so it shares one feel
// and one reduced-motion switch.
import { animate, spring, utils, type JSAnimation } from 'animejs'
import { useEffect, useLayoutEffect, useRef, type DOMAttributes, type RefObject } from 'react'

/** The OS "reduce motion" setting. When it's on, nothing animates. */
export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// In a long list, rows past this one come in together instead of trickling in.
const MAX_STAGGERED = 10
// Only this many elements animate per batch; the rest (off screen) just appear.
const MAX_ANIMATED = 40

function clearMotionStyles(el: HTMLElement) {
  el.style.removeProperty('opacity')
  el.style.removeProperty('transform')
}

/** Fades elements in and springs them up into place, one after another. */
export function enter(targets: HTMLElement[], { distance = 14, gap = 40 } = {}): JSAnimation | undefined {
  targets = targets.slice(0, MAX_ANIMATED)
  if (targets.length === 0 || reducedMotion()) return
  const anim = animate(targets, {
    opacity: { from: 0, to: 1, duration: 320, ease: 'outQuad' },
    translateY: { from: distance, to: 0, ease: spring({ bounce: 0.3, duration: 550 }) },
    delay: (_: unknown, i = 0) => Math.min(i, MAX_STAGGERED) * gap,
    onComplete: () => targets.forEach(clearMotionStyles),
  })
  // Keep them hidden until their turn. This must come after animate(), which
  // records the inline styles it finds and would otherwise restore these.
  for (const el of targets) {
    el.style.opacity = '0'
    el.style.transform = `translateY(${distance}px)`
  }
  return anim
}

/**
 * Animates content into `ref`'s element: its children when it mounts, then
 * every element added later, either as a direct child (the next screen, a
 * section that finished loading) or as a row of a list marked `data-stagger`.
 * Fixed bars are left alone; they bring their own motion.
 */
export function useEnterAnimations(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || reducedMotion()) return
    const running = new Set<JSAnimation>()

    const play = (added: Element[]) => {
      const targets: HTMLElement[] = []
      for (const el of added) {
        if (!(el instanceof HTMLElement) || getComputedStyle(el).position === 'fixed') continue
        targets.push(el)
        const lists = [...(el.matches('[data-stagger]') ? [el] : []), ...el.querySelectorAll('[data-stagger]')]
        for (const list of lists) for (const row of list.children) if (row instanceof HTMLElement) targets.push(row)
      }
      const anim = enter(targets)
      if (anim) {
        running.add(anim)
        void anim.then(() => running.delete(anim))
      }
    }

    play([...root.children])
    // Mutation callbacks run before the browser paints, so new content never
    // flashes in at full opacity first.
    const observer = new MutationObserver((records) => {
      const added: Element[] = []
      for (const r of records) {
        const parent = r.target
        if (parent !== root && !(parent instanceof HTMLElement && parent.hasAttribute('data-stagger'))) continue
        for (const node of r.addedNodes) if (node instanceof HTMLElement && node.isConnected) added.push(node)
      }
      if (added.length) play(added)
    })
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      for (const anim of running) anim.revert()
    }
  }, [ref])
}

/**
 * Slowly drifts, turns and swells every `[data-drift]` element inside `ref`,
 * back and forth on its own long, uneven cycle, like leaves on water.
 */
export function useDrift(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current
    if (!root || reducedMotion()) return
    const anims = [...root.querySelectorAll<HTMLElement>('[data-drift]')].map((el, i) =>
      animate(el, {
        translateX: utils.random(-70, 70),
        translateY: utils.random(-60, 60),
        rotate: utils.random(-30, 30),
        scale: utils.random(0.88, 1.18, 2),
        duration: utils.random(15000, 24000),
        delay: i * 1200,
        ease: 'inOutSine',
        loop: true,
        alternate: true,
      }),
    )
    return () => anims.forEach((a) => a.revert())
  }, [ref])
}

/** Animates an element in when it mounts: a fade with a small spring. */
export function useEnter(ref: RefObject<HTMLElement | null>, distance = 14) {
  useLayoutEffect(() => {
    const anim = ref.current && enter([ref.current], { distance })
    return () => void anim?.revert()
  }, [ref, distance])
}

/** Pops an element in when it mounts, for banners and notices. */
export function usePopIn(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || reducedMotion()) return
    const anim = animate(el, {
      opacity: { from: 0, to: 1, duration: 220, ease: 'outQuad' },
      scale: { from: 0.94, to: 1, ease: spring({ bounce: 0.45, duration: 450 }) },
      onComplete: () => clearMotionStyles(el),
    })
    el.style.opacity = '0'
    return () => void anim.revert()
  }, [ref])
}

/**
 * Springs an element when `value` changes (not on first render), such as a
 * chip being toggled or a tab becoming active. `when` limits it to some
 * changes, e.g. only when a tab becomes active.
 */
export function usePop(ref: RefObject<HTMLElement | null>, value: unknown, { from = 0.82, when = true } = {}) {
  const previous = useRef(value)
  useEffect(() => {
    if (Object.is(previous.current, value)) return
    previous.current = value
    const el = ref.current
    if (!el || !when || reducedMotion()) return
    animate(el, {
      scale: { from, to: 1, ease: spring({ bounce: 0.55, duration: 500 }) },
      onComplete: () => el.style.removeProperty('transform'),
    })
  }, [ref, value, from, when])
}

type PressHandlers<T> = Pick<DOMAttributes<T>, 'onPointerDown' | 'onPointerUp' | 'onPointerLeave' | 'onPointerCancel'>
const pressed = new WeakSet<HTMLElement>()

/**
 * Adds press feedback to an element's pointer handlers: it squashes while
 * held and springs back when let go. Pass the element's own handlers to keep
 * them working.
 */
export function withPress<T extends HTMLElement>(own: PressHandlers<T> = {}, depth = 0.95): PressHandlers<T> {
  const release = (el: T) => {
    if (!pressed.delete(el)) return
    animate(el, {
      scale: 1,
      ease: spring({ bounce: 0.5, duration: 400 }),
      onComplete: () => el.style.removeProperty('transform'),
    })
  }
  return {
    onPointerDown: (e) => {
      own.onPointerDown?.(e)
      const el = e.currentTarget
      if ((el as unknown as HTMLButtonElement).disabled || reducedMotion()) return
      pressed.add(el)
      animate(el, { scale: depth, duration: 110, ease: 'outQuad' })
    },
    onPointerUp: (e) => (own.onPointerUp?.(e), release(e.currentTarget)),
    onPointerLeave: (e) => (own.onPointerLeave?.(e), release(e.currentTarget)),
    onPointerCancel: (e) => (own.onPointerCancel?.(e), release(e.currentTarget)),
  }
}

/**
 * Slides `indicator` behind the active link in `container` (the element
 * matching `anchor`, by default the link with aria-current="page") whenever
 * `key` changes, and hides it when nothing is active. `pad` grows it past the
 * anchor's edges.
 */
export function useSlidingIndicator(
  container: RefObject<HTMLElement | null>,
  indicator: RefObject<HTMLElement | null>,
  key: string,
  { anchor = '[aria-current="page"]', pad = { x: 0, y: 0 } } = {},
) {
  const shown = useRef(false)
  const { x: padX, y: padY } = pad
  useLayoutEffect(() => {
    const box = container.current
    const pill = indicator.current
    if (!box || !pill) return

    const place = (animated: boolean) => {
      const target = box.querySelector(anchor)
      if (!target) {
        // The indicator's CSS transition fades it out.
        utils.set(pill, { opacity: 0 })
        shown.current = false
        return
      }
      const outer = box.getBoundingClientRect()
      const inner = target.getBoundingClientRect()
      const slide = {
        translateX: inner.left - outer.left - box.clientLeft - padX,
        width: inner.width + padX * 2,
      }
      utils.set(pill, {
        top: inner.top - outer.top - box.clientTop - padY,
        height: inner.height + padY * 2,
        opacity: 1,
      })
      // Coming back from hidden, appear in place rather than slide in from
      // wherever it was last.
      if (animated && shown.current && !reducedMotion()) {
        animate(pill, { ...slide, ease: spring({ bounce: 0.3, duration: 500 }) })
      } else {
        utils.set(pill, slide)
      }
      shown.current = true
    }

    place(true)
    // Re-measure, without animating, when the container's width changes
    // (rotation, window resize). The first callback only reports the current
    // size, so it's skipped.
    let width = box.offsetWidth
    const resize = new ResizeObserver(() => {
      if (box.offsetWidth === width) return
      width = box.offsetWidth
      place(false)
    })
    resize.observe(box)
    return () => resize.disconnect()
  }, [container, indicator, key, anchor, padX, padY])
}
