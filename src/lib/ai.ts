import Anthropic from '@anthropic-ai/sdk'
import type { Job } from './types'

export interface AIRecommendation {
  recommendedTime: string
  explanation: string
}

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

export async function recommendTeeTime(
  job: Job,
  teeTimes: string[]
): Promise<AIRecommendation | null> {
  if (teeTimes.length === 0) return null
  if (teeTimes.length === 1) return { recommendedTime: teeTimes[0], explanation: 'Enda tillgängliga tid.' }

  try {
    const client = getClient()
    const message = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `Du är en golfassistent. Rekommendera den bästa starttiden bland dessa alternativ.

Klubb: ${job.club_name}
Datum: ${job.date}
Önskat tidsfönster: ${job.time_from}–${job.time_to}
Antal spelare: ${job.num_players}
Tillgängliga tider: ${teeTimes.join(', ')}

Svara ENBART med JSON i detta format (ingen annan text):
{"recommendedTime":"HH:MM","explanation":"En kort mening på svenska som förklarar varför denna tid är bäst."}`,
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const json = JSON.parse(text)
    if (json.recommendedTime && json.explanation) {
      return { recommendedTime: json.recommendedTime, explanation: json.explanation }
    }
    return null
  } catch {
    return null
  }
}
