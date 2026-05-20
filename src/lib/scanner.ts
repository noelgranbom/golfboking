import { createServiceClient } from './supabase'
import { scanAndBook } from './bot/mingolf'
import { sendNotificationEmail, sendBookingConfirmationEmail, sendErrorEmail } from './email'
import { recommendTeeTime } from './ai'
import type { Job } from './types'

type SupabaseClient = ReturnType<typeof createServiceClient>

export async function addLog(
  supabase: SupabaseClient,
  jobId: string,
  level: 'info' | 'success' | 'error' | 'warning',
  message: string
) {
  await supabase.from('logs').insert({ job_id: jobId, level, message })
}

export async function processJob(job: Job, supabase: SupabaseClient) {
  const nextScanAt = new Date(Date.now() + 30_000).toISOString()

  const fmt = (t: string) => t.substring(0, 5)
  await addLog(supabase, job.id, 'info', `Skannar ${job.club_name} för ${job.date} kl. ${fmt(job.time_from)}–${fmt(job.time_to)}…`)

  try {
    const result = await scanAndBook(job)

    await supabase.from('jobs').update({
      last_scan_at: new Date().toISOString(),
      next_scan_at: nextScanAt,
    }).eq('id', job.id)

    if (result.debug) {
      await addLog(supabase, job.id, 'info', `DEBUG: ${result.debug}`)
    }

    if (result.error) {
      await addLog(supabase, job.id, 'error', `Fel: ${result.error}`)
      return
    }

    if (!result.found || result.teeTimes.length === 0) {
      await addLog(supabase, job.id, 'info', 'Inga lediga tider hittades.')
      return
    }

    if (job.mode === 'notify') {
      const times = result.teeTimes.map((t) => t.time)
      const recommendation = process.env.ANTHROPIC_API_KEY
        ? await recommendTeeTime(job, times)
        : null

      if (recommendation) {
        await addLog(supabase, job.id, 'info', `🤖 AI rekommenderar: ${recommendation.recommendedTime} — ${recommendation.explanation}`)
      }

      await addLog(supabase, job.id, 'success', `${result.teeTimes.length} ledig tid(er) hittad! Skickar mail till ${job.email}…`)
      await sendNotificationEmail(job, result.teeTimes, recommendation)
      await addLog(supabase, job.id, 'success', 'Notis skickad via mail.')
      await supabase.from('jobs').update({ status: 'completed' }).eq('id', job.id)
    } else {
      if (result.bookedTime) {
        await addLog(supabase, job.id, 'success', `Bokade tid kl. ${result.bookedTime}! Skickar bekräftelse till ${job.email}…`)
        await sendBookingConfirmationEmail(job, result.bookedTime)
        await supabase.from('jobs').update({
          status: 'completed',
          booked_tee_time: result.bookedTime,
        }).eq('id', job.id)
      } else {
        await addLog(supabase, job.id, 'warning', 'Tider hittades men bokning misslyckades. Försöker igen.')
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    await addLog(supabase, job.id, 'error', `Kritiskt fel: ${message}`)
    await supabase.from('jobs').update({ next_scan_at: nextScanAt }).eq('id', job.id)
    try { await sendErrorEmail(job, message) } catch { /* ignore */ }
  }
}
