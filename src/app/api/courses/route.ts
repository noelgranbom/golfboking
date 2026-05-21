import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://mingolf.golf.se'

function sig() { return AbortSignal.timeout(8000) }

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const { golf_id, golf_password, club_name } = await req.json()

  try {
    const loginRes = await fetch(`${BASE}/login/api/Users/Login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ GolfId: golf_id, Password: golf_password }),
      redirect: 'manual',
      signal: sig(),
    })
    if (!loginRes.ok && loginRes.status !== 302) {
      return NextResponse.json({ courses: [] })
    }
    const setCookie = loginRes.headers.getSetCookie?.() ?? []
    let cookies = setCookie.map((c: string) => c.split(';')[0]).join('; ')

    try {
      const enrichRes = await fetch(`${BASE}/bokning/`, {
        headers: { Cookie: cookies, Accept: 'text/html' },
        redirect: 'follow',
        signal: sig(),
      })
      const newCookies = enrichRes.headers.getSetCookie?.() ?? []
      if (newCookies.length > 0) {
        cookies = `${cookies}; ${newCookies.map((c: string) => c.split(';')[0]).join('; ')}`
      }
    } catch { /* continue without enriched cookies */ }

    let token = ''
    for (const base of [`${BASE}/bokning/api`, `${BASE}/login/api`]) {
      try {
        const r = await fetch(`${base}/Users/GolfBox/Token`, {
          method: 'POST',
          headers: { Cookie: cookies, Accept: 'application/json', 'Content-Type': 'application/json' },
          body: '{}',
          signal: sig(),
        })
        const body = await r.text()
        if (r.ok && body.length > 10) { token = body.replace(/"/g, ''); break }
      } catch { /* try next */ }
    }

    const headers = {
      Cookie: cookies,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      Origin: BASE,
      Referer: `${BASE}/bokning/`,
    }

    const norm = (s: string) => s.toLowerCase()
      .replace(/golfklubb|golfclub|\bgk\b|\bgc\b/gi, '')
      .replace(/[^a-zåäö0-9]+/g, ' ')
      .trim()

    let clubUUID = ''
    const clubsRes = await fetch(`${BASE}/bokning/api/Clubs`, { headers, signal: sig() })
    if (clubsRes.ok) {
      const clubs = await clubsRes.json()
      for (const c of clubs) {
        const n = String(c?.name ?? '')
        const cn = norm(n), rn = norm(club_name)
        if (cn === rn || cn.includes(rn) || rn.includes(cn)) { clubUUID = String(c.id); break }
      }
    }

    if (!clubUUID) return NextResponse.json({ courses: [] })

    const ovRes = await fetch(
      `${BASE}/bokning/api/Clubs/Courses/StartTimes/Overview?FacilityId=${clubUUID}&NumberOfPlayers=1`,
      { headers, signal: sig() }
    )
    if (!ovRes.ok) return NextResponse.json({ courses: [] })
    const ovData = await ovRes.json()

    const favClubs: unknown[] = ovData?.favouriteClubs ?? []
    for (const club of favClubs) {
      const c = club as Record<string, unknown>
      if (c?.id !== clubUUID) continue
      const courses = ((c?.coursesAndTees as unknown[]) ?? [])
        .map((course) => {
          const cc = course as Record<string, unknown>
          return { id: String(cc?.id ?? ''), name: String(cc?.name ?? '') }
        })
        .filter((c) => c.id.includes('-'))
      return NextResponse.json({ courses })
    }

    return NextResponse.json({ courses: [] })
  } catch {
    return NextResponse.json({ courses: [] })
  }
}
