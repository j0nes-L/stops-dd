export type BadgeShape = 'rect' | 'circle';

export interface LineStyle {
  background: string;
  color: string;
  shape: BadgeShape;
}

const SBAHN_GREEN = '#008D36';
const BUS_VIOLET = '#6E2585';
const REGIO_RED = '#EC0016';
const REGIO_GRAY = '#6B7280';
const FERRY_BLUE = '#0080C8';

export const UNKNOWN_STYLE: LineStyle = {
  background: '#4B5563',
  color: '#FFFFFF',
  shape: 'circle',
};

export const LINE_STYLES: Record<string, LineStyle> = {
  '1': { background: '#E4002C', color: '#FFFFFF', shape: 'rect' },
  '2': { background: '#EB5B2D', color: '#FFFFFF', shape: 'rect' },
  '3': { background: '#E5005A', color: '#FFFFFF', shape: 'rect' },
  '4': { background: '#92C255', color: '#000000', shape: 'rect' },
  '6': { background: '#FFDD00', color: '#000000', shape: 'rect' },
  '7': { background: '#9E0234', color: '#FFFFFF', shape: 'rect' },
  '8': { background: '#229133', color: '#FFFFFF', shape: 'rect' },
  '9': { background: '#C9061A', color: '#FFFFFF', shape: 'rect' },
  '10': { background: '#F9B000', color: '#000000', shape: 'rect' },
  '11': { background: '#C2DDAF', color: '#000000', shape: 'rect' },
  '12': { background: '#006B42', color: '#FFFFFF', shape: 'rect' },
  '13': { background: '#FDC300', color: '#000000', shape: 'rect' },
  '20': { background: '#F9B000', color: '#000000', shape: 'rect' },

  '61': { background: '#0069B4', color: '#FFFFFF', shape: 'circle' },
  '62': { background: '#008ACE', color: '#FFFFFF', shape: 'circle' },
  '63': { background: '#224193', color: '#FFFFFF', shape: 'circle' },
  '64': { background: '#35A9E1', color: '#000000', shape: 'circle' },
  '65': { background: '#1A70B8', color: '#FFFFFF', shape: 'circle' },
  '66': { background: '#35A9E1', color: '#000000', shape: 'circle' },
  '166': { background: '#35A9E1', color: '#000000', shape: 'circle' },
  '68': { background: '#008FBA', color: '#FFFFFF', shape: 'circle' },
  '70': { background: '#C99D66', color: '#000000', shape: 'circle' },
  '72': { background: '#A4897A', color: '#000000', shape: 'circle' },
  '73': { background: '#DBD186', color: '#000000', shape: 'circle' },
  '74': { background: '#935E36', color: '#FFFFFF', shape: 'circle' },
  '76': { background: '#A4897A', color: '#000000', shape: 'circle' },
  '77': { background: '#AD9F82', color: '#000000', shape: 'circle' },
  '78': { background: '#A4897A', color: '#000000', shape: 'circle' },
  '79': { background: '#BCAE94', color: '#000000', shape: 'circle' },
  '80': { background: '#683B0C', color: '#FFFFFF', shape: 'circle' },
  '81': { background: '#935E36', color: '#FFFFFF', shape: 'circle' },
  '84': { background: '#BCAE94', color: '#000000', shape: 'circle' },
  '85': { background: '#C99D66', color: '#000000', shape: 'circle' },
  '86': { background: '#935E36', color: '#FFFFFF', shape: 'circle' },
  '87': { background: '#A4897A', color: '#000000', shape: 'circle' },
  '88': { background: '#A4897A', color: '#000000', shape: 'circle' },
  '89': { background: '#BCAE94', color: '#000000', shape: 'circle' },
  '90': { background: '#BCAE94', color: '#000000', shape: 'circle' },
  '92': { background: '#BCAE94', color: '#000000', shape: 'circle' },

  S1: { background: SBAHN_GREEN, color: '#FFFFFF', shape: 'circle' },
  S2: { background: SBAHN_GREEN, color: '#FFFFFF', shape: 'circle' },
  S3: { background: SBAHN_GREEN, color: '#FFFFFF', shape: 'circle' },
  S6: { background: SBAHN_GREEN, color: '#FFFFFF', shape: 'circle' },
  S8: { background: SBAHN_GREEN, color: '#FFFFFF', shape: 'circle' },
};

function normalizeLine(line: string | null | undefined): string {
  return (line ?? '').toString().trim().toUpperCase().replace(/\s+/g, '');
}

export function resolveLineStyle(line: string, mot?: string | null): LineStyle {
  const key = normalizeLine(line);

  const direct = LINE_STYLES[key];
  if (direct) return direct;

  const m = (mot ?? '').toLowerCase();

  if (m === 'suburbanrailway' || /^S\d/.test(key)) {
    return { background: SBAHN_GREEN, color: '#FFFFFF', shape: 'circle' };
  }

  if (/^RB\d/.test(key)) {
    return { background: REGIO_GRAY, color: '#FFFFFF', shape: 'rect' };
  }

  if (/^(RE|IC|EC|TL)\d/.test(key) || m === 'train') {
    return { background: REGIO_RED, color: '#FFFFFF', shape: 'rect' };
  }

  if (m === 'ferry') {
    return { background: FERRY_BLUE, color: '#FFFFFF', shape: 'rect' };
  }

  if (
    m === 'citybus' ||
    m === 'intercitybus' ||
    m === 'plusbus' ||
    m === 'hailedsharedtaxi' ||
    key === 'EV' ||
    key === 'ALITA' ||
    /^\d{2,3}[A-Z]?$/.test(key)
  ) {
    return { background: BUS_VIOLET, color: '#FFFFFF', shape: 'circle' };
  }

  return UNKNOWN_STYLE;
}

