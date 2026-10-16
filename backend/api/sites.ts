// GET /api/sites?status=current|planned — construction sites read from Supabase.
const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;

export default {
  async fetch(request: Request): Promise<Response> {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return Response.json({ error: 'Supabase is not configured' }, { status: 500 });
    }

    const status = new URL(request.url).searchParams.get('status');
    if (status && status !== 'current' && status !== 'planned') {
      return Response.json({ error: 'status must be current or planned' }, { status: 400 });
    }

    const upstream = new URL('/rest/v1/construction_sites', SUPABASE_URL);
    upstream.searchParams.set('select', '*');
    if (status) upstream.searchParams.set('status', `eq.${status}`);

    const res = await fetch(upstream, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    });
    if (!res.ok) return Response.json({ error: 'Upstream error' }, { status: 502 });

    return Response.json(await res.json(), {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    });
  },
};
