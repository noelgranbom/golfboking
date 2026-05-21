'use client'

import { useState, useEffect } from 'react'
import { Bell, Zap, TriangleAlert } from 'lucide-react'
import { StepIndicator } from '@/components/StepIndicator'
import { ClubSearch } from '@/components/ClubSearch'
import { Dashboard } from '@/components/Dashboard'
import type { Job, GolfClub, JobMode, CreateJobInput } from '@/lib/types'

const STEPS = ['Inloggning', 'Sök tid', 'Aktivera']

interface CourseOption {
  id: string
  name: string
}

interface FormData {
  email: string
  golf_id: string
  golf_password: string
  club: GolfClub | null
  course_id: string | null
  course_name: string | null
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
  course_id: null,
  course_name: null,
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
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [loadingCourses, setLoadingCourses] = useState(false)

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

  async function handleClubChange(club: GolfClub | null) {
    setForm((prev) => ({ ...prev, club, course_id: null, course_name: null }))
    setCourses([])
    if (!club || !form.golf_id || !form.golf_password) return
    setLoadingCourses(true)
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ golf_id: form.golf_id, golf_password: form.golf_password, club_name: club.name }),
      })
      const data = await res.json()
      const fetched: CourseOption[] = data.courses ?? []
      setCourses(fetched)
      if (fetched.length === 1) {
        setForm((prev) => ({ ...prev, course_id: fetched[0].id, course_name: fetched[0].name }))
      }
    } catch { /* ignore */ } finally {
      setLoadingCourses(false)
    }
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
      course_id: form.course_id,
      course_name: form.course_name,
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
  const step2Valid = form.club && form.date && form.time_from && form.time_to &&
    !loadingCourses && (courses.length <= 1 || form.course_id)

  const today = new Date().toISOString().split('T')[0]

  const inputClass =
    'w-full bg-[var(--gb-bg-input)] border border-[var(--gb-border)] rounded-[var(--gb-radius-md)] px-4 py-3 text-[var(--gb-fg)] placeholder-[var(--gb-fg-soft)] focus:outline-none focus:border-[var(--gb-fairway)] transition-colors duration-[var(--gb-dur-fast)]'

  const labelClass =
    'block text-[11px] text-[var(--gb-fg-soft)] mb-1.5 uppercase tracking-[0.14em]'

  const primaryBtn =
    'w-full mt-2 bg-[var(--gb-fairway)] hover:bg-[var(--gb-fairway-hi)] disabled:bg-[var(--gb-bg-card)] disabled:text-[var(--gb-fg-faint)] text-[var(--gb-on-accent)] font-medium rounded-[var(--gb-radius-lg)] py-3 transition-colors duration-[var(--gb-dur-fast)]'

  const secondaryBtn =
    'flex-1 bg-[var(--gb-bg-card)] hover:bg-[var(--gb-bg-raised)] text-[var(--gb-fg-muted)] font-medium rounded-[var(--gb-radius-lg)] py-3 transition-colors duration-[var(--gb-dur-fast)]'

  return (
    <main className="min-h-screen py-10 px-4">
      <div className="max-w-lg mx-auto">
        {/* Logotyp */}
        <div className="text-center mb-10">
          <h1
            className="text-4xl text-[var(--gb-mist)]"
            style={{
              fontFamily: 'var(--gb-font-display)',
              fontStyle: 'italic',
              fontWeight: 500,
              letterSpacing: '-0.02em',
            }}
          >
            Golfbooking
          </h1>
          <div className="flex items-center justify-center gap-3 my-2.5">
            <div className="h-px flex-1 max-w-16 bg-[var(--gb-brass)]/60" />
            <div className="w-1 h-1 rounded-full bg-[var(--gb-brass)]/60" />
            <div className="h-px flex-1 max-w-16 bg-[var(--gb-brass)]/60" />
          </div>
          <p className="text-[var(--gb-fg-faint)] text-sm">Automatisk bevakare för MinGolf</p>
        </div>

        {/* Formulärkort */}
        <div className="bg-[var(--gb-bg-card)] border border-[var(--gb-border)] rounded-[var(--gb-radius-xl)] p-6 mb-8">
          <StepIndicator currentStep={step} steps={STEPS} />

          {/* Steg 1 — Inloggning */}
          {step === 1 && (
            <div className="space-y-4">
              <h2
                className="text-[var(--gb-fg)] font-semibold text-xl mb-5"
                style={{ fontFamily: 'var(--gb-font-display)' }}
              >
                Dina uppgifter
              </h2>

              <div>
                <label className={labelClass}>E-post</label>
                <input
                  type="email"
                  placeholder="din@email.se"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Golf-ID</label>
                <input
                  type="text"
                  placeholder="123456"
                  value={form.golf_id}
                  onChange={(e) => set('golf_id', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>MinGolf-lösenord</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={form.golf_password}
                    onChange={(e) => set('golf_password', e.target.value)}
                    className={`${inputClass} pr-14`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--gb-fg-soft)] hover:text-[var(--gb-fg-muted)] transition-colors duration-[var(--gb-dur-fast)] text-sm"
                  >
                    {showPassword ? 'Dölj' : 'Visa'}
                  </button>
                </div>
                <p className="text-xs text-[var(--gb-fg-faint)] mt-1.5">
                  Sparas krypterat. Används enbart för att boka i ditt namn.
                </p>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!step1Valid}
                className={primaryBtn}
              >
                Fortsätt
              </button>
            </div>
          )}

          {/* Steg 2 — Sökinställningar */}
          {step === 2 && (
            <div className="space-y-4">
              <h2
                className="text-[var(--gb-fg)] font-semibold text-xl mb-5"
                style={{ fontFamily: 'var(--gb-font-display)' }}
              >
                Sök efter tid
              </h2>

              <div>
                <label className={labelClass}>Golfklubb</label>
                <ClubSearch value={form.club} onChange={handleClubChange} />
              </div>

              {/* Bana — visas när klubben har flera banor */}
              {loadingCourses && (
                <div className="flex items-center gap-2 text-xs text-[var(--gb-fg-faint)]">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--gb-brass)]"
                    style={{ animation: 'pulse-dot 1.5s ease-in-out infinite' }}
                  />
                  Hämtar banor…
                </div>
              )}
              {!loadingCourses && courses.length > 1 && (
                <div>
                  <label className={labelClass}>Bana</label>
                  <div className="space-y-2">
                    {courses.map((course) => (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, course_id: course.id, course_name: course.name }))}
                        className={`w-full text-left px-4 py-3 rounded-[var(--gb-radius-md)] border transition-colors duration-[var(--gb-dur-fast)] text-sm ${
                          form.course_id === course.id
                            ? 'border-[var(--gb-fairway)] bg-[var(--gb-fairway)]/10 text-[var(--gb-fg)]'
                            : 'border-[var(--gb-border)] bg-[var(--gb-bg-input)] text-[var(--gb-fg-muted)] hover:border-[var(--gb-border-strong)]'
                        }`}
                      >
                        {course.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className={labelClass}>Datum</label>
                <input
                  type="date"
                  min={today}
                  value={form.date}
                  onChange={(e) => set('date', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Från kl.</label>
                  <input
                    type="time"
                    value={form.time_from}
                    onChange={(e) => set('time_from', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Till kl.</label>
                  <input
                    type="time"
                    value={form.time_to}
                    onChange={(e) => set('time_to', e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Antal spelare</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set('num_players', n)}
                      className={`flex-1 py-2.5 rounded-[var(--gb-radius-md)] font-medium transition-colors duration-[var(--gb-dur-fast)] ${
                        form.num_players === n
                          ? 'bg-[var(--gb-fairway)] text-[var(--gb-on-accent)]'
                          : 'bg-[var(--gb-bg-card)] text-[var(--gb-fg-muted)] hover:bg-[var(--gb-bg-raised)]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Kompisbokare */}
              <div>
                <label className={labelClass}>
                  Kompis Golf-ID <span className="text-[var(--gb-fg-faint)] normal-case tracking-normal">(valfritt)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Golf-ID"
                    value={friendInput}
                    onChange={(e) => setFriendInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addFriend()}
                    className={`flex-1 bg-[var(--gb-bg-input)] border border-[var(--gb-border)] rounded-[var(--gb-radius-md)] px-4 py-3 text-[var(--gb-fg)] placeholder-[var(--gb-fg-soft)] focus:outline-none focus:border-[var(--gb-fairway)] transition-colors duration-[var(--gb-dur-fast)]`}
                  />
                  <button
                    type="button"
                    onClick={addFriend}
                    className="bg-[var(--gb-bg-card)] hover:bg-[var(--gb-bg-raised)] text-[var(--gb-fg)] rounded-[var(--gb-radius-md)] px-4 transition-colors duration-[var(--gb-dur-fast)]"
                  >
                    +
                  </button>
                </div>
                {form.friend_golf_ids.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.friend_golf_ids.map((id) => (
                      <span
                        key={id}
                        className="flex items-center gap-1 bg-[var(--gb-brass)]/10 text-[var(--gb-brass)] text-xs px-3 py-1 rounded-[var(--gb-radius-pill)]"
                      >
                        {id}
                        <button
                          onClick={() => removeFriend(id)}
                          className="hover:text-[var(--gb-error)] transition-colors duration-[var(--gb-dur-fast)] ml-1"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-2">
                <button onClick={() => setStep(1)} className={secondaryBtn}>
                  Tillbaka
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!step2Valid}
                  className={`flex-1 bg-[var(--gb-fairway)] hover:bg-[var(--gb-fairway-hi)] disabled:bg-[var(--gb-bg-card)] disabled:text-[var(--gb-fg-faint)] text-[var(--gb-on-accent)] font-medium rounded-[var(--gb-radius-lg)] py-3 transition-colors duration-[var(--gb-dur-fast)]`}
                >
                  Fortsätt
                </button>
              </div>
            </div>
          )}

          {/* Steg 3 — Läge + Aktivera */}
          {step === 3 && (
            <div className="space-y-4">
              <h2
                className="text-[var(--gb-fg)] font-semibold text-xl mb-5"
                style={{ fontFamily: 'var(--gb-font-display)' }}
              >
                Välj läge
              </h2>

              {/* Sammanfattning */}
              <div className="bg-[var(--gb-bg-card)] rounded-[var(--gb-radius-xl)] p-4 text-sm space-y-1.5 border border-[var(--gb-border)]">
                <p className="text-[var(--gb-fg-muted)]">
                  <span className="text-[var(--gb-fg-soft)]">Klubb:</span>{' '}
                  <span className="text-[var(--gb-fg)]">{form.club?.name}</span>
                </p>
                {form.course_name && (
                  <p className="text-[var(--gb-fg-muted)]">
                    <span className="text-[var(--gb-fg-soft)]">Bana:</span>{' '}
                    <span className="text-[var(--gb-fg)]">{form.course_name}</span>
                  </p>
                )}
                <p className="text-[var(--gb-fg-muted)]">
                  <span className="text-[var(--gb-fg-soft)]">Datum:</span>{' '}
                  <span className="text-[var(--gb-fg)]">{form.date}</span>
                </p>
                <p className="text-[var(--gb-fg-muted)]">
                  <span className="text-[var(--gb-fg-soft)]">Tid:</span>{' '}
                  <span className="text-[var(--gb-fg)]">{form.time_from}–{form.time_to}</span>
                </p>
                <p className="text-[var(--gb-fg-muted)]">
                  <span className="text-[var(--gb-fg-soft)]">Spelare:</span>{' '}
                  <span className="text-[var(--gb-fg)]">{form.num_players}</span>
                </p>
              </div>

              {/* Lägesval */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => set('mode', 'notify')}
                  className={`p-4 rounded-[var(--gb-radius-xl)] border text-left transition-all duration-[var(--gb-dur-base)] ${
                    form.mode === 'notify'
                      ? 'border-[var(--gb-fairway)] bg-[var(--gb-fairway)]/10'
                      : 'border-[var(--gb-border)] bg-[var(--gb-bg-card)] hover:border-[var(--gb-border-strong)]'
                  }`}
                >
                  <div className="mb-2 text-[var(--gb-fg-muted)]">
                    <Bell size={20} strokeWidth={1.75} />
                  </div>
                  <div className="font-medium text-[var(--gb-fg)] text-sm">Notis</div>
                  <div className="text-[var(--gb-fg-soft)] text-xs mt-1">
                    Skickar mail när en tid hittas. Du bokar själv.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => set('mode', 'auto')}
                  className={`p-4 rounded-[var(--gb-radius-xl)] border text-left transition-all duration-[var(--gb-dur-base)] ${
                    form.mode === 'auto'
                      ? 'border-[var(--gb-fairway)] bg-[var(--gb-fairway)]/10'
                      : 'border-[var(--gb-border)] bg-[var(--gb-bg-card)] hover:border-[var(--gb-border-strong)]'
                  }`}
                >
                  <div className="mb-2 text-[var(--gb-fg-muted)]">
                    <Zap size={20} strokeWidth={1.75} />
                  </div>
                  <div className="font-medium text-[var(--gb-fg)] text-sm">Auto</div>
                  <div className="text-[var(--gb-fg-soft)] text-xs mt-1">
                    Bokar automatiskt. Bekräftelse skickas via mail.
                  </div>
                </button>
              </div>

              {form.mode === 'auto' && (
                <div className="bg-[var(--gb-warning)]/10 border border-[var(--gb-warning)]/20 rounded-[var(--gb-radius-xl)] px-4 py-3 text-xs text-[var(--gb-warning)] flex items-start gap-2">
                  <TriangleAlert size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                  <span>Auto-läge bokar direkt utan ytterligare bekräftelse från dig.</span>
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button onClick={() => setStep(2)} className={secondaryBtn}>
                  Tillbaka
                </button>
                <button
                  onClick={handleActivate}
                  disabled={loading}
                  className={`flex-1 bg-[var(--gb-fairway)] hover:bg-[var(--gb-fairway-hi)] disabled:opacity-50 text-[var(--gb-on-accent)] font-medium rounded-[var(--gb-radius-lg)] py-3 transition-colors duration-[var(--gb-dur-fast)]`}
                >
                  {loading ? 'Startar…' : 'Aktivera bevakning'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Aktiva bevakningar */}
        {jobs.length > 0 && (
          <div className="space-y-4">
            <h2
              className="text-[var(--gb-fg-muted)] text-sm font-medium uppercase tracking-[0.14em]"
            >
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
