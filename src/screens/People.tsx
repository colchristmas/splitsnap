import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { BalanceText } from '../components/BalanceText'
import { TextField } from '../components/fields'
import { PageTitle } from '../components/layouts'
import { Avatar, Button, Card, Empty, PersonChip, SectionTitle, Tile } from '../components/ui'
import { useBalances } from '../db/balances'
import { useGroups, usePeople } from '../db/hooks'
import { deleteGroup, findOrAddPerson, renamePerson, saveGroup } from '../db/people'
import type { Group } from '../lib/types'
import { AnimatedCents } from '../components/AnimatedCents'

export function People() {
  const people = usePeople().filter((p) => !p.archived)
  const groups = useGroups()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<Partial<Group> | null>(null)
  const { byPerson } = useBalances()
  const me = people.find((p) => p.isSelf)
  const open = (id: string) => byPerson.get(id)?.openCents ?? 0
  // People with something open first, biggest first; then everyone else by name.
  const others = people
    .filter((p) => !p.isSelf)
    .sort((a, b) => Math.abs(open(b.id)) - Math.abs(open(a.id)) || a.name.localeCompare(b.name))
  const owedToMe = [...byPerson.values()].reduce((a, b) => a + Math.max(0, b.openCents), 0)
  const iOwe = [...byPerson.values()].reduce((a, b) => a + Math.max(0, -b.openCents), 0)

  return (
    <>
      <PageTitle>People</PageTitle>

      {me && (
        <Card className="flex items-center gap-3">
          <Avatar person={me} />
          <div className="min-w-0 flex-1">
            <TextField value={me.name} onCommit={(n) => void renamePerson(me.id, n)} className="w-full font-semibold" aria-label="Your name" />
            <p className="px-2 text-xs text-stone-500">That's you. Your name appears in shared summaries.</p>
          </div>
        </Card>
      )}

      {(owedToMe > 0 || iOwe > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Tile tone="olive" square={false} className="min-h-28">
            <p className="text-sm">You're owed</p>
            <AnimatedCents cents={owedToMe} className="block text-3xl font-bold tracking-tight" />
          </Tile>
          <Tile tone="tan" square={false} className="min-h-28">
            <p className="text-sm">You owe</p>
            <AnimatedCents cents={iOwe} className="block text-3xl font-bold tracking-tight" />
          </Tile>
        </div>
      )}

      <SectionTitle>Saved people</SectionTitle>
      <Card className="px-2 py-1">
        <form
          className="flex gap-2 p-1"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newName.trim()) return
            await findOrAddPerson(newName)
            setNewName('')
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add a person"
            autoCapitalize="words"
            className="w-full rounded-full bg-stone-100 px-4 py-2 outline-none focus:ring-2 focus:ring-teal-600 dark:bg-stone-800"
          />
          <Button type="submit" variant="primary" size="sm" disabled={!newName.trim()} aria-label="Add person">
            <Plus size={18} />
          </Button>
        </form>
      </Card>
      {others.length === 0 ? (
        <Empty>People you add to receipts show up here.</Empty>
      ) : (
        <ul data-stagger className="mt-3 grid grid-cols-2 gap-3">
          {others.map((p) => {
            const b = byPerson.get(p.id)
            return (
              <li key={p.id}>
                <Tile to={`/people/${p.id}`}>
                  <Avatar person={p} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{p.name}</p>
                    {b ? <BalanceText cents={b.openCents} className="text-sm" /> : <span className="text-sm text-stone-500">No bills yet</span>}
                  </div>
                </Tile>
              </li>
            )
          })}
        </ul>
      )}

      <SectionTitle
        action={
          !editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing({ name: '', memberIds: [] })}>
              <Plus size={16} /> New group
            </Button>
          )
        }
      >
        Groups
      </SectionTitle>

      {editing && (
        <Card className="mb-3 grid gap-3">
          <input
            value={editing.name ?? ''}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="Group name, e.g. Roommates"
            autoFocus
            className="w-full rounded-full bg-stone-100 px-4 py-2 outline-none focus:ring-2 focus:ring-teal-600 dark:bg-stone-800"
          />
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = editing.memberIds?.includes(p.id) ?? false
              return (
                <PersonChip
                  key={p.id}
                  person={p}
                  selected={on}
                  onClick={() =>
                    setEditing({
                      ...editing,
                      memberIds: on ? editing.memberIds!.filter((id) => id !== p.id) : [...(editing.memberIds ?? []), p.id],
                    })
                  }
                />
              )
            })}
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={!editing.name?.trim() || !editing.memberIds?.length}
              onClick={async () => {
                await saveGroup({ id: editing.id, name: editing.name!, memberIds: editing.memberIds! })
                setEditing(null)
              }}
            >
              Save group
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {groups.length === 0 && !editing ? (
        <Empty>Save a group like “Roommates” to add everyone in one tap.</Empty>
      ) : (
        <div data-stagger className="grid grid-cols-2 gap-3">
          {groups.map((g) => (
            <Tile key={g.id} tone="olive" square={false} className="min-h-36">
              <div className="flex items-start justify-between">
                <Users size={22} />
                <div className="-mt-1.5 -mr-1.5 flex">
                  <button type="button" onClick={() => setEditing(g)} className="rounded-full p-1.5 hover:bg-white/15" aria-label={`Edit ${g.name}`}>
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete the group “${g.name}”? The people stay saved.`)) void deleteGroup(g.id)
                    }}
                    className="rounded-full p-1.5 hover:bg-white/15"
                    aria-label={`Delete ${g.name}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{g.name}</p>
                <div className="mt-1.5 flex -space-x-1.5">
                  {g.memberIds.map((id) => (
                    <Avatar key={id} person={people.find((p) => p.id === id)} size="sm" />
                  ))}
                </div>
              </div>
            </Tile>
          ))}
        </div>
      )}
    </>
  )
}
