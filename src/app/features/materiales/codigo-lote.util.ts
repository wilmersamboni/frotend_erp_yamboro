/**
 * Código de lote automático (2026-10-06): `<SIGLA>-<DD>-<MM>-<AA>`, p. ej.
 * `ANE-06-10-26`. Lo genera el backend cuando el campo llega vacío
 * (`backend-practica-hexagonal/src/common/materiales/codigo-lote.util.ts`);
 * esta copia solo sirve para MOSTRAR en el formulario el código que se va a
 * generar. Mantener las dos siglas iguales. Si en la bodega ya existe, el
 * backend le agrega `-2`, `-3`…, cosa que desde acá no se ve.
 */

const VACIAS = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'PARA', 'CON', 'Y', 'EN', 'POR', 'A', 'X', 'AL', 'SIN']);

export function siglaProducto(nombre: string | null | undefined): string {
  const palabras = (nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((p) => p && !VACIAS.has(p));
  if (palabras.length === 0) return 'LT';
  if (palabras.length === 1) return palabras[0].slice(0, 3);
  return palabras
    .slice(0, 4)
    .map((p) => p[0])
    .join('');
}

/** `DD-MM-AA`; acepta 'YYYY-MM-DD' (sin correrse por zona horaria). Por defecto, hoy. */
export function fechaCodigoLote(fecha?: string | null): string {
  let d = new Date();
  if (fecha && /^\d{4}-\d{2}-\d{2}/.test(fecha)) {
    const [a, m, dia] = fecha.slice(0, 10).split('-').map(Number);
    d = new Date(a, m - 1, dia);
  }
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}`;
}

export function codigoLoteSugerido(nombreProducto: string | null | undefined, fecha?: string | null): string {
  return `${siglaProducto(nombreProducto)}-${fechaCodigoLote(fecha)}`;
}
