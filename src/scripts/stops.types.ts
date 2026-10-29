export type DirSpec = { dest: string | string[] };

export interface Stop {
  id: string;
  name: string;
  linesOfInterest?: (string | number)[];
  coords?: [number, number];
  directions?: Record<string, DirSpec>;
}
