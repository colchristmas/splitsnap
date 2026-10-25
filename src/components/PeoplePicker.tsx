import { Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { findOrAddPerson } from '../db/people'
import { useGroups, usePeople } from '../db/hooks'
import { PersonChip, cx } from './ui'

/**
 * Adds people to a receipt: saved people (most recent first), whole groups,
 * or a new name, which is saved for next time.
 */
export function PeoplePicker({ exclude, onAdd }: { exclude: string[]; onAdd: (ids: string[]) => void }) {
  const [query, setQuery] = useState('')
  const people = usePeople().filter((p) => !p.archived && !exclude.includes(p.id))
  const groups = useGroups().filter((g) => g.memberIds.some((id) => !exclude.includes(id)))

  const q = query.trim().toLowerCase()
  const matches = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people
  const exact = people.find((p) => p.name.toLowerCase() === q)

  const addNew = async () => {
    if (!q) return
    const person = exact ?? (await findOrAddPerson(query))
    onAdd([person.id])
    setQuery('')
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void addNew()
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add someone…"
          autoCapitalize="words"
          className="w-full rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-300 outline-none focus:ring-2 focus:ring-teal-600 dark:bg-stone-900 dark:ring-stone-700"
        />
        <button
          type="submit"
          disabled={!q}
          className="rounded-xl bg-teal-700 px-3 text-white disabled:bg-stone-300 dark:disabled:bg-stone-800"
          aria-label="Add person"
        >
          <Plus size={20} />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {!q &&
          groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onAdd(g.memberIds.filter((id) => !exclude.includes(id)))}
              className="inline-flex items-center gap-1.5 rounded-full bg-stone-200 px-3 py-1 text-sm font-medium dark:bg-stone-800"
            >
              <Users size={14} /> {g.name}
            </button>
          ))}
        {matches.slice(0, 12).map((p) => (
          <PersonChip
            key={p.id}
            person={p}
            onClick={() => {
              onAdd([p.id])
              setQuery('')
            }}
          />
        ))}
        {q && !exact && (
          <button
            type="button"
            onClick={() => void addNew()}
            className={cx('rounded-full px-3 py-1 text-sm font-medium text-teal-800 ring-1 ring-teal-600 dark:text-teal-300')}
          >
            + Add “{query.trim()}”
          </button>
        )}
      </div>
    </div>
  )
}
