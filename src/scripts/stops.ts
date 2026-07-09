import type { Stop } from './stops.types';
import { stops as exampleStops } from './stops.example';

export type { Stop } from './stops.types';

const localModules = import.meta.glob('./stops.local.ts', { eager: true });
const localStops = (Object.values(localModules)[0] as { stops?: Stop[] } | undefined)?.stops;

export const stops: Stop[] = localStops ?? exampleStops;