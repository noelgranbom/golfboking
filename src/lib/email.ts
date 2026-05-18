import { Resend } from 'resend'
import type { Job } from './types'

export type TeeTime = { time: string }

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

export async function sendNotificationEmail(job: Job, teeTimes: { time: string }[]) {
  const timeList = teeTimes.map((t) => `• ${t.time}`).join('\n')

  await getResend().emails.send({
    from: 'Golfboking <noreply@golfboking.se>',
    to: job.email,
    subject: `Ledig golftid hittad – ${job.club_name} ${job.date}`,
    html: `
      <h2>En ledig golftid har hittats!</h2>
      <p><strong>Klubb:</strong> ${job.club_name}</p>
      <p><strong>Datum:</strong> ${job.date}</p>
      <p><strong>Lediga tider:</strong></p>
      <pre>${timeList}</pre>
      <p>Logga in på <a href="https://mingolf.golf.se">MinGolf</a> för att boka.</p>
      <hr>
      <small>Golfboking – automatisk golfbevakare</small>
    `,
  })
}

export async function sendBookingConfirmationEmail(job: Job, bookedTime: string) {
  await getResend().emails.send({
    from: 'Golfboking <noreply@golfboking.se>',
    to: job.email,
    subject: `Golftid bokad – ${job.club_name} ${job.date} kl. ${bookedTime}`,
    html: `
      <h2>Din golftid är bokad!</h2>
      <p><strong>Klubb:</strong> ${job.club_name}</p>
      <p><strong>Datum:</strong> ${job.date}</p>
      <p><strong>Tid:</strong> ${bookedTime}</p>
      <p><strong>Antal spelare:</strong> ${job.num_players}</p>
      ${job.friend_golf_ids?.length ? `<p><strong>Medspelare:</strong> ${job.friend_golf_ids.join(', ')}</p>` : ''}
      <p>Kontrolera din bokning på <a href="https://mingolf.golf.se">MinGolf</a>.</p>
      <hr>
      <small>Golfboking – automatisk golfbevakare</small>
    `,
  })
}

export async function sendErrorEmail(job: Job, errorMessage: string) {
  await getResend().emails.send({
    from: 'Golfboking <noreply@golfboking.se>',
    to: job.email,
    subject: `Golfboking – fel vid bevakning av ${job.club_name}`,
    html: `
      <h2>Ett fel uppstod</h2>
      <p>Bevakningen för ${job.club_name} ${job.date} stötte på ett problem:</p>
      <pre>${errorMessage}</pre>
      <hr>
      <small>Golfboking – automatisk golfbevakare</small>
    `,
  })
}
