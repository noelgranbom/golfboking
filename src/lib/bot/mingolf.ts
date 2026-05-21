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

async function enrichCookies(cookies: string): Promise<{ cookies: string; profile: UserProfile | null }> {
  try {
    const res = await fetch(`${BASE}/bokning/`, {
      headers: { Cookie: cookies, Accept: 'text/html' },
      redirect: 'follow',
      signal: sig(),
    })
    const html = await res.text().catch(() => '')

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

interface NestedAvailability {
  bookable?: boolean
  Bookable?: boolean
  availableSlots?: number
  AvailableSlots?: number
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
  availablity?: NestedAvailability
  Availablity?: NestedAvailability
  availability?: NestedAvailability
  Availability?: NestedAvailability
}

function parseSwedishTime(rawTime: string): { time: string; date: string } {
  if (rawTime.includes('T')) {
    try {
      const d = new Date(rawTime)
      const time = d.toLocaleTimeString('sv-SE', {
        timeZone: 'Europe/Stockholm',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      const date = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
      return { time, date }
    } catch { /* fall through */ }
  }
  const match = rawTime.match(/(\d{2}:\d{2})/)
  return { time: match ? match[1] : rawTime, date: '' }
}

// Extracts slot list and the course UUID from an API response.
// The UUID comes from courseSchedule fields only — NOT from favouriteClubs,
// which always represents the user's home club, not the requested club.
function extractSlots(data: unknown): { slots: StartTimeSlot[]; courseUUID: string } {
  const d = data as Record<string, unknown>
  let slots: StartTimeSlot[] = []
  let courseUUID = ''

  if (Array.isArray(data)) {
    slots = data as StartTimeSlot[]
  } else {
    const flat = d?.startTimes ?? d?.StartTimes ?? d?.items ?? d?.Items ?? d?.slots ?? d?.Slots
    if (Array.isArray(flat)) {
      slots = flat as StartTimeSlot[]
    } else {
      const schedule = d?.courseSchedule as Record<string, unknown> | undefined
      if (schedule) {
        // Extract the UUID of the club whose schedule was returned
        const cid = schedule?.courseId ?? schedule?.CourseId ?? schedule?.facilityId ?? schedule?.FacilityId
          ?? schedule?.clubId ?? schedule?.ClubId
        if (typeof cid === 'string' && cid.includes('-')) courseUUID = cid

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
  return { slots, courseUUID }
}

function slotsToTeeTimes(slots: StartTimeSlot[], date: string, numberOfPlayers: number) {
  return slots.map((s) => {
    const rawTime = s.StartTime ?? s.startTime ?? s.Time ?? s.time ?? s.Date ?? ''
    const { time, date: slotDate } = parseSwedishTime(rawTime)
    const nested = s.availablity ?? s.Availablity ?? s.availability ?? s.Availability
    const avail = s.AvailablePlayers ?? s.availablePlayers ?? s.FreeSlots ?? s.freeSlots
      ?? nested?.availableSlots ?? nested?.AvailableSlots ?? null
    const bookable = s.Bookable ?? s.bookable ?? s.IsBookable ?? s.isBookable ?? s.Available ?? s.available
      ?? nested?.bookable ?? nested?.Bookable ?? null
    return {
      time,
      availableSlots: avail ?? 4,
      slotId: s.SlotId ?? s.slotId ?? s.Id ?? s.id,
      _bookable: bookable,
      _avail: avail,
      _date: slotDate,
    }
  })
  .filter((t) => t.time.match(/^\d{2}:\d{2}$/))
  .filter((t) => !t._date || t._date === date)
  .filter((t) => t._bookable !== false)
  .filter((t) => t._avail === null || t._avail >= numberOfPlayers)
  .map(({ _bookable: _b, _avail: _a, _date: _dd, ...t }) => t)
}

// Try to resolve a club's GolfBox UUID by searching MinGolf's API endpoints.
// Used as a secondary lookup when the Overview response doesn't contain a UUID.
async function resolveClubUUID(
  cookies: string,
  token: string,
  clubId: string,
  clubName: string
): Promise<{ uuid: string; debugInfo: string }> {
  const headers = {
    Cookie: cookies,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    Origin: BASE,
    Referer: `${BASE}/bokning/`,
  }

  const isGUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

  const extractId = (c: unknown): string => {
    const obj = c as Record<string, unknown>
    for (const key of ['id', 'Id', 'facilityId', 'FacilityId', 'courseId', 'CourseId', 'clubId', 'ClubId']) {
      const v = obj?.[key]
      if (typeof v === 'string' && isGUID(v)) return v
    }
    return ''
  }

  const norm = (s: string) => s.toLowerCase()
    .replace(/golfklubb|golfclub|golf\s*club|\bgk\b|\bgc\b|\bab\b/gi, '')
    .replace(/[^a-zåäö0-9]+/g, ' ')
    .trim()

  const nameMatch = (candidate: string) => {
    const cn = norm(candidate)
    const rn = norm(clubName)
    return cn === rn || cn.includes(rn) || rn.includes(cn)
  }

  const findInList = (data: unknown): string => {
    const list = Array.isArray(data) ? data
      : ((data as Record<string, unknown>)?.clubs
        ?? (data as Record<string, unknown>)?.items
        ?? (data as Record<string, unknown>)?.Clubs
        ?? (data as Record<string, unknown>)?.facilities
        ?? (data as Record<string, unknown>)?.Facilities
        ?? (data as Record<string, unknown>)?.courses
        ?? (data as Record<string, unknown>)?.Courses)
    if (!Array.isArray(list) || list.length === 0) return ''
    for (const item of list) {
      const obj = item as Record<string, unknown>
      const name = String(obj?.name ?? obj?.Name ?? obj?.clubName ?? obj?.ClubName ?? obj?.facilityName ?? '')
      if (nameMatch(name)) {
        const id = extractId(item)
        if (id) return id
      }
    }
    return ''
  }

  const tryFetch = async (url: string): Promise<unknown> => {
    try {
      const res = await fetch(url, { headers, signal: sig() })
      if (!res.ok) return null
      return await res.json().catch(() => null)
    } catch { return null }
  }

  const encoded = encodeURIComponent(clubName)

  for (const url of [
    `${BASE}/bokning/api/Clubs`,
    `${BASE}/bokning/api/Facilities`,
    `${BASE}/bokning/api/Clubs?numberOfPlayers=1`,
    `${BASE}/bokning/api/Clubs/search?q=${encoded}`,
    `${BASE}/bokning/api/Clubs?search=${encoded}`,
    `${BASE}/bokning/api/Clubs?name=${encoded}`,
    `${BASE}/bokning/api/Clubs/${clubId}`,
    `${BASE}/bokning/api/Facilities/${clubId}`,
  ]) {
    const data = await tryFetch(url)
    if (!data) continue
    const uuid = findInList(data) || extractId(data)
    if (uuid) return { uuid, debugInfo: `resolve:${url.split('/api/')[1]?.split('?')[0]}` }
  }

  return { uuid: clubId, debugInfo: `resolve:failed` }
}

// Fetch available tee times for the correct club and date.
//
// The key problem: Overview always returns the user's HOME club UUID (ignoring
// the facilityId parameter). We must resolve the correct UUID BEFORE calling
// Overview, otherwise we'll always find and book the home club's slots.
//
// Flow:
//   1. /bokning/api/Clubs (authenticated) → find correct UUID by club name
//   2. If found: CourseSchedule with correct UUID → correct club + correct date
//   3. If not found: Overview → extract whatever UUID it returns, log club name,
//      try CourseSchedule as fallback (may still be wrong club)
async function fetchStartTimes(
  cookies: string,
  token: string,
  facilityId: string,
  clubName: string,
  date: string,
  numberOfPlayers: number,
  courseId?: string
): Promise<{ times: TeeTime[]; rawDebug: string }> {
  const commonHeaders = {
    Cookie: cookies,
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    Origin: BASE,
    Referer: `${BASE}/bokning/`,
  }

  let rawDebug = `club="${clubName}" facilityId=${facilityId}`

  // If a specific course UUID was stored on the job, use it directly — skip all discovery.
  if (courseId) {
    rawDebug += ` directCourse=${courseId}`
    const tryFetch = async (url: string): Promise<unknown> => {
      try {
        const r = await fetch(url, { headers: commonHeaders, signal: sig() })
        if (!r.ok) { rawDebug += ` ${url.split('/api/')[1]?.split('?')[0]}:${r.status}`; return null }
        return await r.json().catch(() => null)
      } catch { return null }
    }
    const tryDateEndpoints = async (uuid: string): Promise<TeeTime[] | null> => {
      for (const url of [
        `${BASE}/bokning/api/Clubs/${uuid}/CourseSchedule?courseId=${uuid}&date=${date}&numberOfPlayers=${numberOfPlayers}`,
        `${BASE}/bokning/api/Clubs/Courses/StartTimes?CourseId=${uuid}&FacilityId=${uuid}&Date=${date}&NumberOfPlayers=${numberOfPlayers}`,
        `${BASE}/bokning/api/StartTimes?facilityId=${uuid}&date=${date}&numberOfPlayers=${numberOfPlayers}`,
      ]) {
        const data = await tryFetch(url)
        if (!data) continue
        const { slots } = extractSlots(data)
        const times = slotsToTeeTimes(slots, date, numberOfPlayers)
        if (times.length > 0) {
          rawDebug += ` found:${times.length}@${url.split('/api/')[1]?.split('?')[0]}`
          return times
        }
      }
      return null
    }
    const times = await tryDateEndpoints(courseId)
    if (times) return { times, rawDebug }
    rawDebug += ` directFailed`
    return { times: [], rawDebug }
  }

  // Name normaliser for fuzzy matching between clubs.ts names and MinGolf API names
  const norm = (s: string) => s.toLowerCase()
    .replace(/golfklubb|golfclub|golf\s*club|\bgk\b|\bgc\b|\bab\b/gi, '')
    .replace(/[^a-zåäö0-9]+/g, ' ')
    .trim()
  const nameMatch = (a: string, b: string) => {
    const na = norm(a), nb = norm(b)
    return na === nb || na.includes(nb) || nb.includes(na)
  }

  const isGUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

  // Extract first GUID from a club-like object
  const extractUUID = (obj: unknown): string => {
    const o = obj as Record<string, unknown>
    for (const k of ['id', 'Id', 'facilityId', 'FacilityId', 'courseId', 'CourseId', 'clubId', 'ClubId']) {
      if (typeof o?.[k] === 'string' && isGUID(o[k] as string)) return o[k] as string
    }
    return ''
  }

  // Search a club-list response for a UUID matching clubName
  const findUUIDInList = (data: unknown): string => {
    const list = Array.isArray(data) ? data
      : ((data as Record<string, unknown>)?.clubs
        ?? (data as Record<string, unknown>)?.items
        ?? (data as Record<string, unknown>)?.Clubs
        ?? (data as Record<string, unknown>)?.facilities
        ?? (data as Record<string, unknown>)?.Facilities
        ?? (data as Record<string, unknown>)?.courses
        ?? (data as Record<string, unknown>)?.Courses)
    if (!Array.isArray(list)) return ''
    for (const item of list) {
      const o = item as Record<string, unknown>
      const n = String(o?.name ?? o?.Name ?? o?.clubName ?? o?.ClubName ?? o?.facilityName ?? o?.FacilityName ?? '')
      if (nameMatch(n, clubName)) {
        const uuid = extractUUID(item)
        if (uuid) return uuid
      }
    }
    return ''
  }

  const tryFetch = async (url: string): Promise<unknown> => {
    try {
      const r = await fetch(url, { headers: commonHeaders, signal: sig() })
      if (!r.ok) { rawDebug += ` ${url.split('/api/')[1]?.split('?')[0]}:${r.status}`; return null }
      return await r.json().catch(() => null)
    } catch { return null }
  }

  // ---------- Phase 1: Resolve correct UUID via authenticated clubs endpoint ----------
  // /bokning/api/Clubs requires auth (returns 401 without it) — with auth it returns
  // all bookable clubs with their real GolfBox UUIDs.
  let correctUUID = ''
  const enc = encodeURIComponent(clubName)

  for (const url of [
    `${BASE}/bokning/api/Clubs`,
    `${BASE}/bokning/api/Clubs?numberOfPlayers=${numberOfPlayers}`,
    `${BASE}/bokning/api/Clubs/search?q=${enc}`,
    `${BASE}/bokning/api/Clubs?search=${enc}`,
    `${BASE}/bokning/api/Clubs?facilityName=${enc}`,
    `${BASE}/bokning/api/Courses`,
    `${BASE}/bokning/api/Courses/search?q=${enc}`,
    `${BASE}/bokning/api/Facilities`,
    `${BASE}/bokning/api/Facilities/search?q=${enc}`,
  ]) {
    const data = await tryFetch(url)
    if (!data) continue
    // Log a snippet so we can see what structure the response has
    if (!rawDebug.includes('clubsBody')) {
      rawDebug += ` clubsBody:${JSON.stringify(data).substring(0, 300)}`
    }
    const uuid = findUUIDInList(data) || (isGUID(extractUUID(data)) ? extractUUID(data) : '')
    if (uuid) { correctUUID = uuid; rawDebug += ` resolvedFrom:${url.split('/api/')[1]?.split('?')[0]}`; break }
  }

  rawDebug += correctUUID ? ` correctUUID=${correctUUID}` : ` correctUUID=UNRESOLVED`

  // ---------- Phase 2: Use correct UUID for date-specific queries ----------
  const tryDateEndpoints = async (uuid: string): Promise<TeeTime[] | null> => {
    const urls = [
      `${BASE}/bokning/api/Clubs/${uuid}/CourseSchedule?courseId=${uuid}&date=${date}&numberOfPlayers=${numberOfPlayers}`,
      `${BASE}/bokning/api/Clubs/Courses/StartTimes?CourseId=${uuid}&FacilityId=${uuid}&Date=${date}&NumberOfPlayers=${numberOfPlayers}`,
      `${BASE}/bokning/api/StartTimes?facilityId=${uuid}&date=${date}&numberOfPlayers=${numberOfPlayers}`,
    ]
    for (const url of urls) {
      const data = await tryFetch(url)
      if (!data) continue
      const { slots } = extractSlots(data)
      const times = slotsToTeeTimes(slots, date, numberOfPlayers)
      if (times.length > 0) {
        rawDebug += ` found:${times.length}@${url.split('/api/')[1]?.split('?')[0]}`
        return times
      }
    }
    return null
  }

  if (correctUUID) {
    // Phase 2: Overview with ONLY FacilityId (no CourseId) returns favouriteClubs[] for the
    // requested club with coursesAndTees[]. Passing CourseId causes the API to ignore FacilityId
    // and return home club data instead — so we must NOT include CourseId here.
    const ovUrl = `${BASE}/bokning/api/Clubs/Courses/StartTimes/Overview?FacilityId=${correctUUID}&Date=${date}&NumberOfPlayers=${numberOfPlayers}`
    const ovData = await tryFetch(ovUrl)
    if (ovData) {
      const d = ovData as Record<string, unknown>
      const clubs = d?.favouriteClubs
      if (Array.isArray(clubs)) {
        for (const club of clubs) {
          const c = club as Record<string, unknown>
          if (c?.id !== correctUUID) continue
          const coursesAndTees = c?.coursesAndTees
          if (Array.isArray(coursesAndTees)) {
            for (const course of coursesAndTees) {
              const cc = course as Record<string, unknown>
              const courseId = String(cc?.id ?? '')
              if (!courseId.includes('-')) continue
              rawDebug += ` courseUUID=${courseId}(${String(cc?.name ?? '')})`
              const times = await tryDateEndpoints(courseId)
              if (times) return { times, rawDebug }
            }
          }
          break
        }
      }
    }

    // Fallback: some clubs use the same UUID for club and course
    const times = await tryDateEndpoints(correctUUID)
    if (times) return { times, rawDebug }

    rawDebug += ` allEndpoints:0`
    return { times: [], rawDebug }
  }

  // ---------- Phase 3: Overview fallback — only reached when club UUID could not be resolved ----------
  const overviewUrl = new URL(`${BASE}/bokning/api/Clubs/Courses/StartTimes/Overview`)
  overviewUrl.searchParams.set('CourseId', facilityId)
  overviewUrl.searchParams.set('FacilityId', facilityId)
  overviewUrl.searchParams.set('Date', date)
  overviewUrl.searchParams.set('NumberOfPlayers', String(numberOfPlayers))

  const res = await fetch(overviewUrl.toString(), { method: 'GET', headers: commonHeaders, signal: sig() })
  const rawBody = await res.text().catch(() => '')
  if (!res.ok) throw new Error(`StartTimes HTTP ${res.status}: ${rawBody.substring(0, 200)}`)

  let overviewData: unknown
  try { overviewData = JSON.parse(rawBody) } catch {
    throw new Error(`StartTimes ej JSON: ${rawBody.substring(0, 150)}`)
  }

  const { slots: overviewSlots, courseUUID: overviewUUID } = extractSlots(overviewData)
  const overviewD = overviewData as Record<string, unknown>
  const schedObj = overviewD?.courseSchedule as Record<string, unknown> | undefined
  const returnedClubName = String(schedObj?.name ?? schedObj?.Name ?? schedObj?.courseName
    ?? schedObj?.CourseName ?? schedObj?.facilityName ?? schedObj?.FacilityName ?? '')

  rawDebug += ` overview:uuid=${overviewUUID || 'none'} returnedClub="${returnedClubName}" slots=${overviewSlots.length}`

  if (overviewUUID) {
    const times = await tryDateEndpoints(overviewUUID)
    if (times) return { times, rawDebug }
  }

  const overviewTimes = slotsToTeeTimes(overviewSlots, date, numberOfPlayers)
  if (overviewTimes.length > 0) {
    rawDebug += ` found:${overviewTimes.length}@Overview-direct`
    return { times: overviewTimes, rawDebug }
  }

  rawDebug += ` allEndpoints:0`
  return { times: [], rawDebug }
}

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

  const lockUrl = `${BASE}/bokning/api/Slot/${slotId}/Lock?date=${date}`
  const bookUrl = `${BASE}/bokning/api/Slot/${slotId}/Bookings?date=${date}`

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

  const bookRes = await fetch(bookUrl, {
    method: 'POST', headers,
    body: JSON.stringify(slotBookings),
    signal: sig(),
  })
  const bookBody = await bookRes.text().catch(() => '')

  await fetch(lockUrl, { method: 'DELETE', headers, signal: sig() }).catch(() => {})

  if (bookRes.status === 401) throw new Error('Token ogiltig vid bokning')
  if (!bookRes.ok) throw new Error(`Bokning HTTP ${bookRes.status}: ${bookBody.substring(0, 300)}`)
  return true
}

export async function scanAndBook(job: Job): Promise<ScanResult> {
  let cookies: string
  try {
    cookies = await loginMinGolf(job.golf_id, job.golf_password)
  } catch (err) {
    return { found: false, teeTimes: [], error: err instanceof Error ? err.message : 'Inloggning misslyckades' }
  }

  const { cookies: enriched, profile } = await enrichCookies(cookies)
  cookies = enriched

  let token: string
  try {
    token = await getGolfBoxToken(cookies)
  } catch (err) {
    return { found: false, teeTimes: [], error: err instanceof Error ? err.message : 'Token misslyckades' }
  }

  let allTimes: TeeTime[]
  let rawDebug = ''
  try {
    const result = await fetchStartTimes(cookies, token, job.club_id, job.club_name, job.date, job.num_players, job.course_id ?? undefined)
    allTimes = result.times
    rawDebug = result.rawDebug
  } catch (err) {
    return { found: false, teeTimes: [], error: err instanceof Error ? err.message : 'Kunde inte hämta tider' }
  }

  const teeTimes = allTimes.filter((t) => timeInRange(t.time, job.time_from, job.time_to))

  if (teeTimes.length === 0) return { found: false, teeTimes: [], debug: rawDebug }
  if (job.mode === 'notify') return { found: true, teeTimes }

  const withId = teeTimes.filter((t) => t.slotId)
  const candidates = withId.length <= 10 ? withId : (() => {
    const step = Math.floor(withId.length / 10)
    return withId.filter((_, i) => i % step === 0).slice(0, 10)
  })()
  if (candidates.length === 0) {
    const sample = JSON.stringify(teeTimes[0]).substring(0, 200)
    return { found: true, teeTimes, error: `Inget slot-ID (slot: ${sample})`, debug: rawDebug }
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
