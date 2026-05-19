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
}

const BASE = 'https://mingolf.golf.se'
const BOOKING_BASE = 'https://book.sweetspot.io'

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

// Step 1b: Visit /bokning/ to pick up booking-app session cookies
// Only adds NEW cookie names — never overrides existing auth cookies
async function enrichCookies(cookies: string): Promise<string> {
  try {
    const res = await fetch(`${BASE}/bokning/`, {
      headers: { Cookie: cookies, Accept: 'text/html' },
      redirect: 'follow',
      signal: sig(),
    })
    const newCookies = res.headers.getSetCookie?.() ?? []
    if (newCookies.length === 0) return cookies

    const existingNames = new Set(cookies.split('; ').map((c) => c.split('=')[0]))
    const extra = newCookies
      .map((c) => c.split(';')[0])
      .filter((c) => !existingNames.has(c.split('=')[0]))
      .join('; ')

    return extra ? `${cookies}; ${extra}` : cookies
  } catch {
    return cookies
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
  SlotId?: string
  slotId?: string
  Id?: string
  id?: string
}

// Step 3: Fetch available tee times
// Uses GET at /bokning/api (mingolf proxy to Sweetspot) — requires enriched cookies from /bokning/
async function fetchStartTimes(
  cookies: string,
  token: string,
  facilityId: string,
  date: string,
  numberOfPlayers: number
): Promise<TeeTime[]> {
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

  return slots.map((s) => {
    const rawTime = s.StartTime ?? s.startTime ?? s.Time ?? s.time ?? s.Date ?? ''
    const match = rawTime.match(/(\d{2}:\d{2})/)
    return {
      time: match ? match[1] : rawTime,
      availableSlots: s.AvailablePlayers ?? s.availablePlayers ?? s.FreeSlots ?? 4,
      slotId: s.SlotId ?? s.slotId ?? s.Id ?? s.id,
    }
  }).filter((t) => t.time.match(/^\d{2}:\d{2}$/))
}

// Step 4: Book a slot
async function bookSlot(
  cookies: string,
  token: string,
  slotId: string,
  numberOfPlayers: number,
  friendGolfIds: string[]
): Promise<boolean> {
  const res = await fetch(`${BOOKING_BASE}/Slot/Unlock/Many`, {
    method: 'POST',
    headers: {
      Cookie: cookies,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: BASE,
      Referer: `${BASE}/bokning/`,
    },
    body: JSON.stringify({ SlotId: slotId, NumberOfPlayers: numberOfPlayers, Players: friendGolfIds }),
    signal: sig(),
  })

  if (res.status === 401) throw new Error('Token ogiltig vid bokning')
  return res.ok
}

export async function scanAndBook(job: Job): Promise<ScanResult> {
  // 1. Login
  let cookies: string
  try {
    cookies = await loginMinGolf(job.golf_id, job.golf_password)
  } catch (err) {
    return { found: false, teeTimes: [], error: err instanceof Error ? err.message : 'Inloggning misslyckades' }
  }

  // 1b. Enrich cookies by visiting /bokning/
  cookies = await enrichCookies(cookies)

  // 2. Get Bearer token
  let token: string
  try {
    token = await getGolfBoxToken(cookies)
  } catch (err) {
    return { found: false, teeTimes: [], error: err instanceof Error ? err.message : 'Token misslyckades' }
  }

  // 3. Fetch start times
  let allTimes: TeeTime[]
  try {
    allTimes = await fetchStartTimes(cookies, token, job.club_id, job.date, job.num_players)
  } catch (err) {
    return { found: false, teeTimes: [], error: err instanceof Error ? err.message : 'Kunde inte hamta tider' }
  }

  // 4. Filter by time range
  const teeTimes = allTimes.filter((t) => timeInRange(t.time, job.time_from, job.time_to))

  if (teeTimes.length === 0) return { found: false, teeTimes: [] }
  if (job.mode === 'notify') return { found: true, teeTimes }

  // 5. Auto-book first matching slot
  const first = teeTimes[0]
  if (!first.slotId) {
    return { found: true, teeTimes, error: 'Hittade tider men inget slot-ID for bokning' }
  }

  try {
    const booked = await bookSlot(cookies, token, first.slotId, job.num_players, job.friend_golf_ids ?? [])
    if (booked) return { found: true, teeTimes, bookedTime: first.time }
    return { found: true, teeTimes, error: 'Hittade tider men bokning misslyckades' }
  } catch (err) {
    return { found: true, teeTimes, error: err instanceof Error ? err.message : 'Bokning misslyckades' }
  }
}
