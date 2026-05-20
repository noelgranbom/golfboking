'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Job, Log } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface DashboardProps {
  job: Job
  onDelete: () => void
}

const LOG_COLORS: Record<string, string> = {
  info: 'text-blue-300',
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-yellow-400',
}

const LOG_ICONS: Record<string, string> = {
  info: 'ℹ',
  success: '✓',
  error: '✗',
  warning: '⚠',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  paused: 'Pausad',
  completed: 'Klar',
  failed: 'Misslyckad',
}

export function Dashboard({ job: initialJob, onDelete }: DashboardProps) {
  const [job, setJob] = useState(initialJob)
  const [logs, setLogs] = useState<Log[]>([])
  const [countdown, setCountdown] = useState<number | null>(null)

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/logs?job_id=${job.id}`)
    if (res.ok) {
      const data = await res.json()
      setLogs(data)
    }
  }, [job.id])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Subscribe to real-time log updates
  useEffect(() => {
    const channel = supabase
      .channel(`logs-${job.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'logs', filter: `job_id=eq.${job.id}` },
        (payload) => {
          setLogs((prev) => [payload.new as Log, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [job.id])

  // Subscribe to job status updates
  useEffect(() => {
    const channel = supabase
      .channel(`job-${job.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${job.id}` },
        (payload) => {
          setJob((prev) => ({ ...prev, ...payload.new }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [job.id])

  // Client-side scan polling (handles preview deploys where Vercel Crons don't run)
  useEffect(() => {
    if (job.status !== 'active') return

    async function triggerScan() {
      await fetch(`/api/jobs/${job.id}/scan`, { method: 'POST' })
    }

    // Trigger immediately, then every 30s
    triggerScan()
    const interval = setInterval(triggerScan, 30_000)
    return () => clearInterval(interval)
  }, [job.id, job.status])

  // Countdown to next scan
  useEffect(() => {
    if (!job.next_scan_at || job.status !== 'active') return

    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(job.next_scan_at!).getTime() - Date.now()) / 1000))
      setCountdown(diff)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [job.next_scan_at, job.status])

  const handleDelete = async () => {
    if (!confirm('Är du säker på att du vill ta bort denna bevakning?')) return
    await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' })
    onDelete()
  }

  const statusColor = {
    active: 'text-gold',
    paused: 'text-yellow-400',
    completed: 'text-blue-400',
    failed: 'text-red-400',
  }[job.status] || 'text-white/50'

  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-white/10 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {job.status === 'active' && (
              <span className="inline-block w-2 h-2 rounded-full bg-gold" style={{ animation: 'pulse-dot 1.5s ease-in-out infinite' }} />
            )}
            <span className={`text-sm font-semibold ${statusColor}`}>
              {STATUS_LABELS[job.status]}
            </span>
            <span className="text-white/20">•</span>
            <span className="text-white/50 text-sm capitalize">{job.mode === 'notify' ? 'Notis-läge' : 'Auto-läge'}</span>
          </div>
          <h3 className="text-white font-semibold text-lg">{job.club_name}</h3>
          <p className="text-white/50 text-sm">
            {job.date} kl. {job.time_from.substring(0, 5)}–{job.time_to.substring(0, 5)} · {job.num_players} spelare
          </p>
          {job.friend_golf_ids?.length > 0 && (
            <p className="text-white/30 text-xs mt-1">
              Medspelare: {job.friend_golf_ids.join(', ')}
            </p>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="text-white/20 hover:text-red-400 transition-colors text-xl leading-none p-1"
          title="Ta bort"
        >
          ×
        </button>
      </div>

      {/* Booking confirmation */}
      {job.booked_tee_time && (
        <div className="px-5 py-3 bg-gold/10 border-b border-gold/20 flex items-center gap-2">
          <p className="text-gold-light text-sm font-medium">
            Bokad tid: {job.booked_tee_time} — Bekräftelse skickad till {job.email}
          </p>
        </div>
      )}

      {/* Countdown */}
      {job.status === 'active' && countdown !== null && (
        <div className="px-5 py-2 bg-white/3 border-b border-white/5 flex items-center gap-2 text-xs text-white/40">
          <span>Nästa skanning om</span>
          <span className="font-mono text-gold">{countdown}s</span>
        </div>
      )}

      {/* Log */}
      <div className="p-4 max-h-64 overflow-y-auto space-y-1 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-white/20 text-center py-4">Inga loggar ännu…</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2 items-start">
              <span className="text-white/20 shrink-0">
                {new Date(log.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`shrink-0 ${LOG_COLORS[log.level] || 'text-white/50'}`}>
                {LOG_ICONS[log.level]}
              </span>
              <span className={LOG_COLORS[log.level] || 'text-white/50'}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
