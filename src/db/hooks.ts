import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import type { Person } from '../lib/types'
import { db } from './schema'

/** undefined while loading, null when the receipt doesn't exist. */
export function useReceipt(id: string | undefined) {
  return useLiveQuery(async () => (id ? ((await db.receipts.get(id)) ?? null) : null), [id])
}

/** All people (including archived, for old receipts), most recently used first. */
export function usePeople(): Person[] {
  return useLiveQuery(() => db.people.orderBy('lastUsedAt').reverse().toArray(), []) ?? []
}

export function usePeopleById() {
  const people = usePeople()
  return useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
}

export function useGroups() {
  return useLiveQuery(() => db.groups.toArray(), []) ?? []
}

/** An object URL for a stored photo, revoked when the component unmounts or the photo changes. */
export function useImageUrl(imageId: string | undefined) {
  const image = useLiveQuery(async () => (imageId ? await db.images.get(imageId) : undefined), [imageId])
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!image) return setUrl(undefined)
    const u = URL.createObjectURL(image.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [image])
  return url
}
