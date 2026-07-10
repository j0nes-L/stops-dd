import type { APIRoute } from 'astro';
import { monitor, findStop } from 'dvbjs';
import { resolveLineStyle } from '../../scripts/lines';

type Coord = [number, number];

const destCache = new Map<string, Coord | null>();

function distSq(a: Coord, b: Coord): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function bearing(from: Coord, to: Coord): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const dLon = toRad(lng2 - lng1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

async function destCoords(name: string, from: Coord): Promise<Coord | null> {
  if (destCache.has(name)) return destCache.get(name)!;
  let coords: Coord | null = null;
  try {
    const results = await findStop(name);
    const withCoords = results.filter((r) => r.coords);
    withCoords.sort((a, b) => distSq(from, a.coords as Coord) - distSq(from, b.coords as Coord));
    coords = withCoords.length ? (withCoords[0].coords as Coord) : null;
  } catch {
    coords = null;
  }
  destCache.set(name, coords);
  return coords;
}

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

    const from = info.coords;
    const allDests = [...new Set([...linesMap.values()].flatMap((l) => [...l.destinations]))];
    const bearings = new Map<string, number | null>();
    await Promise.all(
      allDests.map(async (dir) => {
        const to = await destCoords(dir, from);
        bearings.set(dir, to ? Math.round(bearing(from, to)) : null);
      }),
    );

    const lines = [...linesMap.values()]
      .map((l) => ({
        line: l.line,
        mot: l.mot,
        badge: resolveLineStyle(l.line, l.mot),
        destinations: [...l.destinations].map((name) => ({
          name,
          bearing: bearings.get(name) ?? null,
        })),
      }))
      .sort((a, b) => String(a.line).localeCompare(String(b.line), 'de', { numeric: true }));

    return new Response(
      JSON.stringify({
        stop: { id: stopId, name: info.name, coords: from },
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
