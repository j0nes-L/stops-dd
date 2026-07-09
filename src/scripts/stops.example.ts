import type { Stop } from './stops.types';

/**
 * Example stop configuration (committed to the repo).
 *
 * To use your own stops without committing them, copy this file to
 * `src/scripts/stops.local.ts` (git-ignored) and edit it there.
 *
 * Find stop ids + coords with:  node src/scripts/find-stop.mjs "<search>"
 */
export const stops: Stop[] = [
  { id: '33000037', name: 'Postplatz', coords: [13.733502103133539, 51.05083775457303] },
];
