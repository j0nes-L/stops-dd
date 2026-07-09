import { findStop } from 'dvbjs';

const query = process.argv.slice(2).join(' ');

if (!query) {
  console.log('Usage:   node find-stop.mjs "<search term>"');
  console.log('Example: node find-stop.mjs "Postplatz"');
  process.exit(1);
}

const results = await findStop(query);

if (results.length === 0) {
  console.log(`No stops found for "${query}".`);
  process.exit(0);
}

console.log(`\nResults for "${query}":\n`);
for (const stop of results) {
  const coords = stop.coords ? `, coords: [${stop.coords[0]}, ${stop.coords[1]}]` : '';
  console.log(`  { id: '${stop.id}', name: '${stop.name}'${coords} },   // ${stop.city}`);
}
console.log('\nCopy the desired line into src/stops.ts');

