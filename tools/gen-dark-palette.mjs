/**
 * Genera src/styles/dark-tailwind.generated.css — la parte del modo oscuro
 * que adapta las clases de color de Tailwind (bg-green-100, text-red-700,
 * text-gray-500…) sin tocar ningún componente.
 *
 * Por qué funciona: en Tailwind 4 cada utilidad compila a una variable
 * (`.text-gray-700 { color: var(--color-gray-700) }`), así que basta con
 * redefinir esas variables bajo `[data-theme="dark"]`.
 *
 * Reglas (medidas sobre el uso real del código, ver
 * Decisiones/2026-09-28 … modo oscuro en el vault):
 *  - Grises (gray/slate/zinc/neutral/stone): escala invertida a la paleta
 *    neutra aprobada (sin tinte azul). Los fondos SÓLIDOS oscuros
 *    (bg-gray-800/900, típicos de tooltips con text-white) se restauran
 *    aparte para que no queden claros con texto blanco encima.
 *  - Colores (green, red, amber…): 50–300 se usan casi solo como FONDO
 *    (343 vs 4) → tinte oscuro del color mezclado con la superficie;
 *    700–950 se usan casi solo como TEXTO (334 vs 6) → el tono claro
 *    equivalente (700→300, 800→200, 900→100, 950→50). 400–600 no cambian
 *    (bg-X-600 son botones sólidos con texto blanco). Los pocos fondos
 *    sólidos 700+ (hover:bg-red-700 de un botón) se restauran a su valor
 *    original, y text-X-600 se aclara a X-400 para que se lea sobre oscuro.
 *
 * Solo emite reglas explícitas para las clases que el código de verdad usa
 * (escanea src/). Regenerar después de agregar clases de color nuevas:
 *     node tools/gen-dark-palette.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEME = join(ROOT, 'node_modules', 'tailwindcss', 'theme.css');
const SRC = join(ROOT, 'src', 'app');
const OUT = join(ROOT, 'src', 'styles', 'dark-tailwind.generated.css');

const SURFACE = '#1a1c1b';
const HUES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan',
  'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const NEUTRALS = ['gray', 'slate', 'zinc', 'neutral', 'stone'];

// Paleta neutra aprobada (propuesta "oscuro neutro", artifact Modo oscuro EPSAS).
const NEUTRAL_SCALE = {
  50: '#222524', 100: '#262a28', 200: '#2f3331', 300: '#3b403d', 400: '#6b726e',
  500: '#9ba19e', 600: '#b3b8b5', 700: '#c9cdcb', 800: '#dadddb', 900: '#e6e8e7', 950: '#f1f2f1',
};
// Fondos sólidos oscuros (tooltips, chips "negros") — siguen siendo oscuros, un poco más claros que la superficie.
const NEUTRAL_SOLID_BG = { 700: '#454b48', 800: '#3b403d', 900: '#313633', 950: '#2a2e2c' };

// ── Paleta original de Tailwind ──
const theme = readFileSync(THEME, 'utf8');
const orig = {};
for (const m of theme.matchAll(/--color-([a-z]+)-(\d+):\s*([^;]+);/g)) {
  (orig[m[1]] ??= {})[m[2]] = m[3].trim();
}

// ── Clases usadas en el código ──
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|html)$/.test(name)) yield p;
  }
}
const used = new Set();
const clsRe = /(?<![\w-])((?:[a-z-]+:)*)(bg|text|border|from|via|to|ring|divide)-([a-z]+)-(\d{2,3})(?:\/(\d+))?(?![\w-])/g;
for (const file of walk(SRC)) {
  for (const m of readFileSync(file, 'utf8').matchAll(clsRe)) used.add(m[0]);
}

const esc = (s) => s.replace(/[:/[\]#.]/g, (c) => '\\' + c);
function selectorFor(cls) {
  const parts = cls.split(':');
  const base = parts.pop();
  const variants = parts;
  let sel = '.' + esc(cls);
  for (const v of variants) {
    if (v === 'hover') sel += ':hover';
    else if (v === 'focus') sel += ':focus';
    else if (v === 'active') sel += ':active';
    else if (v === 'group-hover') sel = '.group:hover ' + sel;
    else return null; // variante que no manejamos (md:, disabled:, etc.) — se reporta
  }
  return { sel, base };
}
const PROP = { bg: 'background-color', text: 'color', border: 'border-color', ring: '--tw-ring-color',
  from: '--tw-gradient-from', via: '--tw-gradient-via', to: '--tw-gradient-to', divide: 'border-color' };

const lines = [];
const skipped = [];
lines.push('/* ════════════════════════════════════════════════════════════════════');
lines.push('   GENERADO por tools/gen-dark-palette.mjs — NO editar a mano.');
lines.push('   Regenerar con: node tools/gen-dark-palette.mjs');
lines.push('   ════════════════════════════════════════════════════════════════════ */');
lines.push('');
lines.push(':root[data-theme="dark"] {');
lines.push('  /* Grises → escala neutra aprobada (sin tinte azul) */');
for (const n of NEUTRALS) {
  for (const [shade, val] of Object.entries(NEUTRAL_SCALE)) lines.push(`  --color-${n}-${shade}: ${val};`);
}
lines.push('');
lines.push('  /* Colores: tonos claros → tinte oscuro; tonos oscuros → claro equivalente */');
for (const h of HUES) {
  const o = orig[h];
  if (!o) continue;
  lines.push(`  --color-${h}-50: color-mix(in oklab, ${o['500']} 10%, ${SURFACE});`);
  lines.push(`  --color-${h}-100: color-mix(in oklab, ${o['500']} 16%, ${SURFACE});`);
  lines.push(`  --color-${h}-200: color-mix(in oklab, ${o['500']} 26%, ${SURFACE});`);
  lines.push(`  --color-${h}-300: color-mix(in oklab, ${o['500']} 40%, ${SURFACE});`);
  lines.push(`  --color-${h}-700: ${o['300']};`);
  lines.push(`  --color-${h}-800: ${o['200']};`);
  lines.push(`  --color-${h}-900: ${o['100']};`);
  lines.push(`  --color-${h}-950: ${o['50']};`);
}
lines.push('}');
lines.push('');

// Excepciones por clase, solo para las que el código usa.
const restores = [];
for (const cls of [...used].sort()) {
  const m = cls.match(/^((?:[a-z-]+:)*)(bg|text|border|from|via|to|ring|divide)-([a-z]+)-(\d{2,3})(?:\/(\d+))?$/);
  if (!m) continue;
  const [, , util, color, shade, alpha] = m;
  const isHue = HUES.includes(color);
  const isNeutral = NEUTRALS.includes(color);
  if (!isHue && !isNeutral) continue;

  let value = null;
  if (isHue && ['bg', 'from', 'via', 'to'].includes(util) && ['700', '800', '900', '950'].includes(shade)) {
    value = orig[color][shade];                         // fondo sólido: se queda oscuro
  } else if (isHue && util === 'text' && shade === '600') {
    value = orig[color]['400'];                         // texto medio → más claro sobre oscuro
  } else if (isNeutral && ['bg', 'from', 'via', 'to'].includes(util) && NEUTRAL_SOLID_BG[shade]) {
    value = NEUTRAL_SOLID_BG[shade];                    // tooltip/chip oscuro: sigue oscuro
  }
  if (!value) continue;

  const s = selectorFor(cls);
  if (!s) { skipped.push(cls); continue; }
  const v = alpha ? `color-mix(in oklab, ${value} ${alpha}%, transparent)` : value;
  // :where() deja la especificidad igual a la de la utilidad original y la
  // capa `utilities` la ubica después de Tailwind: gana sobre la clase base
  // pero NO sobre sus variantes hover:/focus: (más específicas), así que un
  // `text-red-600 hover:text-red-700` conserva su efecto al pasar el mouse.
  restores.push(`  :where(:root[data-theme="dark"]) ${s.sel} { ${PROP[util]}: ${v}; }`);
}
lines.push('/* Excepciones por clase (fondos sólidos oscuros, texto -600) */');
lines.push('@layer utilities {');
lines.push(...restores);
lines.push('}');
lines.push('');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n'));
console.log(`OK → ${OUT}`);
console.log(`   ${restores.length} excepciones por clase`);
if (skipped.length) console.log(`   Variantes no manejadas (revisar a mano): ${skipped.join(', ')}`);
