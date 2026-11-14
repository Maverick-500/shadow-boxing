import { neon } from '@neondatabase/serverless'

// Records one exchange. Never blocks the game. The client posts and forgets: nothing in a round waits on this, because a round that waits on venue wifi is a round that fails in front of a crowd. Failures here are logged and swallowed rather than surfaced, since there is nothing a player could usefully do about them. What is stored is four direction words and some counters. No video, no frames, no landmarks, nothing that could reconstruct a face. The player id is a random string minted in the browser with nothing attached to it: it exists only to tell one person's run of choices apart from another's, which is the whole point of pooling them.

const DIRECTIONS = new Set(['left', 'right', 'up', 'down'])

type Body = {
  player?: unknown
  session?: unknown
  round?: unknown
  priorVisits?: unknown
  chose?: unknown
  machine?: unknown
  won?: unknown
  prev1?: unknown
  prev2?: unknown
  prevWon?: unknown
}

const dir = (v: unknown): string | null =>
  typeof v === 'string' && DIRECTIONS.has(v) ? v : null

const id = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null

export async function POST(request: Request): Promise<Response> {
  const url = process.env.DATABASE_URL
  if (!url) return new Response('no database', { status: 503 })

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return new Response('bad json', { status: 400 })
  }

  // Validated rather than trusted. This endpoint is open to anyone who finds it, and an unvalidated insert from an open endpoint is how a table becomes somebody else's dumping ground.
  const player = id(body.player)
  const session = id(body.session)
  const chose = dir(body.chose)
  const round = typeof body.round === 'number' && body.round >= 0 && body.round < 10000
    ? Math.floor(body.round)
    : null
  if (!player || !session || !chose || round === null || typeof body.won !== 'boolean') {
    return new Response('bad fields', { status: 400 })
  }

  const priorVisits = typeof body.priorVisits === 'number' && body.priorVisits >= 0
    ? Math.min(10000, Math.floor(body.priorVisits))
    : 0

  try {
    const sql = neon(url)
    await sql`
      INSERT INTO hoi_exchange
        (player, session, round, prior_visits, chose, machine, won, prev1, prev2, prev_won)
      VALUES
        (${player}, ${session}, ${round}, ${priorVisits}, ${chose}, ${dir(body.machine)},
         ${body.won}, ${dir(body.prev1)}, ${dir(body.prev2)},
         ${typeof body.prevWon === 'boolean' ? body.prevWon : null})
    `
    return new Response(null, { status: 204 })
  } catch (err) {
    console.error('insert failed', err)
    return new Response('insert failed', { status: 500 })
  }
}
