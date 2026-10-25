import { X } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { Stepper } from '../components/fields'
import { CategorySelect } from '../components/CategorySelect'
import { ActionBar, useReceiptContext } from '../components/layouts'
import { PeoplePicker } from '../components/PeoplePicker'
import { Banner, Button, Card, PersonChip, SectionTitle, Segmented } from '../components/ui'
import { setItemCategory } from '../db/categories'
import { usePeopleById } from '../db/hooks'
import { touchPeople } from '../db/people'
import { updateReceipt } from '../db/receipts'
import { formatCents } from '../lib/money'
import { itemNetCents, split } from '../lib/split'
import type { Item, Person, Receipt } from '../lib/types'

export function Assign() {
  const receipt = useReceiptContext()
  const navigate = useNavigate()
  const byId = usePeopleById()
  const result = useMemo(() => split(receipt), [receipt])
  const update = (change: (r: Receipt) => void) => void updateReceipt(receipt.id, change)
  const participants = receipt.participantIds

  const addPeople = (ids: string[]) => {
    update((r) => void (r.participantIds = [...new Set([...r.participantIds, ...ids])]))
    void touchPeople(ids)
  }
  const removePerson = (id: string) =>
    update((r) => {
      r.participantIds = r.participantIds.filter((p) => p !== id)
      if (r.payerId === id && r.participantIds[0]) r.payerId = r.participantIds[0]
      for (const item of r.items) delete item.shares[id]
    })
  const changeItem = (id: string, change: (i: Item) => void) =>
    update((r) => {
      const item = r.items.find((i) => i.id === id)
      if (item) change(item)
    })
  const assignRest = (ids: string[]) =>
    update((r) => {
      const left = new Set(split(r).unassignedItemIds)
      for (const item of r.items) {
        if (!left.has(item.id)) continue
        item.byUnits = false
        item.shares = Object.fromEntries(ids.map((id) => [id, 1]))
      }
    })

  const unassigned = result.unassignedItemIds.length

  return (
    <>
      <SectionTitle>Who's splitting</SectionTitle>
      <Card className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {participants.map((id) => (
            <PersonChip
              key={id}
              person={byId.get(id)}
              selected
              onClick={participants.length > 1 ? () => removePerson(id) : undefined}
              trailing={participants.length > 1 && <X size={14} aria-label="Remove" />}
            />
          ))}
        </div>
        <PeoplePicker exclude={participants} onAdd={addPeople} />
      </Card>

      {participants.length > 1 && (
        <>
          <SectionTitle>Paid by</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {participants.map((id) => (
              <PersonChip key={id} person={byId.get(id)} selected={receipt.payerId === id} onClick={() => update((r) => void (r.payerId = id))} />
            ))}
          </div>
        </>
      )}

      <SectionTitle>Who had what</SectionTitle>
      {unassigned > 0 && participants.length > 0 && (
        <Card className="mb-3 grid gap-2">
          <p className="text-sm">
            <strong>{unassigned}</strong> {unassigned === 1 ? 'item needs' : 'items need'} someone. Give the rest to:
          </p>
          <div className="flex flex-wrap gap-2">
            {participants.length > 1 && (
              <Button size="sm" variant="primary" onClick={() => assignRest(participants)}>
                Everyone
              </Button>
            )}
            {participants.map((id) => (
              <PersonChip key={id} person={byId.get(id)} onClick={() => assignRest([id])} />
            ))}
          </div>
        </Card>
      )}
      <div className="grid gap-3">
        {receipt.items.map((item) => (
          <ItemAssign
            key={item.id}
            item={item}
            people={participants.map((id) => byId.get(id) ?? { id, name: 'Unknown', color: '#a8a29e' })}
            onChange={(change) => changeItem(item.id, change)}
            onCategory={(id) => void setItemCategory(receipt.id, item.id, id)}
          />
        ))}
      </div>

      <ActionBar>
        <Button variant="primary" size="lg" disabled={unassigned > 0} onClick={() => navigate('../split')}>
          {unassigned > 0 ? `${unassigned} left to assign` : 'Next: see the split'}
        </Button>
      </ActionBar>
    </>
  )
}

function ItemAssign({
  item,
  people,
  onChange,
  onCategory,
}: {
  item: Item
  people: Pick<Person, 'id' | 'name' | 'color'>[]
  onChange: (change: (i: Item) => void) => void
  onCategory: (categoryId: string) => void
}) {
  const assigned = people.reduce((a, p) => a + (item.shares[p.id] ?? 0), 0)
  const done = item.byUnits ? assigned >= item.quantity : assigned > 0
  const everyone = people.length > 1 && people.every((p) => item.shares[p.id])

  return (
    <Card className={done ? undefined : 'ring-2 ring-amber-400 dark:ring-amber-600'}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 font-medium">
          {item.name || 'Item'}
          {item.quantity > 1 && <span className="text-stone-500"> ×{item.quantity}</span>}
        </p>
        <span className="font-semibold tabular-nums">{formatCents(itemNetCents(item))}</span>
      </div>
      <CategorySelect
        kind="item"
        value={item.categoryId}
        onChange={onCategory}
        label={`Category of ${item.name}`}
        className="mt-1 max-w-full px-1.5 py-0.5 text-xs text-stone-600 dark:text-stone-300"
      />

      {item.quantity > 1 && (
        <div className="mt-2">
          <Segmented
            size="sm"
            value={item.byUnits ? 'units' : 'equal'}
            options={[
              { value: 'equal', label: 'Split equally' },
              { value: 'units', label: 'By units' },
            ]}
            onChange={(v) =>
              onChange((i) => {
                i.byUnits = v === 'units'
                i.shares = {}
              })
            }
          />
        </div>
      )}

      {item.byUnits ? (
        <ul className="mt-3 grid gap-2">
          {people.map((p) => {
            const mine = item.shares[p.id] ?? 0
            return (
              <li key={p.id} className="flex items-center justify-between">
                <PersonChip person={p} selected={mine > 0} />
                <Stepper
                  value={mine}
                  max={mine + Math.max(0, item.quantity - assigned)}
                  label={`units for ${p.name}`}
                  onChange={(v) =>
                    onChange((i) => {
                      if (v > 0) i.shares[p.id] = v
                      else delete i.shares[p.id]
                    })
                  }
                />
              </li>
            )
          })}
          <li className="text-xs text-stone-500">
            {assigned} of {item.quantity} assigned
          </li>
        </ul>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {people.map((p) => (
            <PersonChip
              key={p.id}
              person={p}
              selected={Boolean(item.shares[p.id])}
              onClick={() =>
                onChange((i) => {
                  if (i.shares[p.id]) delete i.shares[p.id]
                  else i.shares[p.id] = 1
                })
              }
            />
          ))}
          {people.length > 1 && (
            <button
              type="button"
              onClick={() => onChange((i) => void (i.shares = everyone ? {} : Object.fromEntries(people.map((p) => [p.id, 1]))))}
              className="rounded-full px-3 py-1 text-sm font-medium text-teal-800 ring-1 ring-teal-600 dark:text-teal-300"
            >
              {everyone ? 'Clear' : 'Everyone'}
            </button>
          )}
        </div>
      )}
      {!done && people.length === 0 && <Banner tone="info">Add people above first.</Banner>}
    </Card>
  )
}
