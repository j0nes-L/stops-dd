import type { Stop } from './stops.types';
import { stops as exampleStops } from './stops.example';

export type { Stop } from './stops.types';

function parseEnvStops(): Stop[] | undefined {
  const raw = import.meta.env?.STOPS_JSON ?? process.env?.STOPS_JSON;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed as Stop[];
    console.warn('[stops] STOPS_JSON is not a non-empty array; ignoring it.');
  } catch (err) {
    console.warn('[stops] Failed to parse STOPS_JSON; ignoring it.', err);
  }
  return undefined;
}

const localModules = import.meta.glob('./stops.local.ts', { eager: true });
const localStops = (Object.values(localModules)[0] as { stops?: Stop[] } | undefined)?.stops;

export const stops: Stop[] = parseEnvStops() ?? localStops ?? exampleStops;