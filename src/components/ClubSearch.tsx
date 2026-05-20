'use client'

import { useState, useRef, useEffect } from 'react'
import { GOLF_CLUBS } from '@/lib/clubs'
import type { GolfClub } from '@/lib/types'

interface ClubSearchProps {
  value: GolfClub | null
  onChange: (club: GolfClub) => void
}

export function ClubSearch({ value, onChange }: ClubSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.length < 1
    ? GOLF_CLUBS.slice(0, 20)
    : GOLF_CLUBS.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 20)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder={value ? value.name : 'Sök golfklubb…'}
        value={open ? query : value?.name || ''}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        className="w-full bg-[var(--gb-bg-input)] border border-[var(--gb-border)] rounded-[var(--gb-radius-md)] px-4 py-3 text-[var(--gb-fg)] placeholder-[var(--gb-fg-soft)] focus:outline-none focus:border-[var(--gb-fairway)] transition-colors duration-[var(--gb-dur-fast)]"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-[var(--gb-bg)] border border-[var(--gb-border)] rounded-[var(--gb-radius-xl)] overflow-hidden shadow-[var(--gb-shadow-lg)] max-h-64 overflow-y-auto">
          {filtered.map((club) => (
            <button
              key={club.id}
              type="button"
              onClick={() => {
                onChange(club)
                setQuery('')
                setOpen(false)
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-[var(--gb-fairway)]/10 transition-colors duration-[var(--gb-dur-fast)] text-sm text-[var(--gb-fg-muted)] hover:text-[var(--gb-fg)]"
            >
              {club.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
