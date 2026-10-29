import type { APIRoute } from 'astro';
import { monitor } from 'dvbjs';
import { resolveLineStyle } from '../../scripts/lines';

export const GET: APIRoute = async ({ url }) => {
  const stopId = url.searchParams.get('stopId');

  if (!stopId || !/^[A-Za-z0-9_-]{1,32}$/.test(stopId)) {
    return new Response(JSON.stringify({ error: 'Invalid stopId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = await monitor(stopId, 0, 20);

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


