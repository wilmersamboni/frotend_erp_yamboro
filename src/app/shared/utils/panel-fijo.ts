/**
 * Posición de un panel desplegable con `position: fixed`, calculada desde el
 * botón que lo abre. Fijo (y no `absolute`) para que no lo recorte ningún
 * contenedor con overflow — p. ej. el `overflow-x-auto` de una tabla, que
 * cortaba los menús de filtro cuando había pocas filas.
 *
 * Se abre hacia abajo; si abajo no cabe `altoEstimado` y arriba hay más
 * espacio, se abre hacia arriba. `alinear: 'der'` pega el borde derecho del
 * panel al del botón (botones a la derecha de la pantalla).
 */
export interface PanelFijo {
  top: number | null;
  bottom: number | null;
  left: number;
  ancho: number;
  altoMax: number;
}

const MARGEN = 8;
const SEPARACION = 6;

export function calcularPanelFijo(
  boton: HTMLElement,
  opciones: { ancho: number; altoEstimado: number; alinear?: 'izq' | 'der' },
): PanelFijo {
  const r = boton.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ancho = Math.min(opciones.ancho, vw - MARGEN * 2);

  let left = opciones.alinear === 'der' ? r.right - ancho : r.left;
  left = Math.max(MARGEN, Math.min(left, vw - ancho - MARGEN));

  const abajo = vh - r.bottom - SEPARACION - MARGEN;
  const arriba = r.top - SEPARACION - MARGEN;
  const haciaArriba = abajo < opciones.altoEstimado && arriba > abajo;

  return haciaArriba
    ? { top: null, bottom: vh - r.top + SEPARACION, left, ancho, altoMax: arriba }
    : { top: r.bottom + SEPARACION, bottom: null, left, ancho, altoMax: abajo };
}

/**
 * Para el cierre al desplazar: true si el scroll ocurrió dentro del propio panel
 * (su lista con overflow, marcada con `data-panel-fijo`), que no debe cerrarlo.
 */
export function fueDentroDelPanel(e: Event): boolean {
  const t = e.target;
  return t instanceof Element && !!t.closest('[data-panel-fijo]');
}
