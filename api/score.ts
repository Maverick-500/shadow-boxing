import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// The RPG leaderboard. GET returns the top ten, POST records a finished run and returns the board with its id so the client can highlight it.

type Row = { id: number; initials: string; score: number; level: number }

// Three-letter initials leave little room for anything rude, and these cover what is left.
const BLOCKED = new Set([
  'ASS', 'FUK', 'FUC', 'FCK', 'CUM', 'DIK', 'DIC', 'KKK', 'NIG', 'NGA', 'FAG', 'SEX', 'TIT', 'COK',
  'KYS', 'JEW', 'GAY', 'PUS', 'VAG', 'SHT', 'CNT', 'TWT', 'WNK', 'PIS', 'RAP', 'HOE', 'SUK', 'SUX',
])

// Each monster needs at least two plus its level in dodges, and no exchange takes under about 2.5s. A run claiming more than that is not a run.
const minMsFor = (score: number): number => (2 * score + (score * (score + 1)) / 2) * 2500

let ready: Promise<unknown> | null = null
type Sql = NeonQueryFunction<false, false>

function table(sql: Sql): Promise<unknown> {
  ready ??= sql`
    CREATE TABLE IF NOT EXISTS hoi_score (
      id serial PRIMARY KEY,
      initials char(3) NOT NULL,
      score int NOT NULL,
      level int NOT NULL,
      run_ms int NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`.catch((err: unknown) => {
    // A failed create must not stay cached for the life of this instance.
    ready = null
    throw err
  })
  return ready
}

async function top(sql: Sql): Promise<Row[]> {
  return (await sql`
    SELECT id, initials, score, level FROM hoi_score
    ORDER BY score DESC, created_at ASC LIMIT 10`) as Row[]
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export async function GET(): Promise<Response> {
  const url = process.env.DATABASE_URL
  if (!url) return json({ error: 'no database' }, 503)
  try {
    const sql = neon(url)
    await table(sql)
    return json({ top: await top(sql) })
  } catch (err) {
    console.error('board read failed', err)
    return json({ error: 'read failed' }, 500)
  }
}

export async function POST(request: Request): Promise<Response> {
  const url = process.env.DATABASE_URL
  if (!url) return json({ error: 'no database' }, 503)

  let body: { initials?: unknown; score?: unknown; level?: unknown; ms?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad json' }, 400)
  }

  const initials = typeof body.initials === 'string' ? body.initials.toUpperCase() : ''
  const score = Number(body.score), level = Number(body.level), ms = Number(body.ms)
  if (!/^[A-Z]{3}$/.test(initials)) return json({ error: 'initials are three letters' }, 400)
  if (BLOCKED.has(initials)) return json({ error: 'pick other initials' }, 400)
  if (!Number.isInteger(score) || score < 1 || score > 500) return json({ error: 'bad score' }, 400)
  // You die on the level after your last clear.
  if (level !== score + 1) return json({ error: 'bad level' }, 400)
  if (!Number.isFinite(ms) || ms < minMsFor(score) || ms > 6 * 3600 * 1000) {
    return json({ error: 'that run was not possible' }, 400)
  }

  try {
    const sql = neon(url)
    await table(sql)
    const inserted = (await sql`
      INSERT INTO hoi_score (initials, score, level, run_ms)
      VALUES (${initials}, ${score}, ${level}, ${Math.round(ms)})
      RETURNING id`) as { id: number }[]
    return json({ id: inserted[0]!.id, top: await top(sql) })
  } catch (err) {
    console.error('board write failed', err)
    return json({ error: 'write failed' }, 500)
  }
}
