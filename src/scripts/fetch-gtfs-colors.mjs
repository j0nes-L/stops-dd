
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const FEED_URL = 'https://download.gtfs.de/germany/nv_free/latest.zip';

async function headSize(url) {
  const r = await fetch(url, { method: 'HEAD' });
  const len = r.headers.get('content-length');
  if (!len) throw new Error('No content-length on HEAD');
  return Number(len);
}

async function range(url, start, end) {
  const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (r.status !== 206) throw new Error(`Expected 206 for range, got ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

function findEOCD(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('EOCD not found');
}

function parseCentralDirectory(buf) {
  const entries = [];
  let p = 0;
  while (p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.push({ name, method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function extractEntry(url, entry) {
  const lh = await range(url, entry.localOffset, entry.localOffset + 29);
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('Bad local header');
  const nameLen = lh.readUInt16LE(26);
  const extraLen = lh.readUInt16LE(28);
  const dataStart = entry.localOffset + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compSize - 1;
  const comp = await range(url, dataStart, dataEnd);
  if (entry.method === 0) return comp;
  if (entry.method === 8) return zlib.inflateRawSync(comp);
  throw new Error('Unsupported compression method ' + entry.method);
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const header = splitCsvLine(lines[0]).map((h) => h.trim().replace(/^\ufeff/, ''));
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const o = {};
    header.forEach((h, i) => (o[h] = (cols[i] ?? '').trim()));
    return o;
  });
}

const ROUTE_TYPE = {
  0: 'Tram', 1: 'Subway', 2: 'Rail', 3: 'Bus', 4: 'Ferry',
  109: 'S-Bahn', 400: 'Urban Rail', 700: 'Bus', 900: 'Tram', 1000: 'Ferry',
};

async function main() {
  console.log('Feed:', FEED_URL);
  const size = await headSize(FEED_URL);
  console.log('Size:', (size / 1024 / 1024).toFixed(1), 'MB');

  const tailLen = Math.min(66000, size);
  const tail = await range(FEED_URL, size - tailLen, size - 1);
  const eocd = findEOCD(tail);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);

  const cdBuf = await range(FEED_URL, cdOffset, cdOffset + cdSize - 1);
  const entries = parseCentralDirectory(cdBuf);
  console.log('Files in zip:', entries.map((e) => e.name).join(', '));

  const agencyEntry = entries.find((e) => e.name.endsWith('agency.txt'));
  const routesEntry = entries.find((e) => e.name.endsWith('routes.txt'));
  if (!routesEntry) throw new Error('routes.txt not found in feed');

  const agencies = agencyEntry ? parseCsv((await extractEntry(FEED_URL, agencyEntry)).toString('utf8')) : [];
  const routes = parseCsv((await extractEntry(FEED_URL, routesEntry)).toString('utf8'));

  // Debug dumps to identify how DVB / Dresden is represented in this feed
  writeFileSync('_gtfs-agencies.json', JSON.stringify(agencies, null, 2));
  const dresdenish = routes.filter((r) =>
    /dresden/i.test(`${r.route_long_name || ''} ${r.route_desc || ''} ${r.route_id || ''}`),
  );
  writeFileSync('_gtfs-dresden-routes.json', JSON.stringify(dresdenish.slice(0, 80), null, 2));

  const dvbAgencies = agencies.filter((a) =>
    /dresdner verkehrsbetriebe|(^|[^a-z])dvb([^a-z]|$)|dresden|verkehrsverbund oberelbe/i.test(a.agency_name || ''),
  );
  const dvbIds = new Set(dvbAgencies.map((a) => a.agency_id));

  let dvbRoutes = routes.filter((r) => dvbIds.has(r.agency_id));
  // Fallback: if agency mapping failed, keep tram-numbered routes for inspection
  if (dvbRoutes.length === 0) {
    dvbRoutes = routes.filter((r) => /^(1|2|3|4|6|7|8|9|10|11|12|13)$/.test(r.route_short_name || ''));
  }

  const simplified = dvbRoutes
    .map((r) => ({
      line: r.route_short_name,
      type: ROUTE_TYPE[Number(r.route_type)] || r.route_type,
      color: r.route_color ? '#' + r.route_color.toUpperCase() : '',
      textColor: r.route_text_color ? '#' + r.route_text_color.toUpperCase() : '',
      agency: (dvbAgencies.find((a) => a.agency_id === r.agency_id) || {}).agency_name || r.agency_id,
      longName: r.route_long_name,
    }))
    .sort((a, b) => (a.type + a.line).localeCompare(b.type + b.line, 'en', { numeric: true }));

  writeFileSync('_gtfs-dvb-routes.json', JSON.stringify({ agencies: dvbAgencies, routes: simplified }, null, 2));

  console.log('\nDVB agencies:', dvbAgencies.map((a) => `${a.agency_id}=${a.agency_name}`).join(' | '));
  console.log('\nline  type      color     text');
  for (const r of simplified) {
    console.log(
      `${(r.line || '').padEnd(5)} ${(r.type || '').padEnd(9)} ${(r.color || '-').padEnd(9)} ${r.textColor || '-'}`,
    );
  }
  console.log(`\nWrote ${simplified.length} routes to _gtfs-dvb-routes.json`);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  writeFileSync('_gtfs-dvb-routes.json', JSON.stringify({ error: e.message }, null, 2));
  process.exit(1);
});

