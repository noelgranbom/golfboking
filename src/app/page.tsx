'use client'

import { useState, useEffect } from 'react'
import { StepIndicator } from '@/components/StepIndicator'
import { ClubSearch } from '@/components/ClubSearch'
import { Dashboard } from '@/components/Dashboard'
import type { Job, GolfClub, JobMode, CreateJobInput } from '@/lib/types'

const STEPS = ['Inloggning', 'Sök tid', 'Aktivera']

interface FormData {
  email: string
  golf_id: string
  golf_password: string
  club: GolfClub | null
  date: string
  time_from: string
  time_to: string
  num_players: number
  friend_golf_ids: string[]
  mode: JobMode
}

const DEFAULT_FORM: FormData = {
  email: '',
  golf_id: '',
  golf_password: '',
  club: null,
  date: '',
  time_from: '07:00',
  time_to: '12:00',
  num_players: 1,
  friend_golf_ids: [],
  mode: 'notify',
}

export default function Home() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(DEFAULT_FORM)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [friendInput, setFriendInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    fetchJobs()
  }, [])

  async function fetchJobs() {
    const res = await fetch('/api/jobs')
    if (res.ok) setJobs(await res.json())
  }

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function addFriend() {
    const id = friendInput.trim()
    if (id && !form.friend_golf_ids.includes(id)) {
      set('friend_golf_ids', [...form.friend_golf_ids, id])
    }
    setFriendInput('')
  }

  function removeFriend(id: string) {
    set('friend_golf_ids', form.friend_golf_ids.filter((f) => f !== id))
  }

  async function handleActivate() {
    if (!form.club) return
    setLoading(true)

    const payload: CreateJobInput = {
      email: form.email,
      golf_id: form.golf_id,
      golf_password: form.golf_password,
      club_id: form.club.id,
      club_name: form.club.name,
      date: form.date,
      time_from: form.time_from,
      time_to: form.time_to,
      num_players: form.num_players,
      friend_golf_ids: form.friend_golf_ids,
      mode: form.mode,
    }

    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const job = await res.json()
      setJobs((prev) => [job, ...prev])
      setForm(DEFAULT_FORM)
      setStep(1)
    }

    setLoading(false)
  }

  const step1Valid = form.email && form.golf_id && form.golf_password
  const step2Valid = form.club && form.date && form.time_from && form.time_to

  const today = new Date().toISOString().split('T')[0]

  return (
    <main className="min-h-screen py-10 px-4">
      <div className="max-w-lg mx-auto">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-3">⛳</div>
          <h1 className="text-4xl font-semibold text-[#e8f1ea]" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', letterSpacing: '-0.5px' }}>Golfboking</h1>
          <div className="flex items-center justify-center gap-3 my-2.5">
            <div className="h-px flex-1 max-w-16 bg-gold/60" />
            <div className="w-1 h-1 rounded-full bg-gold/60" />
            <div className="h-px flex-1 max-w-16 bg-gold/60" />
          </div>
          <p className="text-[#e8f1ea]/40 text-sm">Automatisk bevakare för MinGolf</p>
        </div>

        {/* Form card */}
        <div className="bg-white/3 border border-white/8 rounded-2xl p-6 mb-8">
          <StepIndicator currentStep={step} steps={STEPS} />

          {/* Step 1 — Login */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold text-lg mb-5">Dina uppgifter</h2>

              <div>
                <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">E-post</label>
                <input
                  type="email"
                  placeholder="din@email.se"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-gold transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">Golf-ID</label>
                <input
                  type="text"
                  placeholder="123456"
                  value={form.golf_id}
                  onChange={(e) => set('golf_id', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-gold transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">MinGolf-lösenord</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.golf_password}
                    onChange={(e) => set('golf_password', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-white/20 focus:outline-none focus:border-gold transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors text-sm"
                  >
                    {showPassword ? 'Dölj' : 'Visa'}
                  </button>
                </div>
                <p className="text-xs text-white/20 mt-1.5">
                  Sparas krypterat. Används enbart för att boka i ditt namn.
                </p>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!step1Valid}
                className="w-full mt-2 bg-gold hover:bg-gold-light disabled:bg-white/10 disabled:text-white/20 text-black font-semibold rounded-xl py-3 transition-colors"
              >
                Fortsätt
              </button>
            </div>
          )}

          {/* Step 2 — Search settings */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold text-lg mb-5">Sök efter tid</h2>

              <div>
                <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">Golfklubb</label>
                <ClubSearch value={form.club} onChange={(c) => set('club', c)} />
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">Datum</label>
                <input
                  type="date"
                  min={today}
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">Från kl.</label>
                  <input
                    type="time"
                    value={form.time_from}
                    onChange={(e) => set('time_from', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">Till kl.</label>
                  <input
                    type="time"
                    value={form.time_to}
                    onChange={(e) => set('time_to', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-gold transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">Antal spelare</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set('num_players', n)}
                      className={`flex-1 py-2.5 rounded-xl font-semibold transition-colors ${
                        form.num_players === n
                          ? 'bg-gold text-black'
                          : 'bg-white/5 text-white/50 hover:bg-white/10'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Friends */}
              <div>
                <label className="block text-xs text-white/40 mb-1.5 uppercase tracking-wide">
                  Kompis Golf-ID <span className="text-white/20">(valfritt)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Golf-ID"
                    value={friendInput}
                    onChange={(e) => setFriendInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addFriend()}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-gold transition-colors"
                  />
                  <button
                    type="button"
                    onClick={addFriend}
                    className="bg-white/10 hover:bg-white/15 text-white rounded-xl px-4 transition-colors"
                  >
                    +
                  </button>
                </div>
                {form.friend_golf_ids.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.friend_golf_ids.map((id) => (
                      <span
                        key={id}
                        className="flex items-center gap-1 bg-gold/10 text-gold text-xs px-3 py-1 rounded-full"
                      >
                        {id}
                        <button onClick={() => removeFriend(id)} className="hover:text-red-400 transition-colors ml-1">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 font-semibold rounded-xl py-3 transition-colors"
                >
                  Tillbaka
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!step2Valid}
                  className="flex-1 bg-gold hover:bg-gold-light disabled:bg-white/10 disabled:text-white/20 text-black font-semibold rounded-xl py-3 transition-colors"
                >
                  Fortsätt
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Mode + Activate */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold text-lg mb-5">Välj läge</h2>

              {/* Summary */}
              <div className="bg-white/3 rounded-xl p-4 text-sm space-y-1.5 border border-white/8">
                <p className="text-white/50">
                  <span className="text-white/30">Klubb:</span>{' '}
                  <span className="text-white">{form.club?.name}</span>
                </p>
                <p className="text-white/50">
                  <span className="text-white/30">Datum:</span>{' '}
                  <span className="text-white">{form.date}</span>
                </p>
                <p className="text-white/50">
                  <span className="text-white/30">Tid:</span>{' '}
                  <span className="text-white">{form.time_from}–{form.time_to}</span>
                </p>
                <p className="text-white/50">
                  <span className="text-white/30">Spelare:</span>{' '}
                  <span className="text-white">{form.num_players}</span>
                </p>
              </div>

              {/* Mode selection */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => set('mode', 'notify')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    form.mode === 'notify'
                      ? 'border-gold bg-gold/10'
                      : 'border-white/10 bg-white/3 hover:border-white/20'
                  }`}
                >
                  <div className="text-2xl mb-2">🔔</div>
                  <div className="font-semibold text-white text-sm">Notis</div>
                  <div className="text-white/40 text-xs mt-1">
                    Skickar mail när en tid hittas. Du bokar själv.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => set('mode', 'auto')}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    form.mode === 'auto'
                      ? 'border-gold bg-gold/10'
                      : 'border-white/10 bg-white/3 hover:border-white/20'
                  }`}
                >
                  <div className="text-2xl mb-2">⚡</div>
                  <div className="font-semibold text-white text-sm">Auto</div>
                  <div className="text-white/40 text-xs mt-1">
                    Bokar automatiskt. Bekräftelse skickas via mail.
                  </div>
                </button>
              </div>

              {form.mode === 'auto' && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 text-xs text-yellow-300">
                  ⚠ Auto-läge bokar direkt utan ytterligare bekräftelse från dig.
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 font-semibold rounded-xl py-3 transition-colors"
                >
                  Tillbaka
                </button>
                <button
                  onClick={handleActivate}
                  disabled={loading}
                  className="flex-1 bg-gold hover:bg-gold-light disabled:opacity-50 text-black font-semibold rounded-xl py-3 transition-colors"
                >
                  {loading ? 'Startar…' : 'Aktivera bevakning'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Active jobs / dashboards */}
        {jobs.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-white/60 text-sm font-semibold uppercase tracking-wide">
              Aktiva bevakningar
            </h2>
            {jobs.map((job) => (
              <Dashboard
                key={job.id}
                job={job}
                onDelete={() => setJobs((prev) => prev.filter((j) => j.id !== job.id))}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
