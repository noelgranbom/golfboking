import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { processJob } from '@/lib/scanner'
import type { Job } from '@/lib/types'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'active')
    .or(`next_scan_at.is.null,next_scan_at.lte.${now.toISOString()}`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!jobs || jobs.length === 0) return NextResponse.json({ message: 'No jobs to process', processed: 0 })

  const results = await Promise.allSettled(jobs.map((job: Job) => processJob(job, supabase)))
  const processed = results.filter((r) => r.status === 'fulfilled').length
  return NextResponse.json({ processed, total: jobs.length })
}
