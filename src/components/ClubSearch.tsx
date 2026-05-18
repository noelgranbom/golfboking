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
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-green-500 transition-colors"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-[#0f2a0f] border border-white/10 rounded-xl overflow-hidden shadow-2xl max-h-64 overflow-y-auto">
          {filtered.map((club) => (
            <button
              key={club.id}
              type="button"
              onClick={() => {
                onChange(club)
                setQuery('')
                setOpen(false)
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-green-500/10 transition-colors text-sm text-white/80 hover:text-white"
            >
              {club.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
