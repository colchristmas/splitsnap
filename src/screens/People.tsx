import { Pencil, Plus, Trash2, UserMinus, Users } from 'lucide-react'
import { useState } from 'react'
import { TextField } from '../components/fields'
import { PageTitle } from '../components/layouts'
import { Avatar, Button, Card, Empty, PersonChip, SectionTitle } from '../components/ui'
import { useGroups, usePeople } from '../db/hooks'
import { archivePerson, deleteGroup, findOrAddPerson, renamePerson, saveGroup } from '../db/people'
import type { Group } from '../lib/types'

export function People() {
  const people = usePeople().filter((p) => !p.archived)
  const groups = useGroups()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<Partial<Group> | null>(null)
  const me = people.find((p) => p.isSelf)
  const others = people.filter((p) => !p.isSelf).sort((a, b) => a.name.localeCompare(b.name))

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
            className="w-full rounded-lg bg-stone-100 px-3 py-2 outline-none focus:ring-2 focus:ring-teal-600 dark:bg-stone-800"
          />
          <Button type="submit" variant="primary" size="sm" disabled={!newName.trim()} aria-label="Add person">
            <Plus size={18} />
          </Button>
        </form>
        {others.length === 0 ? (
          <Empty>People you add to receipts show up here.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100 dark:divide-stone-800">
            {others.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1.5 pl-1">
                <Avatar person={p} size="sm" />
                <TextField value={p.name} onCommit={(n) => void renamePerson(p.id, n)} className="flex-1" aria-label={`Name of ${p.name}`} />
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Remove ${p.name}? Past receipts will still show their name.`)) void archivePerson(p.id)
                  }}
                  className="p-2 text-stone-400 hover:text-red-600"
                  aria-label={`Remove ${p.name}`}
                >
                  <UserMinus size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
            className="w-full rounded-lg bg-stone-100 px-3 py-2 outline-none focus:ring-2 focus:ring-teal-600 dark:bg-stone-800"
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
        <div className="grid gap-2">
          {groups.map((g) => (
            <Card key={g.id} className="flex items-center gap-3">
              <Users size={20} className="shrink-0 text-stone-400" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{g.name}</p>
                <div className="mt-1 flex -space-x-1.5">
                  {g.memberIds.map((id) => (
                    <Avatar key={id} person={people.find((p) => p.id === id)} size="sm" />
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => setEditing(g)} className="p-2 text-stone-400 hover:text-teal-700" aria-label={`Edit ${g.name}`}>
                <Pencil size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete the group “${g.name}”? The people stay saved.`)) void deleteGroup(g.id)
                }}
                className="p-2 text-stone-400 hover:text-red-600"
                aria-label={`Delete ${g.name}`}
              >
                <Trash2 size={18} />
              </button>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
