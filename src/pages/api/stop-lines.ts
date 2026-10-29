import type { APIRoute } from 'astro';
import { monitor, findStop } from 'dvbjs';
import { resolveLineStyle } from '../../scripts/lines';

type Coord = [number, number];

async function stopCoords(stopId: string): Promise<{ name: string; coords: Coord } | null> {
  try {
    const results = await findStop(stopId);
    const hit = results.find((r) => r.id === stopId && r.coords);
    if (hit && hit.coords) return { name: hit.name, coords: hit.coords as Coord };
    const anyWithCoords = results.find((r) => r.coords);
    if (anyWithCoords && anyWithCoords.coords)
      return { name: anyWithCoords.name, coords: anyWithCoords.coords as Coord };
  } catch {
    void 0;
  }
  return null;
}

export const GET: APIRoute = async ({ url }) => {
  const stopId = (url.searchParams.get('stopId') ?? '').trim();
  if (!stopId) {
    return new Response(JSON.stringify({ error: 'Missing stopId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const info = await stopCoords(stopId);
    if (!info) {
      return new Response(JSON.stringify({ error: 'Stop not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await monitor(stopId, 0, 60);

    const linesMap = new Map<
      string,
      { line: string; mot: string | null; destinations: Set<string> }
    >();
    for (const dep of data) {
      const key = String(dep.line);
      if (!linesMap.has(key)) {
        linesMap.set(key, {
          line: dep.line,
          mot: dep.mode?.name ?? null,
          destinations: new Set(),
        });
      }
      linesMap.get(key)!.destinations.add(dep.direction);
    }

    const lines = [...linesMap.values()]
      .map((l) => ({
        line: l.line,
        mot: l.mot,
        badge: resolveLineStyle(l.line, l.mot),
        destinations: [...l.destinations].map((name) => ({ name })),
      }))
      .sort((a, b) => String(a.line).localeCompare(String(b.line), 'de', { numeric: true }));

    return new Response(
      JSON.stringify({
        stop: { id: stopId, name: info.name, coords: info.coords },
        lines,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch {
    return new Response(JSON.stringify({ error: 'API request failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
