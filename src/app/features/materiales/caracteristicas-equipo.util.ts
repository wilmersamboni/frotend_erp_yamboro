import { CampoCaracteristica, PlantillaCaracteristicas } from './data-access/materiales-api.service';

/** Funciones sin Angular de las características de los equipos (las usa también el Excel del cuentadante). */

/**
 * Claves de la lista sugerida de cómputo (backend: `PLANTILLAS_CARACTERISTICAS`). Lo que no está acá es un **campo
 * propio**: el nombre que escribió el usuario es la clave (2026-10-09). Se repite aquí para armar el resumen sin
 * pedir la lista al backend; si se agrega otra lista sugerida en el backend, sumar sus claves.
 */
const CLAVES_SUGERIDAS = new Set([
  'procesador', 'procesador_generacion', 'procesador_nucleos', 'ram_gb', 'ram_tipo', 'ram_mhz',
  'almacenamiento_tipo', 'almacenamiento_gb', 'graficos_tipo', 'graficos_modelo', 'pantalla_pulgadas',
]);

/** Mismos límites que el backend (`limpiarCaracteristicas`). */
export const MAX_CAMPOS_PROPIOS = 20;
export const MAX_NOMBRE_CAMPO = 40;
export const MAX_VALOR_CAMPO = 120;

export function esCampoPropio(clave: string): boolean {
  return !CLAVES_SUGERIDAS.has(clave);
}

/** Campos propios de un juego de características, en orden alfabético: [{ campo, valor }]. */
export function camposPropios(c: Record<string, string> | null | undefined): { campo: string; valor: string }[] {
  return Object.keys(c ?? {})
    .filter(esCampoPropio)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((campo) => ({ campo, valor: c![campo] }));
}

/** Grupos en el orden de la plantilla: [{ grupo: 'RAM', campos: [...] }, …]. */
export function gruposDe(plantilla: PlantillaCaracteristicas | null): { grupo: string; campos: CampoCaracteristica[] }[] {
  const grupos: { grupo: string; campos: CampoCaracteristica[] }[] = [];
  for (const c of plantilla?.campos ?? []) {
    const g = grupos.find((x) => x.grupo === c.grupo);
    if (g) g.campos.push(c);
    else grupos.push({ grupo: c.grupo, campos: [c] });
  }
  return grupos;
}

/** Solo los valores escritos, recortados (el backend valida y normaliza). */
export function valoresLimpios(valores: Record<string, unknown>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(valores)) {
    const t = v === null || v === undefined ? '' : String(v).trim();
    const clave = k.replace(/\s+/g, ' ').trim();
    if (t && clave) r[clave] = t;
  }
  return r;
}

/**
 * Una línea legible, igual que el backend: "i5-1235U 12.ª · 8 GB DDR4 · SSD NVMe 512 GB · Integrada · 14 pulg." y
 * después los campos propios con su nombre ("Pines GPIO: 40").
 */
export function resumenCaracteristicas(c: Record<string, string> | null | undefined): string {
  if (!c) return '';
  const unir = (...v: (string | undefined)[]) => v.filter(Boolean).join(' ');
  const conUnidad = (v: string | undefined, u: string) => (v ? `${v} ${u}` : undefined);
  return [
    unir(c['procesador'], c['procesador_generacion'], c['procesador_nucleos'] ? `(${c['procesador_nucleos']} núcleos)` : undefined),
    unir(conUnidad(c['ram_gb'], 'GB'), c['ram_tipo'], conUnidad(c['ram_mhz'], 'MHz')),
    unir(c['almacenamiento_tipo'], conUnidad(c['almacenamiento_gb'], 'GB')),
    unir(c['graficos_tipo'], c['graficos_modelo']),
    conUnidad(c['pantalla_pulgadas'], 'pulg.'),
    ...camposPropios(c).map((p) => `${p.campo}: ${p.valor}`),
  ]
    .filter(Boolean)
    .join(' · ');
}
