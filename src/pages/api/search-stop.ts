import type { APIRoute } from 'astro';
import { findStop } from 'dvbjs';

export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const results = await findStop(q);
    const trimmed = results.slice(0, 20).map((r) => ({
      id: r.id,
      name: r.name,
      city: r.city ?? null,
      coords: r.coords ?? null,
    }));
    return new Response(JSON.stringify({ results: trimmed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Search failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
