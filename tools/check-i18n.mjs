// Avisa de los textos de la web que no tienen traducción al gallego en app/i18n.js.
//   node tools/check-i18n.mjs
import { readFileSync } from 'node:fs';
import { GL } from '../app/i18n.js';

const read = (f) => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
const code = read('app.js') + read('index.html');
const found = new Set();
for (const m of code.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) found.add(m[1]);
for (const m of code.matchAll(/data-t(?:-label|-placeholder)?="([^"]+)"/g)) found.add(m[1]);
for (const m of code.matchAll(/^\s+[\w'-]+: \['[^']+', '([^']+)'\],?$/gm)) found.add(m[1]);
const kinds = code.match(/REPORT_KINDS = \{([\s\S]*?)\};/)?.[1] ?? '';
for (const m of kinds.matchAll(/: '([^']+)'/g)) found.add(m[1]);
for (const m of code.matchAll(/plural\([^,]+, '([^']+)', '([^']+)'\)/g)) { found.add(m[1]); found.add(m[2]); }
const missing = [...found].filter((s) => !(s in GL));
if (missing.length) {
  console.log(`Faltan ${missing.length} traducciones:\n${missing.map((s) => `  "${s}"`).join('\n')}`);
  process.exitCode = 1;
} else console.log(`Todo traducido (${found.size} textos).`);
