import { Formato } from '../../../../shared/models';

/**
 * Presentación compartida de un formato (tarjeta, fila de lista y visor):
 * etiqueta y color por tipo, ícono por extensión, tamaño y fecha legibles.
 * Colores con tokens del tema, así se adaptan al modo oscuro.
 */

export const FILE_BASE = '/uploads/formatos/';

export const TIPOS_FORMATO: { value: string; label: string }[] = [
  { value: 'bitacora',         label: 'Bitácora' },
  { value: 'acta_seguimiento', label: 'Acta seguimiento' },
  { value: 'otro',             label: 'Otro' },
];

export interface Tono { bg: string; text: string; borde: string; }

const TONO_TIPO: Record<string, Tono> = {
  bitacora:         { bg: 'var(--ok-bg)',     text: 'var(--ok-text)',     borde: 'var(--ok-border)' },
  acta_seguimiento: { bg: 'var(--info-bg)',   text: 'var(--info-text)',   borde: 'var(--info-border)' },
  otro:             { bg: 'var(--violet-bg)', text: 'var(--violet-text)', borde: 'var(--border)' },
};
const TONO_NEUTRO: Tono = { bg: 'var(--surface2)', text: 'var(--text-muted)', borde: 'var(--border)' };

export type TipoVista = 'pdf' | 'imagen' | 'ninguna';

export interface InfoArchivo {
  /** Texto corto para el ícono: PDF, DOC, XLS, IMG… */
  ext: string;
  tono: Tono;
  /** Qué puede mostrar el visor integrado. */
  vista: TipoVista;
}

export function urlFormato(f: Formato): string {
  return FILE_BASE + f.ruta_archivo;
}

export function etiquetaTipo(tipo: string): string {
  return TIPOS_FORMATO.find((t) => t.value === tipo)?.label ?? tipo;
}

export function tonoTipo(tipo: string): Tono {
  return TONO_TIPO[tipo] ?? TONO_NEUTRO;
}

export function infoArchivo(f: Formato): InfoArchivo {
  const ext = (f.ruta_archivo ?? '').split('.').pop()?.toLowerCase() ?? '';
  const mime = (f.mime_type ?? '').toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') {
    return { ext: 'PDF', tono: { bg: 'var(--err-bg)', text: 'var(--err-text)', borde: 'var(--err-border)' }, vista: 'pdf' };
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) || mime.startsWith('image/')) {
    return { ext: 'IMG', tono: { bg: 'var(--violet-bg)', text: 'var(--violet-text)', borde: 'var(--border)' }, vista: 'imagen' };
  }
  if (['doc', 'docx'].includes(ext)) {
    return { ext: 'DOC', tono: { bg: 'var(--info-bg)', text: 'var(--info-text)', borde: 'var(--info-border)' }, vista: 'ninguna' };
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return { ext: 'XLS', tono: { bg: 'var(--ok-bg)', text: 'var(--ok-text)', borde: 'var(--ok-border)' }, vista: 'ninguna' };
  }
  return { ext: (ext || 'FILE').slice(0, 4).toUpperCase(), tono: TONO_NEUTRO, vista: 'ninguna' };
}

/** "245 KB", "1,2 MB"; null si no se conoce. */
export function tamanoLegible(bytes: number | null | undefined): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es-CO', { maximumFractionDigits: 1 })} MB`;
}

/** "1 oct 2026"; null si no hay fecha válida. */
export function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Subido en los últimos 7 días. */
export function esNuevo(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t) && Date.now() - t < 7 * 24 * 60 * 60 * 1000;
}
