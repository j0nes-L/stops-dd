export interface Stop {
  id: string;
  name: string;
  linesOfInterest?: (string | number)[];
  coords?: [number, number];
  directions?: Record<string, string | number | { to: string | number; tol?: number }>;
}
