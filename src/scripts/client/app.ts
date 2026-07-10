import type { Stop } from '../stops.types';
import type { DeparturesResponse, UserStop } from './types';
import { renderSlide } from './render';
import { initAddStopModal } from './add-stop-modal';
import type { AddStopModalApi } from './add-stop-modal';

const USER_STOPS_KEY = 'freqstops:userStops';
const POS_KEY = 'freqstops:pos';

function readStopsFromDom(): Stop[] {
  const dataEl = document.getElementById('stops-data');
  if (!dataEl) return [];
  try {
    const parsed = JSON.parse(dataEl.textContent ?? '[]');
    return Array.isArray(parsed) ? (parsed as Stop[]) : [];
  } catch {
    return [];
  }
}

function stripUserFlag(s: UserStop): Stop {
  const { _userAdded: _flag, ...rest } = s;
  return rest;
}

function loadUserStops(): UserStop[] {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_STOPS_KEY) ?? 'null');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((s): s is Stop => !!s && typeof s.id === 'string' && typeof s.name === 'string')
      .map((s) => ({ ...s, _userAdded: true as const }));
  } catch {
    return [];
  }
}

function saveUserStops(list: UserStop[]): void {
  try {
    localStorage.setItem(USER_STOPS_KEY, JSON.stringify(list.map(stripUserFlag)));
  } catch {
    void 0;
  }
}

function boot() {
  const slidesEl = document.getElementById('slides') as HTMLElement;
  const tabsEl = document.getElementById('tabs') as HTMLElement;
  const ptr = document.getElementById('ptr') as HTMLElement;
  const ptrText = ptr.querySelector<HTMLElement>('.ptr-text')!;

  const configuredStops = readStopsFromDom();
  let userStops = loadUserStops();
  for (const s of userStops) createTabAndSlide(s);

  let order: Stop[] = [...configuredStops, ...userStops];
  let current = 0;
  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let pullY = 0;
  let axis: 'h' | 'v' | null = null;
  let isDragging = false;
  let refreshing = false;
  let modalApi: AddStopModalApi | null = null;
  const cache: Record<string, { data: DeparturesResponse; time: number } | null | undefined> = {};

  function tabById(id: string): HTMLElement | null {
    return tabsEl.querySelector<HTMLElement>('.tab[data-id="' + CSS.escape(id) + '"]');
  }
  function slideById(id: string): HTMLElement | null {
    return slidesEl.querySelector<HTMLElement>('.slide[data-stop-id="' + CSS.escape(id) + '"]');
  }
  function curSlide(): HTMLElement | null {
    return order[current] ? slideById(order[current]!.id) : null;
  }

  function updateActiveTab() {
    const id = order[current]?.id;
    if (!id) return;
    [...tabsEl.children].forEach((t) => {
      const el = t as HTMLElement;
      el.classList.toggle('active', el.dataset.id === id);
    });
  }

  function centerTab(id: string) {
    const tab = tabById(id);
    if (!tab) return;
    const target = tab.offsetLeft - (tabsEl.clientWidth - tab.offsetWidth) / 2;
    const max = tabsEl.scrollWidth - tabsEl.clientWidth;
    tabsEl.scrollTo({
      left: Math.max(0, Math.min(target, max)),
      behavior: 'smooth',
    });
  }

  function setSlideTransform(idx: number, instant: boolean) {
    if (instant) {
      slidesEl.style.transition = 'none';
      slidesEl.style.transform = `translateX(-${idx * 100}%)`;
      void slidesEl.offsetWidth;
      slidesEl.style.transition = '';
    } else {
      slidesEl.style.transform = `translateX(-${idx * 100}%)`;
    }
  }

  function goTo(index: number) {
    current = Math.max(0, Math.min(index, order.length - 1));
    setSlideTransform(current, false);
    updateActiveTab();
    const id = order[current]?.id;
    if (id) {
      centerTab(id);
      loadDepartures(current);
    }
  }

  function createTabAndSlide(stop: Stop): void {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.id = stop.id;
    tab.textContent = stop.name;
    tabsEl.appendChild(tab);

    const slide = document.createElement('div');
    slide.className = 'slide';
    slide.dataset.stopId = stop.id;
    slide.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
    slidesEl.appendChild(slide);
  }

  tabsEl.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('.tab');
    if (!tab || !tabsEl.contains(tab)) return;
    const idx = order.findIndex((s) => s.id === tab.dataset.id);
    if (idx >= 0) goTo(idx);
  });

  function haversine(a: [number, number], b: [number, number]): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLng = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function saveLastPos(me: [number, number]) {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(me));
    } catch {
      void 0;
    }
  }

  function readLastPos(): [number, number] | null {
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
      return Array.isArray(p) && p.length === 2 ? (p as [number, number]) : null;
    } catch {
      return null;
    }
  }

  function getPosition(): Promise<[number, number]> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('no geolocation'));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const me: [number, number] = [pos.coords.longitude, pos.coords.latitude];
          saveLastPos(me);
          resolve(me);
        },
        reject,
        { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 },
      );
    });
  }

  function sortedByProximity(me: [number, number]): Stop[] {
    return order
      .map((s) => ({ s, d: s.coords ? haversine(me, s.coords) : Infinity }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.s);
  }

  function orderChanged(newOrder: Stop[]): boolean {
    return newOrder.some((s, i) => s.id !== order[i]?.id);
  }

  function reorderDom(newOrder: Stop[], animate: boolean) {
    const doReorder = () => {
      newOrder.forEach((stop) => {
        const t = tabById(stop.id);
        if (t) tabsEl.appendChild(t);
      });
      newOrder.forEach((stop) => {
        const s = slideById(stop.id);
        if (s) slidesEl.appendChild(s);
      });
    };

    if (!animate) {
      doReorder();
      return;
    }

    const first = new Map<HTMLElement, number>();
    [...tabsEl.children].forEach((el) =>
      first.set(el as HTMLElement, (el as HTMLElement).getBoundingClientRect().left),
    );
    doReorder();
    [...tabsEl.children].forEach((el) => {
      const node = el as HTMLElement;
      const prevLeft = first.get(node);
      if (prevLeft == null) return;
      const dx = prevLeft - node.getBoundingClientRect().left;
      if (!dx) return;
      node.style.transition = 'none';
      node.style.transform = `translateX(${dx}px)`;
      requestAnimationFrame(() => {
        node.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        node.style.transform = '';
      });
      node.addEventListener(
        'transitionend',
        () => {
          node.style.transition = '';
          node.style.transform = '';
        },
        { once: true },
      );
    });
  }

  async function resortKeepingCurrent(animate: boolean) {
    let me: [number, number];
    try {
      me = await getPosition();
    } catch {
      return;
    }
    const currentId = order[current]?.id;
    const newOrder = sortedByProximity(me);
    if (!orderChanged(newOrder)) return;

    reorderDom(newOrder, animate);
    order = newOrder;
    current = Math.max(0, order.findIndex((s) => s.id === currentId));
    setSlideTransform(current, true);
    updateActiveTab();
    const id = order[current]?.id;
    if (id) centerTab(id);
  }

  async function initialSort() {
    let me: [number, number];
    try {
      me = await getPosition();
    } catch {
      return;
    }
    const newOrder = sortedByProximity(me);
    if (!orderChanged(newOrder)) return;

    reorderDom(newOrder, true);
    order = newOrder;
    current = 0;
    setSlideTransform(0, true);
    updateActiveTab();
    const id = order[0]?.id;
    if (id) {
      centerTab(id);
      loadDepartures(0);
    }
  }

  slidesEl.addEventListener('touchstart', (e) => {
    startX = e.touches[0]!.clientX;
    startY = e.touches[0]!.clientY;
    deltaX = 0;
    pullY = 0;
    axis = null;
    isDragging = true;
  });

  slidesEl.addEventListener(
    'touchmove',
    (e) => {
      if (!isDragging) return;
      const dx = e.touches[0]!.clientX - startX;
      const dy = e.touches[0]!.clientY - startY;

      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        if (axis === 'h') slidesEl.classList.add('dragging');
        if (axis === 'v') {
          ptr.classList.remove('animating');
          curSlide()?.classList.add('pulling');
        }
      }

      if (axis === 'h') {
        deltaX = dx;
        const offset = -(current * window.innerWidth) + deltaX;
        slidesEl.style.transform = `translateX(${offset}px)`;
      } else if (order.length > 0 && !refreshing && (curSlide()?.scrollTop ?? 0) <= 0 && dy > 0) {
        e.preventDefault();
        pullY = Math.min(dy * 0.5, 90);
        ptr.style.transform = `translateY(${pullY}px)`;
        const cs = curSlide();
        if (cs) cs.style.transform = `translateY(${pullY}px)`;
        const ready = pullY > 56;
        ptr.classList.toggle('ready', ready);
        ptrText.textContent = ready ? 'Release to refresh all' : 'Pull to refresh';
      }
    },
    { passive: false },
  );

  slidesEl.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    slidesEl.classList.remove('dragging');

    if (axis === 'h') {
      if (Math.abs(deltaX) > 60) {
        if (deltaX < 0 && current < order.length - 1) goTo(current + 1);
        else if (deltaX > 0 && current > 0) goTo(current - 1);
        else goTo(current);
      } else {
        goTo(current);
      }
    } else if (axis === 'v') {
      curSlide()?.classList.remove('pulling');
      if (pullY > 56 && !refreshing) refreshAll();
      else resetPtr();
    }

    deltaX = 0;
    pullY = 0;
    axis = null;
  });

  function resetPtr() {
    ptr.classList.add('animating');
    ptr.classList.remove('ready', 'refreshing');
    ptr.style.transform = '';
    ptrText.textContent = 'Pull to refresh';
    const cs = curSlide();
    if (cs) {
      cs.classList.remove('pulling');
      cs.style.transform = '';
    }
  }

  async function refreshAll() {
    refreshing = true;
    ptr.classList.add('animating', 'refreshing');
    ptr.classList.remove('ready');
    ptr.style.transform = 'translateY(56px)';
    const cs = curSlide();
    if (cs) {
      cs.classList.remove('pulling');
      cs.style.transform = 'translateY(56px)';
    }
    ptrText.textContent = 'Refreshing…';

    for (const s of order) cache[s.id] = null;
    try {
      await Promise.all(order.map((_s, i) => loadDepartures(i, true)));
    } catch {
      void 0;
    }
    await resortKeepingCurrent(true);
    refreshing = false;
    resetPtr();
  }

  async function loadDepartures(index: number, force = false): Promise<void> {
    const stop = order[index];
    if (!stop) return;
    const slide = slideById(stop.id);
    if (!slide) return;
    const now = Date.now();

    const cached = cache[stop.id];
    if (!force && cached && now - cached.time < 30000) {
      renderSlide(slide, cached.data, stop, {
        onRemoveUserStop: removeUserStop,
        onEditUserStop: editUserStop,
      });
      return;
    }

    if (!slide.querySelector('.dep-list')) {
      slide.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';
    }

    try {
      const params = new URLSearchParams({ stopId: stop.id });
      const anyStop = stop as Stop & { _userAdded?: boolean };
      if (anyStop._userAdded && Array.isArray(stop.coords)) {
        params.set('coords', `${stop.coords[0]},${stop.coords[1]}`);
      }
      const res = await fetch(`/api/departures?${params.toString()}`);
      const data: DeparturesResponse = await res.json();
      cache[stop.id] = { data, time: Date.now() };
      renderSlide(slide, data, stop, {
        onRemoveUserStop: removeUserStop,
        onEditUserStop: editUserStop,
      });
    } catch {
      if (!slide.querySelector('.dep-list')) {
        slide.innerHTML = '<div class="error">Failed to load</div>';
      }
    }
  }

  function addUserStop(newStop: Stop): void {
    if (order.some((s) => s.id === newStop.id)) return;
    const runtimeStop: UserStop = { ...newStop, _userAdded: true };
    userStops = [...userStops, runtimeStop];
    saveUserStops(userStops);
    order = [...order, runtimeStop];

    createTabAndSlide(runtimeStop);
    updateEmptyState();

    current = order.length - 1;
    setSlideTransform(current, true);
    updateActiveTab();
    centerTab(runtimeStop.id);
    loadDepartures(current, true);
  }

  function removeUserStop(id: string): void {
    const idx = order.findIndex((s) => s.id === id);
    if (idx < 0) return;
    if (!userStops.some((s) => s.id === id)) return;

    userStops = userStops.filter((s) => s.id !== id);
    saveUserStops(userStops);

    tabById(id)?.remove();
    slideById(id)?.remove();
    delete cache[id];

    order = order.filter((s) => s.id !== id);
    updateEmptyState();
    if (!order.length) return;
    if (idx <= current) current = Math.max(0, current - 1);
    setSlideTransform(current, true);
    updateActiveTab();
    const nextId = order[current]?.id;
    if (nextId) centerTab(nextId);
  }

  function updateUserStop(updated: Stop): void {
    const idx = userStops.findIndex((s) => s.id === updated.id);
    if (idx < 0) return;
    const runtimeStop: UserStop = { ...updated, _userAdded: true };
    userStops = userStops.map((s) => (s.id === updated.id ? runtimeStop : s));
    saveUserStops(userStops);
    order = order.map((s) => (s.id === updated.id ? runtimeStop : s));
    cache[updated.id] = null;
    const orderIdx = order.findIndex((s) => s.id === updated.id);
    if (orderIdx >= 0) loadDepartures(orderIdx, true);
  }

  function editUserStop(id: string): void {
    const stop = userStops.find((s) => s.id === id);
    if (!stop) return;
    modalApi?.openForEdit(stripUserFlag(stop));
  }

  function updateEmptyState(): void {
    const el = document.getElementById('emptyState');
    if (el) el.hidden = order.length !== 0;
    const locate = document.getElementById('locateBtn') as HTMLButtonElement | null;
    if (locate) locate.disabled = order.length === 0;
  }

  updateEmptyState();

  setInterval(async () => {
    if (refreshing) return;
    const cur = order[current];
    if (!cur) return;
    cache[cur.id] = null;
    await loadDepartures(current);
    resortKeepingCurrent(true);
  }, 30000);

  const cachedPos = readLastPos();
  if (cachedPos) {
    const cachedOrder = sortedByProximity(cachedPos);
    if (orderChanged(cachedOrder)) {
      reorderDom(cachedOrder, false);
      order = cachedOrder;
    }
  }

  goTo(0);
  initialSort();

  const locateBtn = document.getElementById('locateBtn') as HTMLButtonElement | null;
  locateBtn?.addEventListener('click', async () => {
    locateBtn.classList.add('loading');
    try {
      const me = await getPosition();
      const newOrder = sortedByProximity(me);
      if (orderChanged(newOrder)) {
        reorderDom(newOrder, true);
        order = newOrder;
      }
      current = 0;
      setSlideTransform(0, false);
      updateActiveTab();
      const id = order[0]?.id;
      if (id) {
        centerTab(id);
        cache[id] = null;
        await loadDepartures(0, true);
      }
    } catch {
      void 0;
    }
    locateBtn.classList.remove('loading');
  });

  modalApi = initAddStopModal({
    hasStop: (id) => order.some((s) => s.id === id),
    getUserStops: () => userStops,
    onAddStop: addUserStop,
    onRemoveStop: removeUserStop,
    onEditStop: updateUserStop,
  });
}

boot();
