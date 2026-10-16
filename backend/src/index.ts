import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { getDb } from './db/index'
import { routes } from './db/schema'
import { getLastRun, isDetectionRunning, runDetectionPass } from './lib/detect'

const app = new Hono()

const welcomeStrings = [
  'Hello Hono!',
  'To learn more about Hono on Vercel, visit https://vercel.com/docs/frameworks/backend/hono'
]

app.get('/', (c) => {
  return c.text(welcomeStrings.join('\n\n'))
})

// DB connectivity check — verifies Drizzle → Supabase Postgres works.
app.get('/api/health/db', async (c) => {
  try {
    const db = getDb()
    const rows = await db.execute(sql`select now() as now`)
    return c.json({ ok: true, now: (rows[0] as { now: unknown }).now })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ ok: false, error: message }, 500)
  }
})

// List routes (latest first). Bare geography columns come back as EWKB hex,
// so this selects WKT text for start/finish instead.
app.get('/api/routes', async (c) => {
  try {
    const db = getDb()
    const rows = await db
      .select({
        id: routes.id,
        name: routes.name,
        startLabel: routes.startLabel,
        finishLabel: routes.finishLabel,
        startTime: routes.startTime,
        weekdays: routes.weekdays,
        modality: routes.modality,
        createdAt: routes.createdAt,
        startWkt: sql<string>`ST_AsText(${routes.startLocation})`.as('start_wkt'),
        finishWkt: sql<string>`ST_AsText(${routes.finishLocation})`.as('finish_wkt'),
      })
      .from(routes)
      .orderBy(sql`${routes.createdAt} desc`)
      .limit(50)
    return c.json({ ok: true, routes: rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ ok: false, error: message }, 500)
  }
})

// Obstacle detection event loop: sync Dortmund construction areas, match
// them against all routes, materialize hits into public.obstacles.
app.get('/api/detect/status', (c) => {
  return c.json({ ok: true, running: isDetectionRunning(), lastRun: getLastRun() })
})

app.post('/api/detect/run', async (c) => {
  if (isDetectionRunning()) {
    return c.json({ ok: false, error: 'detection pass already running' }, 409)
  }
  try {
    const summary = await runDetectionPass()
    return c.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ ok: false, error: message }, 500)
  }
})

export default app
