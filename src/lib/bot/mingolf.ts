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

function timeInRange(time: string, from: string, to: string): boolean {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  return toMin(time) >= toMin(from) && toMin(time) <= toMin(to)
}

// Step 1: MinGolf login → session cookies
async function loginMinGolf(golfId: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/login/api/Users/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ GolfId: golfId, Password: password }),
    redirect: 'manual',
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

// Fetch the booking SPA bundle and extract API base URL candidates
async function discoverApiBase(cookies: string): Promise<string> {
  // Try known bundle path (may change on redeploy — we log what we find)
  const bundleRes = await fetch(`${BASE}/bokning/`, {
    headers: { Cookie: cookies, Accept: 'text/html' },
    redirect: 'follow',
  })
  const html = await bundleRes.text().catch(() => '')

  // Extract JS bundle src from HTML
  const bundleMatch = html.match(/src="(\/bokning\/assets\/[^"]+\.js)"/)
  const bundlePath = bundleMatch?.[1] ?? '/bokning/assets/index.js'

  const jsRes = await fetch(`${BASE}${bundlePath}`, {
    headers: { Cookie: cookies, Accept: '*/*' },
    redirect: 'follow',
  })
  if (!jsRes.ok) throw new Error(`Bundle HTTP ${jsRes.status} (${bundlePath})`)
  const js = await jsRes.text().catch(() => '')

  // Search for baseURL/baseUrl config patterns
  const baseUrlMatches = [
    ...js.matchAll(/baseURL\s*[:=]\s*["'`]([^"'`]{3,60})["'`]/g),
    ...js.matchAll(/baseUrl\s*[:=]\s*["'`]([^"'`]{3,60})["'`]/g),
    ...js.matchAll(/base\s*:\s*["'`](\/[^"'`\s]{2,40})["'`]/g),
  ].map(m => m[1])

  // Search for https:// URLs that look like API servers (not CDN/analytics)
  const httpsUrls = [...js.matchAll(/["'`](https:\/\/[a-z0-9.-]+(?:\/api)?[^"'`\s]{0,40})["'`]/gi)]
    .map(m => m[1])
    .filter(u => !u.includes('cookie') && !u.includes('consent') && !u.includes('google') && !u.includes('cdn'))

  // Search for paths containing GolfBox keywords
  const golfboxPaths = [...js.matchAll(/["'`](\/[a-z][^"'`\s]*(?:GolfBox|golfbox|StartTimes|Clubs)[^"'`\s]*)["'`]/g)]
    .map(m => m[1])

  const all = [...new Set([...baseUrlMatches, ...httpsUrls, ...golfboxPaths])]
  throw new Error(`API-bas kandidater (${js.length}b): ${all.slice(0, 15).join(' | ') || 'inga hittades'}`)
}

// Step 2: Exchange MinGolf session for GolfBox Bearer token
// Try multiple known base URL candidates for the token endpoint
async function getGolfBoxToken(cookies: string): Promise<string> {
  const candidates = [
    `${BASE}/login/api`,   // Same base as login — most likely
    `${BASE}/bokning/api`, // Booking SPA's own backend
    `${BASE}/api`,         // Simple prefix
    BASE,                  // Root (confirmed 404, kept as last resort)
  ]

  const errors: string[] = []

  for (const base of candidates) {
    for (const method of ['POST', 'GET'] as const) {
      const res = await fetch(`${base}/Users/GolfBox/Token`, {
        method,
        headers: {
          Cookie: cookies,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(method === 'POST' ? { body: '{}' } : {}),
      })

      const body = await res.text().catch(() => '')
      if (res.status === 404) { errors.push(`${base}: 404`); break } // wrong base, try next
      if (res.status === 401) { errors.push(`${base}: 401`); break } // wrong auth
      if (!res.ok) { errors.push(`${base}: HTTP ${res.status}`); break }

      let data: unknown = body
      try { data = JSON.parse(body) } catch { /* use raw */ }

      const token = typeof data === 'string' ? data
        : (data as Record<string, unknown>)?.token
          ?? (data as Record<string, unknown>)?.access_token
          ?? (data as Record<string, unknown>)?.accessToken
          ?? (data as Record<string, unknown>)?.Token
          ?? null

      if (typeof token !== 'string') {
        errors.push(`${base}: token ej i svar: ${JSON.stringify(data).substring(0, 100)}`)
        break
      }
      return token
    }
  }

  throw new Error(`GolfBox-token misslyckades. Testat: ${errors.join('; ')}`)
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

// Step 3: Fetch available tee times — try multiple base URL candidates including direct GolfBox
async function fetchStartTimes(
  cookies: string,
  token: string,
  facilityId: string,
  date: string,
  numberOfPlayers: number
): Promise<{ times: TeeTime[]; base: string }> {
  const candidates = [
    `${BASE}/login/api`,
    `${BASE}/bokning/api`,
    `${BASE}/api`,
    BASE,
    // GolfBox direct API candidates
    'https://api.golfbox.dk',
    'https://www.golfbox.dk/api',
    'https://booking.golfbox.dk',
    'https://golfbox.golf.se',
    'https://api.golfmore.eu',
  ]

  const errors: string[] = []

  for (const base of candidates) {
    const res = await fetch(`${base}/Clubs/Courses/StartTimes/Overview`, {
      method: 'POST',
      headers: {
        Cookie: cookies,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        CourseId: facilityId,
        FacilityId: facilityId,
        Date: date,
        NumberOfPlayers: numberOfPlayers,
      }),
    })

    const rawBody = await res.text().catch(() => '')
    if (res.status === 404) { errors.push(`${base}: 404`); continue }
    if (!res.ok) {
      errors.push(`${base}: HTTP ${res.status} ${rawBody.substring(0, 60)}`)
      continue
    }

    let data: unknown
    try { data = JSON.parse(rawBody) } catch {
      errors.push(`${base}: ej JSON`)
      continue
    }

    const d = data as Record<string, unknown>
    const slots: StartTimeSlot[] = Array.isArray(data) ? data as StartTimeSlot[]
      : (d?.startTimes ?? d?.StartTimes ?? d?.items ?? d?.Items ?? d?.slots ?? []) as StartTimeSlot[]

    const times = slots.map((s) => {
      const rawTime = s.StartTime ?? s.startTime ?? s.Time ?? s.time ?? s.Date ?? ''
      const match = rawTime.match(/(\d{2}:\d{2})/)
      return {
        time: match ? match[1] : rawTime,
        availableSlots: s.AvailablePlayers ?? s.availablePlayers ?? s.FreeSlots ?? 4,
        slotId: s.SlotId ?? s.slotId ?? s.Id ?? s.id,
      }
    }).filter((t) => t.time.match(/^\d{2}:\d{2}$/))

    return { times, base }
  }

  // All candidates failed — run bundle analysis to find the real URL
  let bundleInfo = ''
  try { await discoverApiBase(cookies) } catch (e) {
    bundleInfo = e instanceof Error ? ` | Bundle: ${e.message}` : ''
  }

  throw new Error(`StartTimes misslyckades. Testat: ${errors.join('; ')}${bundleInfo}`)
}

// Step 4: Book a slot
async function bookSlot(
  cookies: string,
  token: string,
  apiBase: string,
  slotId: string,
  numberOfPlayers: number,
  friendGolfIds: string[]
): Promise<boolean> {
  const res = await fetch(`${apiBase}/Slot/Unlock/Many`, {
    method: 'POST',
    headers: {
      Cookie: cookies,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      SlotId: slotId,
      NumberOfPlayers: numberOfPlayers,
      Players: friendGolfIds,
    }),
  })

  if (res.status === 401) throw new Error('GolfBox-token ogiltig vid bokning')
  return res.ok
}

export async function scanAndBook(job: Job): Promise<ScanResult> {
  // 1. MinGolf login
  let cookies: string
  try {
    cookies = await loginMinGolf(job.golf_id, job.golf_password)
  } catch (err) {
    return { found: false, teeTimes: [], error: err instanceof Error ? err.message : 'Inloggning misslyckades' }
  }

  // 2. Get GolfBox token (tries multiple base URL candidates)
  let token: string
  try {
    token = await getGolfBoxToken(cookies)
  } catch (err) {
    // If token probe failed, also run bundle analysis so we can see what's in the JS
    let bundleInfo = ''
    try { await discoverApiBase(cookies) } catch (e) {
      bundleInfo = e instanceof Error ? ` | ${e.message}` : ''
    }
    const msg = err instanceof Error ? err.message : 'GolfBox-token misslyckades'
    return { found: false, teeTimes: [], error: msg + bundleInfo }
  }

  // 3. Fetch start times (tries multiple base URL candidates)
  let allTimes: TeeTime[]
  let workingBase: string
  try {
    const result = await fetchStartTimes(cookies, token, job.club_id, job.date, job.num_players)
    allTimes = result.times
    workingBase = result.base
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
    const booked = await bookSlot(cookies, token, workingBase, first.slotId, job.num_players, job.friend_golf_ids ?? [])
    if (booked) return { found: true, teeTimes, bookedTime: first.time }
    return { found: true, teeTimes, error: 'Hittade tider men bokning misslyckades' }
  } catch (err) {
    return { found: true, teeTimes, error: err instanceof Error ? err.message : 'Bokning misslyckades' }
  }
}
