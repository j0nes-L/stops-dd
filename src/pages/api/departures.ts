import type { APIRoute } from 'astro';
import { monitor, findStop } from 'dvbjs';
import { stops } from '../../scripts/stops';
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

function parseCoords(raw: string | null): Coord | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((v) => Number(v.trim()));
  if (parts.length !== 2 || parts.some((v) => !Number.isFinite(v))) return undefined;
  const [lng, lat] = parts;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return undefined;
  return [lng, lat];
}

export const GET: APIRoute = async ({ url }) => {
  const stopId = url.searchParams.get('stopId');

  if (!stopId || !/^[A-Za-z0-9_-]{1,32}$/.test(stopId)) {
    return new Response(JSON.stringify({ error: 'Invalid stopId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const configured = stops.find((s) => s.id === stopId);
  const adhocCoords = parseCoords(url.searchParams.get('coords'));

  try {
    const data = await monitor(stopId, 0, 20);

    const from = (configured?.coords ?? adhocCoords) as Coord | undefined;

    const bearings = new Map<string, number | null>();
    if (from) {
      const uniqueDirs = [...new Set(data.map((d) => d.direction))];
      await Promise.all(
        uniqueDirs.map(async (dir) => {
          const to = await destCoords(dir, from);
          bearings.set(dir, to ? Math.round(bearing(from, to)) : null);
        }),
      );
    }

    const departures = data.map((dep) => ({
      line: dep.line,
      direction: dep.direction,
      mot: dep.mode?.name ?? null,
      platform: dep.platform?.name ?? null,
      scheduledTime: dep.scheduledTime.getTime(),
      realTime: dep.arrivalTime.getTime(),
      minutesUntil: dep.arrivalTimeRelative,
      delayTime: dep.delayTime,
      state: dep.state,
      bearing: bearings.get(dep.direction) ?? null,
      badge: resolveLineStyle(dep.line, dep.mode?.name ?? null),
    }));

    return new Response(JSON.stringify({ departures }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'API request failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};


