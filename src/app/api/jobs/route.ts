import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import type { CreateJobInput } from '@/lib/types'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body: CreateJobInput = await req.json()

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      ...body,
      status: 'active',
      next_scan_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log job creation
  await supabase.from('logs').insert({
    job_id: data.id,
    level: 'info',
    message: `Bevakning startad för ${body.club_name} ${body.date} kl. ${body.time_from}–${body.time_to}`,
  })

  return NextResponse.json(data, { status: 201 })
}
