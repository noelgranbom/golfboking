/**
 * Golfboking-bot — kör lokalt på Mac
 * Skannar MinGolf var 30:e sekund.
 *
 * Starta: node bot.js
 */

import { chromium } from 'playwright'
import Anthropic from '@anthropic-ai/sdk'

const API_BASE = 'https://golfboking.vercel.app'
const CRON_SECRET = 'golfboking-cron-secret-2026'
const SCAN_INTERVAL_MS = 30_000
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// ── API-hjälpare ───────────────────────────────────────────────────────────

async function getActiveJobs() {
  const res = await fetch(`${API_BASE}/api/jobs`)
  if (!res.ok) throw new Error(`Kunde inte hämta jobb: ${res.status}`)
  const jobs = await res.json()
  return jobs.filter((j) => j.status === 'active')
}

async function log(jobId, level, message) {
  console.log(`  [${level}] ${message}`)
  await fetch(`${API_BASE}/api/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, level, message }),
  }).catch(() => {})
}

async function updateJob(jobId, patch) {
  await fetch(`${API_BASE}/api/jobs/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).catch(() => {})
}

async function getAIRecommendation(job, teeTimes) {
  if (!ANTHROPIC_API_KEY || teeTimes.length <= 1) return null
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Du är en golfassistent. Rekommendera den bästa starttiden bland dessa alternativ.

Klubb: ${job.club_name}
Datum: ${job.date}
Önskat tidsfönster: ${job.time_from}–${job.time_to}
Antal spelare: ${job.num_players}
Tillgängliga tider: ${teeTimes.join(', ')}

Svara ENBART med JSON i detta format (ingen annan text):
{"recommendedTime":"HH:MM","explanation":"En kort mening på svenska som förklarar varför denna tid är bäst."}`,
      }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    return JSON.parse(text)
  } catch { return null }
}

function timeInRange(time, from, to) {
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const [hh] = time.split(':').map(Number)
  return hh >= 6 && hh <= 20 && toMin(time) >= toMin(from) && toMin(time) <= toMin(to)
}

// ── MinGolf-skanner ────────────────────────────────────────────────────────

async function scanJob(job) {
  console.log(`\n[${new Date().toLocaleTimeString('sv-SE')}] Skannar ${job.club_name} ${job.date}…`)
  await log(job.id, 'info', `Skannar ${job.club_name} för ${job.date} kl. ${job.time_from}–${job.time_to}…`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    locale: 'sv-SE',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()

  try {
    // 1. Gå till startsidan (login-form visas direkt)
    await page.goto('https://mingolf.golf.se/', { waitUntil: 'networkidle', timeout: 20000 })

    // Avvisa cookie-banner om den visas
    try {
      await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll', { timeout: 4000 })
      await page.waitForTimeout(1000)
    } catch { /* cookie-banner kanske inte visas */ }

    // 2. Vänta på login-formuläret
    await page.waitForSelector('input[placeholder="Golf-ID"]', { timeout: 12000 })
    await page.fill('input[placeholder="Golf-ID"]', job.golf_id)
    await page.fill('input[placeholder="Lösenord"]', job.golf_password)
    await page.click('button:has-text("Logga in")')

    // 3. Vänta på att login lyckas (URL ändras eller välkomsttext visas)
    await page.waitForTimeout(3000)
    const currentUrl = page.url()
    const bodyText = await page.textContent('body')

    if (bodyText.includes('Felaktigt') || bodyText.includes('fel Golf-ID') || bodyText.includes('Inloggning misslyckades')) {
      await log(job.id, 'error', 'Inloggning misslyckades — kontrollera Golf-ID och lösenord')
      return
    }

    // 4. Navigera till klubbens bokningssida
    await page.goto(`https://mingolf.golf.se/bokning/${job.club_id}`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(3000)

    // 5. Ta en screenshot för felsökning
    await page.screenshot({ path: `/tmp/mingolf_booking_${job.club_id}.png` })

    // 6. Försök välja datum om det finns en datumväljare
    const dateFormatted = job.date // YYYY-MM-DD
    try {
      // Klicka på rätt datum i kalendern
      const dateSelectors = [
        `[data-date="${dateFormatted}"]`,
        `[data-value="${dateFormatted}"]`,
        `td[data-date="${dateFormatted}"]`,
        `button[aria-label*="${job.date.split('-').reverse().join('/')}"]`,
      ]
      for (const sel of dateSelectors) {
        const el = await page.$(sel)
        if (el) { await el.click(); await page.waitForTimeout(2000); break }
      }
    } catch { /* datum-klick misslyckades, fortsätt */ }

    // 7. Hämta sidans text och leta efter tider
    await page.waitForTimeout(2000)
    const pageText = await page.textContent('body')

    // Extrahera tidssträngar (HH:MM)
    const allTimes = [...pageText.matchAll(/\b(\d{2}:\d{2})\b/g)].map((m) => m[1])
    const uniqueTimes = [...new Set(allTimes)]
    const matchingTimes = uniqueTimes.filter((t) => timeInRange(t, job.time_from, job.time_to))

    if (matchingTimes.length === 0) {
      await log(job.id, 'info', 'Inga lediga tider hittades.')
      await updateJob(job.id, {
        last_scan_at: new Date().toISOString(),
        next_scan_at: new Date(Date.now() + SCAN_INTERVAL_MS).toISOString(),
      })
      return
    }

    console.log(`  ✓ Hittade tider: ${matchingTimes.join(', ')}`)
    await log(job.id, 'success', `${matchingTimes.length} ledig tid(er) hittad: ${matchingTimes.join(', ')}`)

    // AI-rekommendation
    const recommendation = await getAIRecommendation(job, matchingTimes)
    if (recommendation) {
      console.log(`  🤖 AI rekommenderar: ${recommendation.recommendedTime} — ${recommendation.explanation}`)
      await log(job.id, 'info', `🤖 AI rekommenderar: ${recommendation.recommendedTime} — ${recommendation.explanation}`)
    }

    if (job.mode === 'notify') {
      // Trigga mail via Vercel-endpointen (som känner till jobbet)
      await fetch(`${API_BASE}/api/cron`, {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      })
      await updateJob(job.id, { status: 'completed', last_scan_at: new Date().toISOString() })
      console.log(`  ✉ Notis skickad!`)
      return
    }

    // Auto-läge: boka första matchande tid
    if (job.mode === 'auto') {
      const firstTime = matchingTimes[0]

      const clicked = await page.evaluate((time) => {
        const el = [...document.querySelectorAll('button, a, [role="button"], td')]
          .find((e) => e.textContent?.trim() === time || e.textContent?.trim().startsWith(time))
        if (el) { el.click(); return true }
        return false
      }, firstTime)

      if (!clicked) {
        await log(job.id, 'warning', `Hittade tid ${firstTime} men kunde inte klicka på den.`)
        await updateJob(job.id, {
          last_scan_at: new Date().toISOString(),
          next_scan_at: new Date(Date.now() + SCAN_INTERVAL_MS).toISOString(),
        })
        return
      }

      await page.waitForTimeout(2500)

      // Sätt antal spelare om möjligt
      try {
        const playerSel = await page.$('select')
        if (playerSel) await page.selectOption('select', String(job.num_players))
      } catch { /* ingen select-ruta */ }

      // Bekräfta bokning
      try {
        const confirmBtn = await page.$('button:has-text("Boka"), button:has-text("Bekräfta"), button[type="submit"]')
        if (confirmBtn) {
          await confirmBtn.click()
          await page.waitForTimeout(2500)
          await log(job.id, 'success', `Bokade tid kl. ${firstTime}! Skickar bekräftelse via mail…`)
          await updateJob(job.id, {
            status: 'completed',
            booked_tee_time: firstTime,
            last_scan_at: new Date().toISOString(),
          })
          console.log(`  ⛳ Bokade ${firstTime} på ${job.club_name}!`)
        } else {
          await log(job.id, 'warning', 'Hittade tid men bekräftelseknapp hittades inte.')
        }
      } catch (e) {
        await log(job.id, 'warning', `Bokningsfel: ${e.message}`)
      }
    }
  } catch (err) {
    const msg = err.message?.split('\n')[0] || 'Okänt fel'
    console.error(`  ✗ Fel: ${msg}`)
    await log(job.id, 'error', `Fel: ${msg}`)
    await updateJob(job.id, {
      last_scan_at: new Date().toISOString(),
      next_scan_at: new Date(Date.now() + SCAN_INTERVAL_MS).toISOString(),
    })
  } finally {
    await browser.close()
  }
}

// ── Huvudloop ──────────────────────────────────────────────────────────────

async function loop() {
  try {
    const jobs = await getActiveJobs()
    if (jobs.length === 0) {
      process.stdout.write('.')
      return
    }
    for (const job of jobs) {
      await scanJob(job)
    }
  } catch (err) {
    console.error('\nFel i huvudloop:', err.message)
  }
}

console.log('🏌️  Golfboking-bot startar...')
console.log(`   Skannar var ${SCAN_INTERVAL_MS / 1000}s | Ctrl+C för att avsluta\n`)

loop()
setInterval(loop, SCAN_INTERVAL_MS)
