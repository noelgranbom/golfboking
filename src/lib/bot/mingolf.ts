import type { Job } from '../types'

export interface TeeTime {
  time: string
  availableSlots: number
  bookingUrl?: string
}

export interface ScanResult {
  found: boolean
  teeTimes: TeeTime[]
  bookedTime?: string
  error?: string
}

const MINGOLF_BASE = 'https://mingolf.golf.se'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function scanAndBook(job: Job): Promise<ScanResult> {
  let chromium: typeof import('@sparticuz/chromium').default
  let puppeteer: typeof import('puppeteer-core')

  try {
    chromium = (await import('@sparticuz/chromium')).default
    puppeteer = await import('puppeteer-core')
  } catch {
    return { found: false, teeTimes: [], error: 'Browser-beroenden saknas' }
  }

  const executablePath = await chromium.executablePath()
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  })

  const page = await browser.newPage()
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  )

  try {
    // 1. Logga in
    await page.goto(`${MINGOLF_BASE}/#!/login`, { waitUntil: 'networkidle2', timeout: 15000 })

    const usernameSelector = 'input[name="username"], input[placeholder*="Golf-ID"], input[type="text"]'
    await page.waitForSelector(usernameSelector, { timeout: 10000 })

    await page.$eval(usernameSelector, (el: Element, val: string) => {
      (el as HTMLInputElement).value = val
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, job.golf_id)

    await page.$eval('input[type="password"]', (el: Element, val: string) => {
      (el as HTMLInputElement).value = val
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, job.golf_password)

    await Promise.all([
      page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
      page.click('button[type="submit"], button'),
    ])

    await sleep(2000)

    const loginError = await page.$('*::-p-text(Felaktigt), *::-p-text(Ogiltigt)')
    if (loginError) {
      return { found: false, teeTimes: [], error: 'Inloggning misslyckades — kontrollera Golf-ID och lösenord' }
    }

    // 2. Navigera till bokningssidan
    await page.goto(`${MINGOLF_BASE}/#!/bokning/${job.club_id}`, { waitUntil: 'networkidle2', timeout: 15000 })
    await sleep(2000)

    // 3. Välj datum
    const dateInput = await page.$('input[type="date"], [placeholder*="datum"]')
    if (dateInput) {
      await dateInput.click()
      await page.keyboard.down('Control')
      await page.keyboard.press('a')
      await page.keyboard.up('Control')
      await dateInput.type(job.date)
      await sleep(1000)
    }

    // 4. Scrapa lediga tider
    await page.waitForSelector('.booking-slot, .tee-time, [class*="slot"]', { timeout: 8000 }).catch(() => {})

    const teeTimes = await extractTeeTimes(page, job)

    if (teeTimes.length === 0) {
      return { found: false, teeTimes: [] }
    }

    if (job.mode === 'notify') {
      return { found: true, teeTimes }
    }

    // 5. Auto-boka första matchande tid
    const bookedTime = await bookFirstSlot(page, teeTimes, job)
    if (bookedTime) {
      return { found: true, teeTimes, bookedTime }
    }

    return { found: true, teeTimes, error: 'Hittade tider men bokning misslyckades' }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    return { found: false, teeTimes: [], error: message }
  } finally {
    await browser.close()
  }
}

async function extractTeeTimes(page: import('puppeteer-core').Page, job: Job): Promise<TeeTime[]> {
  const slots = await page.$$eval(
    '.booking-slot, .tee-time, [class*="slot"]:not([class*="disabled"]), [class*="available"]',
    (els) => els.map((el) => ({
      text: el.textContent?.trim() ?? '',
      dataTime: el.getAttribute('data-time') ?? el.getAttribute('data-start') ?? '',
    }))
  )

  const result: TeeTime[] = []
  for (const slot of slots) {
    const match = slot.text.match(/(\d{2}:\d{2})/) ?? slot.dataTime.match(/(\d{2}:\d{2})/)
    if (!match) continue
    const time = match[1]
    if (timeInRange(time, job.time_from, job.time_to)) {
      result.push({ time, availableSlots: job.num_players })
    }
  }
  return result
}

async function bookFirstSlot(page: import('puppeteer-core').Page, teeTimes: TeeTime[], job: Job): Promise<string | null> {
  const first = teeTimes[0]

  // Klicka på tids-slot
  const clicked = await page.evaluate((time: string) => {
    const el = [...document.querySelectorAll('*')].find(
      (e) => e.textContent?.trim().startsWith(time)
    ) as HTMLElement | undefined
    if (el) { el.click(); return true }
    return false
  }, first.time)

  if (!clicked) return null
  await sleep(1500)

  // Sätt antal spelare
  const playerSel = await page.$('select[name*="player"], select[name*="antal"]')
  if (playerSel) {
    await page.select('select[name*="player"], select[name*="antal"]', String(job.num_players))
  }

  // Lägg till kompisar
  for (let i = 0; i < (job.friend_golf_ids?.length ?? 0); i++) {
    const input = await page.$(`input[placeholder*="Golf-ID"]:nth-of-type(${i + 2})`)
    if (input) await input.type(job.friend_golf_ids[i])
  }

  // Bekräfta bokning
  const confirmBtn = await page.$('button[type="submit"]')
  if (!confirmBtn) return null

  await confirmBtn.click()
  await sleep(2000)

  const confirmed = await page.$('*::-p-text(bekräftad), *::-p-text(Bokad), *::-p-text(Tack)')
  return confirmed ? first.time : null
}

function timeInRange(time: string, from: string, to: string): boolean {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  return toMin(time) >= toMin(from) && toMin(time) <= toMin(to)
}
