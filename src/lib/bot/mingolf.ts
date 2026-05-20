import type { Job } from '../types'

export interface TeeTime {
  time: string
  availableSlots: number
  slotId?: string
}

export interface ScanResult {
  found: boolean
  teeTimes: TeeTime[]
  bookedTime?: string
  error?: string
  debug?: string
}

const BASE = 'https://mingolf.golf.se'

interface UserProfile {
  personId: string
  golfId: string
  firstName: string
  lastName: string
  hcp: string
  age: number
  gender: string
  homeClubName: string
}

function timeInRange(time: string, from: string, to: string): boolean {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  return toMin(time) >= toMin(from) && toMin(time) <= toMin(to)
}

function sig() { return AbortSignal.timeout(8000) }

// Step 1: MinGolf login → session cookies
async function loginMinGolf(golfId: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/login/api/Users/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ GolfId: golfId, Password: password }),
    redirect: 'manual',
    signal: sig(),
  })

  if (res.status === 400) {
    const raw = await res.text().catch(() => '')
    let msg = raw
    try { msg = JSON.parse(raw) } catch { /* use raw */ }
    throw new Error(typeof msg === 'string' ? msg : 'Inloggning misslyckades')
  }
  if (!res.ok && res.status !== 302) {
    throw new Error(`Inloggning returnerade HTTP ${res.status}`)
  }

  const setCookie = res.headers.getSetCookie?.() ?? []
  const cookieStr = setCookie.map((c) => c.split(';')[0]).join('; ')
  if (!cookieStr) throw new Error('Inga session-cookies efter inloggning')
  return cookieStr
}

// Step 1b: Visit /bokning/ to pick up booking-app session cookies + user profile
// Only adds NEW cookie names — never overrides existing auth cookies
async function enrichCookies(cookies: string): Promise<{ cookies: string; profile: UserProfile | null }> {
  try {
    const res = await fetch(`${BASE}/bokning/`, {
      headers: { Cookie: cookies, Accept: 'text/html' },
      redirect: 'follow',
      signal: sig(),
    })
    const html = await res.text().catch(() => '')

    // Extract new cookies
    const newCookies = res.headers.getSetCookie?.() ?? []
    let enriched = cookies
    if (newCookies.length > 0) {
      const existingNames = new Set(cookies.split('; ').map((c) => c.split('=')[0]))
      const extra = newCookies
        .map((c) => c.split(';')[0])
        .filter((c) => !existingNames.has(c.split('=')[0]))
        .join('; ')
      if (extra) enriched = `${cookies}; ${extra}`
    }

    // Extract user profile from __INITIAL_STATE__
    let profile: UserProfile | null = null
    try {
      const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]+?\});\s*window\.__INITIAL_ROUTE__/)
      if (m) {
        const state = JSON.parse(m[1])
        const p = state?.shell?.profile
        if (p?.personId) {
          profile = {
            personId: p.personId,
            golfId: p.golfId,
            firstName: p.firstName,
            lastName: p.lastName,
            hcp: p.hcp ?? '0',
            age: parseInt(p.age ?? '0'),
            gender: p.gender ?? 'Male',
            homeClubName: p.homeClubName ?? '',
          }
        }
      }
    } catch { /* profile stays null */ }

    return { cookies: enriched, profile }
  } catch {
    return { cookies, profile: null }
  }
}

// Step 2: Exchange MinGolf session for Bearer token
// Tries multiple base URLs — /login/api returns 401 but /bokning/api may work
async function getGolfBoxToken(cookies: string): Promise<string> {
  const bases = [
    `${BASE}/login/api`,
    `${BASE}/bokning/api`,
    `${BASE}/api`,
    BASE,
  ]
  const errors: string[] = []

  for (const base of bases) {
    for (const method of ['POST', 'GET'] as const) {
      try {
        const res = await fetch(`${base}/Users/GolfBox/Token`, {
          method,
          headers: {
            Cookie: cookies,
            Accept: 'application/json',
            ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(method === 'POST' ? { body: '{}' } : {}),
          signal: sig(),
        })

        const body = await res.text().catch(() => '')
        if (res.status === 404 || res.status === 401) { errors.push(`${base}:${method}:${res.status}`); break }
        if (!res.ok) { errors.push(`${base}:${method}:${res.status}`); break }

        let data: unknown = body
        try { data = JSON.parse(body) } catch { /* use raw string */ }

        const token = typeof data === 'string' ? data
          : (data as Record<string, unknown>)?.token
            ?? (data as Record<string, unknown>)?.access_token
            ?? (data as Record<string, unknown>)?.accessToken
            ?? (data as Record<string, unknown>)?.Token
            ?? null

        if (typeof token === 'string') return token
        errors.push(`${base}:${method}:no-token`)
      } catch {
        errors.push(`${base}:${method}:network-err`)
        break
      }
    }
  }

  throw new Error(`Token: ${errors.join(', ')}`)
}

interface StartTimeSlot {
  StartTime?: string
  startTime?: string
  Time?: string
  time?: string
  Date?: string
  AvailablePlayers?: number
  availablePlayers?: number
  FreeSlots?: number
  freeSlots?: number
  SlotId?: string
  slotId?: string
  Id?: string
  id?: string
  Bookable?: boolean
  bookable?: boolean
  IsBookable?: boolean
  isBookable?: boolean
  Available?: boolean
  available?: boolean
}

// Step 3: Fetch available tee times
// Uses GET at /bokning/api (mingolf proxy to Sweetspot) — requires enriched cookies from /bokning/
async function fetchStartTimes(
  cookies: string,
  token: string,
  facilityId: string,
  date: string,
  numberOfPlayers: number
): Promise<{ times: TeeTime[]; rawDebug: string }> {
  const url = new URL(`${BASE}/bokning/api/Clubs/Courses/StartTimes/Overview`)
  url.searchParams.set('CourseId', facilityId)
  url.searchParams.set('FacilityId', facilityId)
  url.searchParams.set('Date', date)
  url.searchParams.set('NumberOfPlayers', String(numberOfPlayers))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Cookie: cookies,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      Origin: BASE,
      Referer: `${BASE}/bokning/`,
    },
    signal: sig(),
  })

  const rawBody = await res.text().catch(() => '')
  if (!res.ok) throw new Error(`StartTimes HTTP ${res.status}: ${rawBody.substring(0, 200)}`)

  let data: unknown
  try { data = JSON.parse(rawBody) } catch {
    throw new Error(`StartTimes ej JSON: ${rawBody.substring(0, 150)}`)
  }

  const d = data as Record<string, unknown>

  let slots: StartTimeSlot[] = []

  if (Array.isArray(data)) {
    slots = data as StartTimeSlot[]
  } else {
    const flat = d?.startTimes ?? d?.StartTimes ?? d?.items ?? d?.Items ?? d?.slots ?? d?.Slots
    if (Array.isArray(flat)) {
      slots = flat as StartTimeSlot[]
    } else {
      // MinGolf/Sweetspot Overview endpoint returns slots nested under courseSchedule
      const schedule = d?.courseSchedule as Record<string, unknown> | undefined
      if (schedule) {
        const slotsInSchedule = schedule?.startTimes ?? schedule?.StartTimes ?? schedule?.slots
          ?? schedule?.teeSheets ?? schedule?.teeSheet ?? schedule?.items
        if (Array.isArray(slotsInSchedule)) {
          slots = slotsInSchedule as StartTimeSlot[]
        } else if (Array.isArray(schedule)) {
          slots = schedule as unknown as StartTimeSlot[]
        }
      }
    }
  }

  const rawDebug = slots.length > 0
    ? `slot[0]=${JSON.stringify(slots[0]).substring(0, 400)}`
    : `no-slots body=${rawBody.substring(0, 200)}`

  const times = slots.map((s) => {
    const rawTime = s.StartTime ?? s.startTime ?? s.Time ?? s.time ?? s.Date ?? ''
    const match = rawTime.match(/(\d{2}:\d{2})/)
    const avail = s.AvailablePlayers ?? s.availablePlayers ?? s.FreeSlots ?? s.freeSlots ?? null
    const bookable = s.Bookable ?? s.bookable ?? s.IsBookable ?? s.isBookable ?? s.Available ?? s.available ?? null
    return {
      time: match ? match[1] : rawTime,
      availableSlots: avail ?? 4,
      slotId: s.SlotId ?? s.slotId ?? s.Id ?? s.id,
      _bookable: bookable,
      _avail: avail,
    }
  })
  .filter((t) => t.time.match(/^\d{2}:\d{2}$/))
  .filter((t) => t._bookable !== false)
  .filter((t) => t._avail === null || t._avail >= numberOfPlayers)
  .map(({ _bookable: _b, _avail: _a, ...t }) => t)

  return { times, rawDebug }
}

// Step 4: Book a slot via MinGolf proxy
// Flow: POST /Slot/{id}/Lock (with player array) → POST /Slot/{id}/Bookings → DELETE /Slot/{id}/Lock
// The Lock step must receive the same slotBookings array so the server can match players.
async function bookSlot(
  cookies: string,
  token: string,
  slotId: string,
  bookerGolfId: string,
  friendGolfIds: string[],
  profile: UserProfile | null,
  date: string
): Promise<boolean> {
  const headers = {
    Cookie: cookies,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: BASE,
    Referer: `${BASE}/bokning/`,
  }

  // Build slotBookings — include date so the server books the right day
  const effectiveGolfId = profile?.golfId || bookerGolfId
  const makeBooking = (golfId: string, personId: string | undefined, isBooker: boolean) => ({
    slotBookingId: `new_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
    state: 'Added',
    hasBeenValidated: false,
    date,
    player: {
      ...(profile && isBooker ? {
        personId: profile.personId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        fullName: `${profile.firstName} ${profile.lastName}`,
        hcp: profile.hcp,
        age: profile.age,
        gender: profile.gender,
        homeClub: profile.homeClubName,
      } : {}),
      golfId,
      isBooker,
      isGuest: false,
    },
    isNineHole: false,
    hasArrived: false,
  })

  const slotBookings = [
    makeBooking(effectiveGolfId, profile?.personId, true),
    ...friendGolfIds.map((golfId) => makeBooking(golfId, undefined, false)),
  ]

  // Pass date as query param so the proxy books the correct date, not today
  const lockUrl = `${BASE}/bokning/api/Slot/${slotId}/Lock?date=${date}`
  const bookUrl = `${BASE}/bokning/api/Slot/${slotId}/Bookings?date=${date}`

  // 1. Lock with player array + date
  const lockRes = await fetch(lockUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(slotBookings),
    signal: sig(),
  })
  if (!lockRes.ok && lockRes.status !== 204) {
    const b = await lockRes.text().catch(() => '')
    throw new Error(`Lock HTTP ${lockRes.status}: ${b.substring(0, 200)}`)
  }

  // 2. Book with date
  const bookRes = await fetch(bookUrl, {
    method: 'POST', headers,
    body: JSON.stringify(slotBookings),
    signal: sig(),
  })
  const bookBody = await bookRes.text().catch(() => '')

  // 3. Always release lock
  await fetch(lockUrl, { method: 'DELETE', headers, signal: sig() }).catch(() => {})

  if (bookRes.status === 401) throw new Error('Token ogiltig vid bokning')
  if (!bookRes.ok) throw new Error(`Bokning HTTP ${bookRes.status}: ${bookBody.substring(0, 300)}`)
  return true
}

export async function scanAndBook(job: Job): Promise<ScanResult> {
  // 1. Login
  let cookies: string
  try {
    cookies = await loginMinGolf(job.golf_id, job.golf_password)
  } catch (err) {
    return { found: false, teeTimes: [], error: err instanceof Error ? err.message : 'Inloggning misslyckades' }
  }

  // 1b. Enrich cookies + get user profile from /bokning/
  const { cookies: enriched, profile } = await enrichCookies(cookies)
  cookies = enriched

  // 2. Get Bearer token
  let token: string
  try {
    token = await getGolfBoxToken(cookies)
  } catch (err) {
    return { found: false, teeTimes: [], error: err instanceof Error ? err.message : 'Token misslyckades' }
  }

  // 3. Fetch start times
  let allTimes: TeeTime[]
  let rawDebug = ''
  try {
    const result = await fetchStartTimes(cookies, token, job.club_id, job.date, job.num_players)
    allTimes = result.times
    rawDebug = result.rawDebug
  } catch (err) {
    return { found: false, teeTimes: [], error: err instanceof Error ? err.message : 'Kunde inte hamta tider' }
  }

  // 4. Filter by time range
  const teeTimes = allTimes.filter((t) => timeInRange(t.time, job.time_from, job.time_to))

  if (teeTimes.length === 0) return { found: false, teeTimes: [] }
  if (job.mode === 'notify') return { found: true, teeTimes }

  // 5. Auto-book — try up to 10 slots spread across the time range (not just the first 5)
  // Morning slots are often full; sampling throughout the day finds available times.
  const withId = teeTimes.filter((t) => t.slotId)
  const candidates = withId.length <= 10 ? withId : (() => {
    const step = Math.floor(withId.length / 10)
    return withId.filter((_, i) => i % step === 0).slice(0, 10)
  })()
  if (candidates.length === 0) {
    const sample = JSON.stringify(teeTimes[0]).substring(0, 200)
    return { found: true, teeTimes, error: `Inget slot-ID (slot: ${sample})` }
  }

  const profileStatus = profile ? `profil:${profile.golfId}` : 'profil:null'
  const slotDiag = candidates.map((c) => `${c.time}[${c.slotId}]`).slice(0, 2).join(', ')

  const lastErrors: string[] = []
  for (const slot of candidates) {
    try {
      const booked = await bookSlot(cookies, token, slot.slotId!, job.golf_id, job.friend_golf_ids ?? [], profile, job.date)
      if (booked) return { found: true, teeTimes, bookedTime: slot.time, debug: rawDebug }
    } catch (err) {
      lastErrors.push(`${slot.time}: ${err instanceof Error ? err.message : 'fel'}`)
    }
  }
  return {
    found: true,
    teeTimes,
    debug: rawDebug,
    error: `[${profileStatus} ${slotDiag}] Bokning misslyckades: ${lastErrors.slice(0, 2).join(' | ')}`,
  }
}
