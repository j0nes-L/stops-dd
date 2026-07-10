export type DirSpec =
  | string
  | number
  | { to: string | number; tol?: number }
  | { dest: string | string[] };

export interface Stop {
  id: string;
  name: string;
  linesOfInterest?: (string | number)[];
  coords?: [number, number];
  directions?: Record<string, DirSpec>;
}
