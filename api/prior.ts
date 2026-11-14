import { neon } from '@neondatabase/serverless'

// The pooled model, served as counts. There is nothing to retrain. The model *is* the transition counts, so "recalibrating in downtime" is a cached aggregate going stale and being recomputed. A separate training job would be ceremony around a group-by. Order 2 is as deep as this goes on purpose: sixteen contexts by four outcomes is 64 cells, and a few thousand exchanges give enough per cell to mean something. Order 3 would be 256 contexts and would be noise wearing a model. Cached at the edge, which is both the recalibration schedule and the reason a burst of players at a booth does not become a burst of identical queries.

const CACHE_SECONDS = 300

export async function GET(): Promise<Response> {
  const url = process.env.DATABASE_URL
  // An empty prior is a valid answer: the client already works without one.
  if (!url) return json({ order1: {}, order2: {}, afterLoss: {}, total: 0 })

  try {
    const sql = neon(url)
    const [order1, order2, afterLoss, totals] = await Promise.all([
      sql`SELECT prev1, chose, count(*)::int AS n FROM hoi_exchange
          WHERE prev1 IS NOT NULL GROUP BY prev1, chose`,
      sql`SELECT prev1, prev2, chose, count(*)::int AS n FROM hoi_exchange
          WHERE prev1 IS NOT NULL AND prev2 IS NOT NULL GROUP BY prev1, prev2, chose`,
      // People shift after a loss. Whether they shift *the same way* is the kind of connection this table exists to find.
      sql`SELECT prev_won, chose, count(*)::int AS n FROM hoi_exchange
          WHERE prev_won IS NOT NULL GROUP BY prev_won, chose`,
      sql`SELECT count(*)::int AS exchanges,
                 count(DISTINCT player)::int AS players,
                 count(DISTINCT session)::int AS sessions
          FROM hoi_exchange`,
    ])

    const nest1: Record<string, Record<string, number>> = {}
    for (const r of order1 as Array<{ prev1: string; chose: string; n: number }>) {
      ;(nest1[r.prev1] ??= {})[r.chose] = r.n
    }
    const nest2: Record<string, Record<string, number>> = {}
    for (const r of order2 as Array<{ prev1: string; prev2: string; chose: string; n: number }>) {
      // Keyed oldest-first to match how the client builds its own context.
      ;(nest2[`${r.prev2}>${r.prev1}`] ??= {})[r.chose] = r.n
    }
    const loss: Record<string, Record<string, number>> = {}
    for (const r of afterLoss as Array<{ prev_won: boolean; chose: string; n: number }>) {
      ;(loss[r.prev_won ? 'won' : 'lost'] ??= {})[r.chose] = r.n
    }

    const t = (totals as Array<{ exchanges: number; players: number; sessions: number }>)[0]
    return json({
      order1: nest1,
      order2: nest2,
      afterLoss: loss,
      total: t?.exchanges ?? 0,
      players: t?.players ?? 0,
      sessions: t?.sessions ?? 0,
    })
  } catch (err) {
    console.error('prior failed', err)
    // Still a 200 with an empty prior. A failing aggregate must not stop anybody playing, and the client treats "no prior" as normal.
    return json({ order1: {}, order2: {}, afterLoss: {}, total: 0 })
  }
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=3600`,
    },
  })
}
