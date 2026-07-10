import type { Stop } from '../stops.types';
import type { SearchResult, StopLinesResponse, UserStop } from './types';

export interface AddStopModalDeps {
  hasStop(id: string): boolean;
  getUserStops(): UserStop[];
  onAddStop(stop: Stop): void;
  onRemoveStop(id: string): void;
}

interface ModalSelectedStop {
  id: string;
  name: string;
  coords: [number, number] | null;
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing DOM element: #${id}`);
  return node as T;
}

function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      (
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }) as Record<string, string>
      )[c],
  );
}

function angDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function circularMean(anglesDeg: number[]): number {
  const rad = anglesDeg.map((a) => (a * Math.PI) / 180);
  const sinSum = rad.reduce((s, a) => s + Math.sin(a), 0);
  const cosSum = rad.reduce((s, a) => s + Math.cos(a), 0);
  const mean = (Math.atan2(sinSum, cosSum) * 180) / Math.PI;
  return (mean + 360) % 360;
}

export function initAddStopModal(deps: AddStopModalDeps): void {
  const addBtn = el<HTMLButtonElement>('addBtn');
  const addModal = el('addModal');
  const addModalClose = el<HTMLButtonElement>('addModalClose');
  const addCancelBtn = el<HTMLButtonElement>('addCancelBtn');
  const addSaveBtn = el<HTMLButtonElement>('addSaveBtn');
  const addSearchInput = el<HTMLInputElement>('addSearch');
  const addSearchResults = el('addSearchResults');
  const addStepSearch = el('addStepSearch');
  const addStepLines = el('addStepLines');
  const addStepManage = el('addStepManage');
  const addBackBtn = el<HTMLButtonElement>('addBackBtn');
  const addManageBtn = el<HTMLButtonElement>('addManageBtn');
  const addSelectedStop = el('addSelectedStop');
  const addLinesHint = el('addLinesHint');
  const addLinesList = el('addLinesList');
  const userStopsList = el('userStopsList');

  let modalSelectedStop: ModalSelectedStop | null = null;
  let modalLines: StopLinesResponse['lines'] = [];
  let searchDebounce: number | null = null;
  let searchReqId = 0;
  let linesReqId = 0;

  function showStep(name: 'search' | 'lines' | 'manage') {
    addStepSearch.hidden = name !== 'search';
    addStepLines.hidden = name !== 'lines';
    addStepManage.hidden = name !== 'manage';
    addSaveBtn.hidden = name === 'manage';
    addManageBtn.hidden = name !== 'search';
    if (name === 'manage') renderUserStopsList();
  }

  function openModal() {
    addModal.hidden = false;
    document.body.classList.add('modal-open');
    showStep('search');
    addSearchInput.value = '';
    addSearchResults.innerHTML = '';
    modalSelectedStop = null;
    modalLines = [];
    addSaveBtn.disabled = true;
    setTimeout(() => addSearchInput.focus(), 50);
  }

  function closeModal() {
    addModal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  addBtn.addEventListener('click', openModal);
  addModalClose.addEventListener('click', closeModal);
  addCancelBtn.addEventListener('click', closeModal);
  addModal.addEventListener('click', (e) => {
    if (e.target === addModal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !addModal.hidden) closeModal();
  });
  addBackBtn.addEventListener('click', () => {
    modalSelectedStop = null;
    modalLines = [];
    addSaveBtn.disabled = true;
    showStep('search');
  });
  addManageBtn.addEventListener('click', () => showStep('manage'));

  addSearchInput.addEventListener('input', () => {
    const q = addSearchInput.value.trim();
    if (searchDebounce != null) clearTimeout(searchDebounce);
    if (q.length < 2) {
      addSearchResults.innerHTML = '';
      return;
    }
    searchDebounce = window.setTimeout(() => runSearch(q), 300);
  });

  async function runSearch(q: string) {
    const reqId = ++searchReqId;
    addSearchResults.innerHTML = '<div class="search-empty">Searching…</div>';
    try {
      const res = await fetch(`/api/search-stop?q=${encodeURIComponent(q)}`);
      const data: { results?: SearchResult[] } = await res.json();
      if (reqId !== searchReqId) return;
      renderSearchResults(data.results ?? []);
    } catch {
      if (reqId !== searchReqId) return;
      addSearchResults.innerHTML = '<div class="search-empty">Search failed.</div>';
    }
  }

  function renderSearchResults(results: SearchResult[]) {
    if (!results.length) {
      addSearchResults.innerHTML = '<div class="search-empty">No stops found.</div>';
      return;
    }
    addSearchResults.innerHTML = '';
    for (const r of results) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-result';
      btn.innerHTML =
        `<div class="search-result-name">${escapeHtml(r.name)}</div>` +
        (r.city ? `<div class="search-result-city">${escapeHtml(r.city)}</div>` : '');
      btn.addEventListener('click', () => selectStop(r));
      addSearchResults.appendChild(btn);
    }
  }

  async function selectStop(stop: SearchResult) {
    if (deps.hasStop(stop.id)) {
      modalSelectedStop = null;
      modalLines = [];
      addLinesList.innerHTML = '';
      addSelectedStop.textContent = stop.name + ' — already in your list. Pick another.';
      addSelectedStop.classList.add('warn');
      addLinesHint.textContent = '';
      addSaveBtn.disabled = true;
      showStep('lines');
      return;
    }

    modalSelectedStop = {
      id: stop.id,
      name: stop.name,
      coords: stop.coords,
    };
    addSelectedStop.textContent = stop.name;
    addSelectedStop.classList.remove('warn');
    addSaveBtn.disabled = false;

    modalLines = [];
    addLinesList.innerHTML = '';
    addLinesHint.textContent = 'Loading lines…';
    showStep('lines');

    const reqId = ++linesReqId;
    try {
      const res = await fetch(`/api/stop-lines?stopId=${encodeURIComponent(stop.id)}`);
      const data: StopLinesResponse & { error?: string } = await res.json();
      if (reqId !== linesReqId) return;
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      if (data.stop && data.stop.coords) {
        modalSelectedStop.coords = data.stop.coords;
      }
      modalLines = data.lines ?? [];
      renderLines();
    } catch {
      if (reqId !== linesReqId) return;
      addLinesHint.textContent =
        "Couldn't load lines. You can still save the stop and see all departures.";
    }
  }

  function renderLines() {
    if (!modalLines.length) {
      addLinesHint.textContent =
        'No current departures to show lines. You can still save the stop.';
      return;
    }
    addLinesHint.textContent =
      'Pick which lines & destinations to highlight. Leave all unchecked to just save the stop.';
    addLinesList.innerHTML = '';
    for (const l of modalLines) {
      const group = document.createElement('div');
      group.className = 'line-group';
      const badge = l.badge ?? { background: '#4B5563', color: '#fff', shape: 'circle' as const };
      const shapeClass = badge.shape === 'circle' ? 'circle' : 'rect';
      const lineText = String(l.line ?? '');
      const lenClass = 'len-' + Math.min(lineText.length || 1, 4);
      group.innerHTML =
        `<div class="line-group-header">` +
        `<div class="line-badge ${shapeClass} ${lenClass}" style="background:${badge.background};color:${badge.color}">${escapeHtml(lineText)}</div>` +
        `</div>` +
        `<div class="dest-list"></div>`;
      const destList = group.querySelector('.dest-list')!;
      for (const d of l.destinations) {
        const item = document.createElement('label');
        item.className = 'dest-item' + (d.bearing == null ? ' no-bearing' : '');
        item.innerHTML =
          `<input type="checkbox" data-line="${escapeHtml(String(l.line))}" data-bearing="${d.bearing == null ? '' : d.bearing}" />` +
          `<span class="dest-item-label">${escapeHtml(d.name)}</span>`;
        destList.appendChild(item);
      }
      addLinesList.appendChild(group);
    }
  }

  function buildStopFromModal(): Stop | null {
    if (!modalSelectedStop) return null;

    const linesOfInterest: (string | number)[] = [];
    const directions: Record<string, { to: number; tol: number }> = {};

    interface LineEntry {
      line: string | number;
      total: number;
      checked: number[];
      hasNullChecked: boolean;
    }
    const grouped = new Map<string, LineEntry>();
    for (const l of modalLines) {
      grouped.set(String(l.line), {
        line: l.line,
        total: l.destinations.length,
        checked: [],
        hasNullChecked: false,
      });
    }
    const checkboxes = addLinesList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      if (!cb.checked) return;
      const key = cb.dataset.line ?? '';
      const entry = grouped.get(key);
      if (!entry) return;
      const b = cb.dataset.bearing;
      if (b === '' || b == null) entry.hasNullChecked = true;
      else entry.checked.push(Number(b));
    });

    for (const entry of grouped.values()) {
      const checkedCount = entry.checked.length + (entry.hasNullChecked ? 1 : 0);
      if (checkedCount === 0) continue;
      linesOfInterest.push(entry.line);

      if (checkedCount >= entry.total || entry.hasNullChecked) continue;
      if (entry.checked.length === 0) continue;

      if (entry.checked.length === 1) {
        directions[String(entry.line)] = { to: entry.checked[0]!, tol: 65 };
      } else {
        const center = circularMean(entry.checked);
        const maxDev = Math.max(...entry.checked.map((a) => angDiff(a, center)));
        if (maxDev > 90) continue;
        directions[String(entry.line)] = {
          to: Math.round(center),
          tol: Math.max(30, Math.round(maxDev + 15)),
        };
      }
    }

    const stop: Stop = {
      id: modalSelectedStop.id,
      name: modalSelectedStop.name,
    };
    if (
      Array.isArray(modalSelectedStop.coords) &&
      modalSelectedStop.coords.length === 2
    ) {
      stop.coords = modalSelectedStop.coords;
    }
    if (linesOfInterest.length) stop.linesOfInterest = linesOfInterest;
    if (Object.keys(directions).length) stop.directions = directions;
    return stop;
  }

  addSaveBtn.addEventListener('click', () => {
    const newStop = buildStopFromModal();
    if (!newStop) return;
    deps.onAddStop(newStop);
    closeModal();
  });

  function renderUserStopsList() {
    userStopsList.innerHTML = '';
    const list = deps.getUserStops();
    if (!list.length) {
      userStopsList.innerHTML =
        '<div class="user-stops-empty">You haven\u2019t added any stops yet.</div>';
      return;
    }
    for (const s of list) {
      const row = document.createElement('div');
      row.className = 'user-stop-item';
      row.innerHTML =
        `<div class="user-stop-name">${escapeHtml(s.name)}</div>` +
        `<button class="user-stop-delete" type="button">Remove</button>`;
      row.querySelector<HTMLButtonElement>('.user-stop-delete')!.addEventListener(
        'click',
        () => {
          deps.onRemoveStop(s.id);
          renderUserStopsList();
        },
      );
      userStopsList.appendChild(row);
    }
  }
}
