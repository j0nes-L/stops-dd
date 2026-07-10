import type { Stop } from '../stops.types';
import type { LineStyle } from '../lines';

export type UserStop = Stop & { _userAdded: true };

export interface Departure {
  line: string | number;
  direction: string;
  mot: string | null;
  platform: string | null;
  scheduledTime: number;
  realTime: number;
  minutesUntil: number;
  delayTime: number;
  state: string;
  bearing: number | null;
  badge?: LineStyle;
}

export interface DeparturesResponse {
  departures?: Departure[];
  error?: string;
}

export interface SearchResult {
  id: string;
  name: string;
  city: string | null;
  coords: [number, number] | null;
}

export interface StopLinesResponse {
  stop: { id: string; name: string; coords: [number, number] };
  lines: Array<{
    line: string | number;
    mot: string | null;
    badge?: LineStyle;
    destinations: Array<{ name: string; bearing: number | null }>;
  }>;
}
