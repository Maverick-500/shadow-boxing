// The RPG leaderboard. Global through /api/score, or kept in this browser when that is not there, which is the case on itch.io.

export type Row = { id: number; initials: string; score: number; level: number }

const LOCAL_KEY = 'hoi.rpg.board.v1'

function readLocal(): Row[] {
  try {
    const rows = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as Row[]
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function writeLocal(rows: Row[]): void {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)) } catch { /* private window */ }
}

const ranked = (rows: Row[]): Row[] => [...rows].sort((a, b) => b.score - a.score).slice(0, 10)

export async function fetchBoard(): Promise<{ rows: Row[]; online: boolean }> {
  try {
    const res = await fetch('/api/score', { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    const data = (await res.json()) as { top?: Row[] }
    return { rows: data.top ?? [], online: true }
  } catch {
    return { rows: ranked(readLocal()), online: false }
  }
}

export async function submitScore(
  online: boolean, initials: string, score: number, level: number, ms: number,
): Promise<{ rows: Row[]; id: number }> {
  if (online) {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initials, score, level, ms }),
    })
    const data = (await res.json()) as { id?: number; top?: Row[]; error?: string }
    if (!res.ok || data.id === undefined) throw new Error(data.error ?? 'could not save')
    return { rows: data.top ?? [], id: data.id }
  }
  const id = Date.now()
  const rows = ranked([...readLocal(), { id, initials, score, level }])
  writeLocal(rows)
  return { rows, id }
}
