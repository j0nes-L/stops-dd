import type { DirSpec, Stop } from '../stops.types';
import type { Departure } from './types';

const COMPASS: Record<string, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};
const DIR_TOL = 65;

function normLine(line: unknown): string {
  return String(line ?? '')
    .trim()
    .toUpperCase();
}

function normDest(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function toBearing(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return ((v % 360) + 360) % 360;
  const key = String(v).trim().toUpperCase();
  return key in COMPASS ? COMPASS[key]! : null;
}

type ParsedDir =
  | { kind: 'bearing'; bearing: number; tol: number }
  | { kind: 'dest'; dests: Set<string> };

function parseDir(spec: DirSpec | undefined | null): ParsedDir | null {
  if (spec == null) return null;
  if (typeof spec === 'object' && spec !== null && 'dest' in spec) {
    const raw = Array.isArray(spec.dest) ? spec.dest : [spec.dest];
    const dests = new Set(raw.map(normDest).filter((s) => s.length > 0));
    return dests.size ? { kind: 'dest', dests } : null;
  }
  let to: unknown = spec;
  let tol = DIR_TOL;
  if (typeof spec === 'object' && spec !== null) {
    to = spec.to;
    if (typeof spec.tol === 'number') tol = spec.tol;
  }
  const bearing = toBearing(to);
  return bearing == null ? null : { kind: 'bearing', bearing, tol };
}

function angDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function keyOf(dep: Departure): string {
  return `${dep.line}|${dep.direction}|${dep.scheduledTime}`;
}

function departTime(dep: Departure): string {
  return dep.scheduledTime
    ? new Date(dep.scheduledTime).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
}

function badgeMarkup(dep: Departure): string {
  const badge = dep.badge ?? {
    background: '#4B5563',
    color: '#fff',
    shape: 'circle' as const,
  };
  const shapeClass = badge.shape === 'circle' ? 'circle' : 'rect';
  const lineText = String(dep.line ?? '');
  const lenClass = 'len-' + Math.min(lineText.length || 1, 4);
  return `<div class="line-badge ${shapeClass} ${lenClass}" style="background:${badge.background};color:${badge.color}">${lineText}</div>`;
}

function infoMarkup(dep: Departure): string {
  return `<div class="dep-info"><div class="dep-direction">${dep.direction}</div><div class="dep-depart"></div></div>`;
}

function timeMarkup(dep: Departure): string {
  const mins = dep.minutesUntil;
  const delay = Number(dep.delayTime) || 0;
  const isCancelled = dep.state === 'Cancelled';
  const timeStr = mins <= 0 ? 'now' : `${mins}<span class="unit">min</span>`;
  const timeClass = mins <= 0 ? 'now' : '';

  let delayHtml: string;
  if (isCancelled) delayHtml = '<span class="dep-delay cancelled">Cancelled</span>';
  else if (delay > 0) delayHtml = `<span class="dep-delay late">+${delay} min</span>`;
  else if (delay < 0) delayHtml = `<span class="dep-delay early">${delay} min</span>`;
  else delayHtml = '<span class="dep-delay ontime">on time</span>';

  return `<div class="dep-time ${timeClass}">${timeStr}</div>${delayHtml}`;
}

function updateNode(node: HTMLElement, dep: Departure, isNew: boolean, highlight: boolean) {
  node.classList.toggle('cancelled', dep.state === 'Cancelled');
  node.classList.toggle('highlight', !!highlight);

  const departEl = node.querySelector<HTMLElement>('.dep-depart');
  if (departEl) {
    const t = departTime(dep);
    if (departEl.textContent !== t) departEl.textContent = t;
  }

  const right = node.querySelector<HTMLElement>('.dep-right');
  if (!right) return;
  const sig = timeMarkup(dep);
  if (right.dataset.sig !== sig) {
    right.innerHTML = sig;
    right.dataset.sig = sig;
    if (!isNew) {
      right.classList.remove('flash');
      void right.offsetWidth;
      right.classList.add('flash');
    }
  }
}

function createNode(dep: Departure, highlight: boolean): HTMLElement {
  const node = document.createElement('div');
  node.className = 'departure';
  node.dataset.key = keyOf(dep);
  node.innerHTML = badgeMarkup(dep) + infoMarkup(dep) + '<div class="dep-right"></div>';
  updateNode(node, dep, true, highlight);
  return node;
}

export interface RenderOptions {
  onRemoveUserStop?: (id: string) => void;
  onEditUserStop?: (id: string) => void;
}

export function renderSlide(
  slide: HTMLElement,
  data: { departures?: Departure[] } | null | undefined,
  stop: Stop & { _userAdded?: boolean },
  opts: RenderOptions = {},
): void {
  const deps = data?.departures ?? [];

  if (deps.length === 0) {
    slide.innerHTML = '<div class="empty">No departures</div>';
    if (stop._userAdded && opts.onRemoveUserStop) {
      appendRemoveStopButton(slide, stop, opts.onRemoveUserStop, opts.onEditUserStop);
    }
    return;
  }

  const loi = new Set((stop?.linesOfInterest ?? []).map(normLine));
  const dirs = (stop?.directions ?? {}) as Record<string, DirSpec>;
  const hasOtherLines = deps.some((d) => !loi.has(normLine(d.line)));

  function isHighlighted(dep: Departure): boolean {
    const line = normLine(dep.line);
    if (!loi.has(line)) return false;
    const spec = parseDir(dirs[line] ?? dirs[String(dep.line)]);
    if (spec != null) {
      if (spec.kind === 'dest') {
        return spec.dests.has(normDest(dep.direction));
      }
      return dep.bearing != null && angDiff(dep.bearing, spec.bearing) <= spec.tol;
    }
    return hasOtherLines;
  }

  const hasHighlighted = deps.some((d) => isHighlighted(d));

  let list = slide.querySelector<HTMLElement>('.dep-list');
  if (!list) {
    slide.innerHTML = '<div class="dep-list"></div><div class="update-hint"></div>';
    list = slide.querySelector<HTMLElement>('.dep-list');
  }
  if (!list) return;
  list.classList.toggle('has-highlights', hasHighlighted);

  const keys = deps.map(keyOf);
  const keySet = new Set(keys);

  const existing: Record<string, HTMLElement> = {};
  [...list.children].forEach((node) => {
    const el = node as HTMLElement;
    if (el.classList.contains('leaving')) return;
    if (el.dataset.key) existing[el.dataset.key] = el;
  });

  [...list.children].forEach((node) => {
    const el = node as HTMLElement;
    if (el.classList.contains('leaving')) return;
    if (!el.dataset.key || !keySet.has(el.dataset.key)) {
      el.classList.add('leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
      setTimeout(() => el.parentNode && el.remove(), 500);
    }
  });

  let prev: HTMLElement | null = null;
  deps.forEach((dep, i) => {
    const hl = isHighlighted(dep);
    let node = existing[keys[i]!];
    if (node) {
      updateNode(node, dep, false, hl);
    } else {
      node = createNode(dep, hl);
      node.classList.add('entering');
      node.addEventListener('animationend', () => node.classList.remove('entering'), {
        once: true,
      });
    }
    const ref = prev ? prev.nextSibling : list!.firstChild;
    if (ref !== node) list!.insertBefore(node, ref);
    prev = node;
  });

  const hint = slide.querySelector<HTMLElement>('.update-hint');
  if (hint) {
    hint.textContent =
      'Last updated: ' +
      new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  if (stop._userAdded && opts.onRemoveUserStop) {
    appendRemoveStopButton(slide, stop, opts.onRemoveUserStop, opts.onEditUserStop);
  }
}

function appendRemoveStopButton(
  slide: HTMLElement,
  stop: Stop,
  onRemove: (id: string) => void,
  onEdit?: (id: string) => void,
): void {
  if (slide.querySelector('.remove-stop')) return;
  const wrap = document.createElement('div');
  wrap.className = 'remove-stop';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'remove-stop-btn';
  btn.setAttribute('aria-label', 'Remove this stop');
  btn.title = 'Remove this stop';
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="3 6 5 6 21 6"/>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
    '<path d="M10 11v6"/>' +
    '<path d="M14 11v6"/>' +
    '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>' +
    '</svg>';
  btn.addEventListener('click', () => onRemove(stop.id));
  wrap.appendChild(btn);

  if (onEdit) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-stop-btn';
    editBtn.setAttribute('aria-label', 'Edit lines & destinations');
    editBtn.title = 'Edit lines & destinations';
    editBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 20h9"/>' +
      '<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>' +
      '</svg>';
    editBtn.addEventListener('click', () => onEdit(stop.id));
    wrap.appendChild(editBtn);
  }

  slide.appendChild(wrap);
}
