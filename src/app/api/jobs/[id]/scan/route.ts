import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { processJob } from '@/lib/scanner'

export const maxDuration = 60

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .eq('status', 'active')
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found or not active' }, { status: 404 })
  }

  // Skip if it's too soon since last scan
  if (job.next_scan_at && new Date(job.next_scan_at) > new Date()) {
    return NextResponse.json({ skipped: true, next_scan_at: job.next_scan_at })
  }

  await processJob(job, supabase)
  return NextResponse.json({ ok: true })
}
