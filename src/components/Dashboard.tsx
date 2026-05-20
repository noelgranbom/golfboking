'use client'

import { useState, useEffect, useCallback } from 'react'
import { Info, Check, X, TriangleAlert } from 'lucide-react'
import type { Job, Log } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface DashboardProps {
  job: Job
  onDelete: () => void
}

const LOG_COLORS: Record<string, string> = {
  info:    'text-[var(--gb-info)]',
  success: 'text-[var(--gb-success)]',
  error:   'text-[var(--gb-error)]',
  warning: 'text-[var(--gb-warning)]',
}

const LOG_ICONS: Record<string, React.ReactNode> = {
  info:    <Info    size={12} strokeWidth={1.75} />,
  success: <Check   size={12} strokeWidth={1.75} />,
  error:   <X       size={12} strokeWidth={1.75} />,
  warning: <TriangleAlert size={12} strokeWidth={1.75} />,
}

const STATUS_LABELS: Record<string, string> = {
  active:    'Aktiv',
  paused:    'Pausad',
  completed: 'Klar',
  failed:    'Misslyckad',
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

  useEffect(() => {
    if (job.status !== 'active') return

    async function triggerScan() {
      await fetch(`/api/jobs/${job.id}/scan`, { method: 'POST' })
    }

    triggerScan()
    const interval = setInterval(triggerScan, 30_000)
    return () => clearInterval(interval)
  }, [job.id, job.status])

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
    active:    'text-[var(--gb-brass)]',
    paused:    'text-[var(--gb-warning)]',
    completed: 'text-[var(--gb-info)]',
    failed:    'text-[var(--gb-error)]',
  }[job.status] || 'text-[var(--gb-fg-faint)]'

  return (
    <div className="bg-[var(--gb-bg-card)] rounded-[var(--gb-radius-xl)] border border-[var(--gb-border)] overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-[var(--gb-border)] flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {job.status === 'active' && (
              <span
                className="inline-block w-2 h-2 rounded-full bg-[var(--gb-brass)]"
                style={{ animation: 'pulse-dot 1.5s ease-in-out infinite' }}
              />
            )}
            <span className={`text-sm font-semibold ${statusColor}`}>
              {STATUS_LABELS[job.status]}
            </span>
            <span className="text-[var(--gb-fg-faint)]">·</span>
            <span className="text-[var(--gb-fg-soft)] text-sm capitalize">
              {job.mode === 'notify' ? 'Notis' : 'Auto'}
            </span>
          </div>
          <h3
            className="text-[var(--gb-fg)] font-semibold text-lg"
            style={{ fontFamily: 'var(--gb-font-display)' }}
          >
            {job.club_name}
          </h3>
          <p className="text-[var(--gb-fg-muted)] text-sm">
            {job.date} kl. {job.time_from.substring(0, 5)}–{job.time_to.substring(0, 5)} · {job.num_players} spelare
          </p>
          {job.friend_golf_ids?.length > 0 && (
            <p className="text-[var(--gb-fg-soft)] text-xs mt-1">
              Medspelare: {job.friend_golf_ids.join(', ')}
            </p>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="text-[var(--gb-fg-faint)] hover:text-[var(--gb-error)] transition-colors duration-[var(--gb-dur-fast)] text-xl leading-none p-1"
          title="Ta bort"
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>

      {/* Bokningsbekräftelse */}
      {job.booked_tee_time && (
        <div className="px-5 py-3 bg-[var(--gb-brass)]/10 border-b border-[var(--gb-brass)]/20 flex items-center gap-2">
          <p className="text-[var(--gb-brass)] text-sm font-medium">
            Bokad tid: {job.booked_tee_time} — Bekräftelse skickad till {job.email}
          </p>
        </div>
      )}

      {/* Nedräkning */}
      {job.status === 'active' && countdown !== null && (
        <div className="px-5 py-2 bg-[var(--gb-bg-card)] border-b border-[var(--gb-border)] flex items-center gap-2 text-xs text-[var(--gb-fg-faint)]">
          <span>Nästa skanning om</span>
          <span
            className="font-[family-name:var(--gb-font-mono)] text-[var(--gb-brass)]"
          >
            {countdown}s
          </span>
        </div>
      )}

      {/* Logg */}
      <div className="p-4 max-h-64 overflow-y-auto space-y-1 font-[family-name:var(--gb-font-mono)] text-xs">
        {logs.length === 0 ? (
          <p className="text-[var(--gb-fg-faint)] text-center py-4">Inga loggar ännu…</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2 items-start">
              <span className="text-[var(--gb-fg-faint)] shrink-0">
                {new Date(log.created_at).toLocaleTimeString('sv-SE', {
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                })}
              </span>
              <span className={`shrink-0 mt-px ${LOG_COLORS[log.level] || 'text-[var(--gb-fg-soft)]'}`}>
                {LOG_ICONS[log.level] ?? <Info size={12} strokeWidth={1.75} />}
              </span>
              <span className={LOG_COLORS[log.level] || 'text-[var(--gb-fg-soft)]'}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
