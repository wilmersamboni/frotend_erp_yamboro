import type { ElementoExistencia } from './data-access/materiales-api.service';

/**
 * Modal "Desactivar" de Mi Bodega (2026-11-12): conteos de los dos botones a
 * partir de lo seleccionado. Sin Angular para poder probarlo.
 *
 * "Eliminar N" cuenta solo los seleccionados sin historia (registro por error);
 * "Desactivar N", los seleccionados que se pueden desactivar. Cada botón actúa
 * sobre SU subconjunto, así una selección mixta no bloquea la otra acción.
 */
export interface ConteoSeleccion {
  seleccionados: number;
  eliminables: string[];
  desactivables: string[];
  /** Seleccionados que no se pueden eliminar (para el aviso "ya tienen historia"). */
  conHistoria: number;
}

export function contarSeleccion(
  elementos: ElementoExistencia[],
  seleccion: ReadonlySet<string>,
): ConteoSeleccion {
  const sel = elementos.filter((e) => seleccion.has(e.id));
  return {
    seleccionados: sel.length,
    eliminables: sel.filter((e) => e.eliminable).map((e) => e.id),
    desactivables: sel.filter((e) => e.desactivable).map((e) => e.id),
    conHistoria: sel.filter((e) => !e.eliminable).length,
  };
}

/** "unidad"/"unidades" o "lote"/"lotes" según el tipo de material de la ficha. */
export function nombreElemento(tipoMaterial: string, n: number): string {
  const devolutivo = tipoMaterial === 'DEVOLUTIVO';
  if (n === 1) return devolutivo ? 'unidad' : 'lote';
  return devolutivo ? 'unidades' : 'lotes';
}

/** Lo que dice el aviso de éxito: "Se eliminaron 3 unidades." / "Se desactivaron 1 unidad y 2 lotes." */
export function mensajeResultado(
  accion: 'eliminar' | 'desactivar',
  r: { unidades: number; lotes: number },
): string {
  const partes: string[] = [];
  if (r.unidades) partes.push(`${r.unidades} ${r.unidades === 1 ? 'unidad' : 'unidades'}`);
  if (r.lotes) partes.push(`${r.lotes} ${r.lotes === 1 ? 'lote' : 'lotes'}`);
  const verbo = accion === 'eliminar' ? 'Se eliminó' : 'Se desactivó';
  const total = r.unidades + r.lotes;
  return `${total === 1 ? verbo : verbo.replace(/ó$/, 'aron')} ${partes.join(' y ')}.`;
}
