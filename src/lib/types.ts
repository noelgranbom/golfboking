export type JobMode = 'notify' | 'auto'
export type JobStatus = 'active' | 'paused' | 'completed' | 'failed'
export type LogLevel = 'info' | 'success' | 'error' | 'warning'

export interface Job {
  id: string
  created_at: string
  updated_at: string
  email: string
  golf_id: string
  golf_password: string
  club_id: string
  club_name: string
  course_id: string | null
  course_name: string | null
  date: string
  time_from: string
  time_to: string
  num_players: number
  friend_golf_ids: string[]
  mode: JobMode
  status: JobStatus
  last_scan_at: string | null
  next_scan_at: string | null
  booked_tee_time: string | null
}

export interface Log {
  id: string
  created_at: string
  job_id: string
  level: LogLevel
  message: string
}

export interface GolfClub {
  id: string
  name: string
}

export interface CreateJobInput {
  email: string
  golf_id: string
  golf_password: string
  club_id: string
  club_name: string
  course_id?: string | null
  course_name?: string | null
  date: string
  time_from: string
  time_to: string
  num_players: number
  friend_golf_ids: string[]
  mode: JobMode
}
