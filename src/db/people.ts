import type { Group, Person } from '../lib/types'
import { db, newId } from './schema'

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']

/** Creates the "Me" person on first run and returns it. */
export async function ensureSelf(): Promise<Person> {
  return db.transaction('rw', db.people, async () => {
    const existing = await db.people.filter((p) => Boolean(p.isSelf)).first()
    if (existing) return existing
    const now = Date.now()
    const me: Person = { id: newId(), name: 'Me', color: '#0f766e', isSelf: true, createdAt: now, lastUsedAt: now }
    await db.people.add(me)
    return me
  })
}

/** Returns a saved person with this name (case-insensitive), creating one if needed. */
export async function findOrAddPerson(name: string): Promise<Person> {
  const clean = name.trim()
  const lower = clean.toLowerCase()
  const match = await db.people.filter((p) => p.name.toLowerCase() === lower).first()
  if (match) {
    if (match.archived) await db.people.update(match.id, { archived: false })
    return { ...match, archived: false }
  }
  const count = await db.people.count()
  const now = Date.now()
  const person: Person = { id: newId(), name: clean, color: COLORS[count % COLORS.length], createdAt: now, lastUsedAt: now }
  await db.people.add(person)
  return person
}

export async function touchPeople(ids: string[]) {
  const now = Date.now()
  await db.people.bulkUpdate(ids.map((key) => ({ key, changes: { lastUsedAt: now } })))
}

export async function renamePerson(id: string, name: string) {
  if (name.trim()) await db.people.update(id, { name: name.trim() })
}

/** Hides a person from pickers; past receipts keep showing their name. */
export async function archivePerson(id: string) {
  await db.transaction('rw', db.people, db.groups, async () => {
    await db.people.update(id, { archived: true })
    await db.groups.toCollection().modify((g) => {
      g.memberIds = g.memberIds.filter((m) => m !== id)
    })
  })
}

export async function saveGroup(group: Omit<Group, 'id' | 'createdAt'> & { id?: string }) {
  const id = group.id ?? newId()
  const existing = group.id ? await db.groups.get(group.id) : undefined
  await db.groups.put({ id, name: group.name.trim(), memberIds: group.memberIds, createdAt: existing?.createdAt ?? Date.now() })
  return id
}

export async function deleteGroup(id: string) {
  await db.groups.delete(id)
}
