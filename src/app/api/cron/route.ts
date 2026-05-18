import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { scanAndBook } from '@/lib/bot/mingolf'
import { sendNotificationEmail, sendBookingConfirmationEmail, sendErrorEmail } from '@/lib/email'
import { recommendTeeTime } from '@/lib/ai'
import type { Job } from '@/lib/types'

export const maxDuration = 60 // seconds

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Get all active jobs due for scanning
  const now = new Date()
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'active')
    .or(`next_scan_at.is.null,next_scan_at.lte.${now.toISOString()}`)

  if (error) {
    console.error('Failed to fetch jobs:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ message: 'No jobs to process', processed: 0 })
  }

  const results = await Promise.allSettled(jobs.map((job: Job) => processJob(job, supabase)))

  const processed = results.filter((r) => r.status === 'fulfilled').length
  return NextResponse.json({ processed, total: jobs.length })
}

async function processJob(job: Job, supabase: ReturnType<typeof createServiceClient>) {
  const nextScanAt = new Date(Date.now() + 30_000).toISOString() // 30s from now

  await addLog(supabase, job.id, 'info', `Skannar ${job.club_name} för ${job.date} kl. ${job.time_from}–${job.time_to}…`)

  try {
    const result = await scanAndBook(job)

    // Update last/next scan times
    await supabase.from('jobs').update({
      last_scan_at: new Date().toISOString(),
      next_scan_at: nextScanAt,
    }).eq('id', job.id)

    if (result.error) {
      await addLog(supabase, job.id, 'error', `Fel: ${result.error}`)
      // Send error email if persistent failures could be tracked here
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
      // Pause job after notifying so we don't spam
      await supabase.from('jobs').update({ status: 'completed' }).eq('id', job.id)
    } else {
      // Auto mode
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

    try {
      await sendErrorEmail(job, message)
    } catch {
      // Don't fail if email also fails
    }
  }
}

async function addLog(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  level: 'info' | 'success' | 'error' | 'warning',
  message: string
) {
  await supabase.from('logs').insert({ job_id: jobId, level, message })
}
