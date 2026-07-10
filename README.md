# Frequent Stops

A minimal, mobile-first web app that shows the next departures for a personal
list of public-transit stops in Dresden (DVB / VVO network). Swipe between your
stops, pull to refresh, and have the stop tabs re-order themselves by distance
to your current location.

Built with [Astro](https://astro.build/) (SSR) and the
[dvbjs](https://github.com/kiliankoe/dvbjs) API client, deployed on Vercel.

## Features

- **Live departures** per stop with line badges in the official line colours.
- **Delays** shown per departure (`+2 min`, `on time`, `Cancelled`), plus the
  scheduled departure time.
- **Lines of interest** — highlight the lines you actually care about at each stop.
- **Direction of interest** — highlight only the departures heading the way you
  want, using a compass bearing instead of hardcoded terminus names.
- **Proximity sorting** — on load, stops are sorted nearest-first using your
  geolocation; the order refreshes (with an animated re-sort) on every update.
- **No-flicker updates** — departures update in place; new/removed entries
  animate in and out.
- **Pull-to-refresh** that refreshes all stops at once.

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # production build
npm run preview  # preview the production build
```

## Configuring your stops

There are three ways to configure the initial stop list, in this priority order:

1. **`STOPS_JSON` environment variable** — a JSON array of `Stop` objects.
   Handy for hosted deployments (e.g. Vercel). If set and parseable, wins.
2. **`src/scripts/stops.local.ts`** — your personal, git-ignored config.
   Used if the env var is missing.
3. **`src/scripts/stops.example.ts`** — committed example config, used as
   fallback.

Beyond that, users can add their own stops **at runtime via the `+` button** in
the UI. Those stops are stored in the browser’s `localStorage` (per device) and
appear as additional tabs.

To set up your own stops without committing them to a public repo, copy the
example to a local file and edit it:

```bash
cp src/scripts/stops.example.ts src/scripts/stops.local.ts
```

`stops.local.ts` is listed in `.gitignore`, so it never lands in the public repo.

### Finding stop ids and coordinates

Use the `+` button in the UI — it searches the DVB stop registry, lets you pick
lines and directions of interest, and stores the result in `localStorage`.

If you’d rather bake stops into the config (env / `stops.local.ts`), the same
search endpoint is available at `GET /api/search-stop?q=<name>` while the dev
server is running.

### Stop options

```ts
export const stops: Stop[] = [
  {
    id: '33000037',                 // DVB stop id
    name: 'Postplatz',              // display name
    coords: [13.7335, 51.0508],     // [lng, lat] — enables proximity sorting
    linesOfInterest: [1, 2, 9, 12], // lines to highlight
    directions: { 1: 'E', 2: 'E' }, // direction of interest per line
  },
];
```

- **`linesOfInterest`** — numbers or strings (e.g. `62`, `'S1'`). A line is only
  highlighted when other lines also depart at the stop (unless a direction is set).
- **`directions`** — per line, a heading toward where you want to travel. Give a
  compass string (`'N'`, `'NE'`, `'E'`, `'SE'`, `'S'`, `'SW'`, `'W'`, `'NW'`) or
  degrees (`0`–`360`). A departure counts as "in the right direction" when the
  bearing from the stop to the (dynamically resolved) destination is within a
  tolerance (default 65°). This avoids hardcoding terminus names — any terminus
  in that general direction qualifies.

  For tricky stops where both travel directions lie on the same side, narrow the
  tolerance with the object form:

  ```ts
  directions: { 62: { to: 'NE', tol: 40 } }
  ```

  When a direction is configured for a line, only departures matching **both**
  the line and the direction are highlighted — even if it is the only line at
  the stop.

## Line colours

Line badges use colours mapped in `src/scripts/lines.ts`. Trams/trains render
as rounded rectangles, buses and S-Bahn as circles.

## Project structure

```
src/
  pages/
    index.astro           # UI shell
    api/
      departures.ts       # SSR endpoint: departures + bearings
      search-stop.ts      # SSR endpoint: stop search (for the + modal)
      stop-lines.ts       # SSR endpoint: lines & destinations at a stop
  components/
    AddStopModal.astro    # “Add stop” modal markup
  scripts/
    stops.ts              # config loader (env -> local -> example)
    stops.types.ts        # Stop type
    stops.example.ts      # committed example config
    stops.local.ts        # your private config (git-ignored)
    lines.ts              # line colours & badge shapes
    client/               # client-side app modules (bundled by Astro)
  styles/app.css
```

## Notes

- Stop ids and coordinates are public transit data — not secrets. The point of
  the local file is to keep your personal selection out of a public repo.
- Geolocation-based sorting and pull-to-refresh are touch/permission based, so
  they work best on a real mobile device (or device emulation with location
  allowed).
