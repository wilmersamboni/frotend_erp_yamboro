import type { BienACargo } from './data-access/materiales-api.service';

/** Textos compartidos por la pantalla del cuentadante y su inventario en Excel (sin arrastrar exceljs). */
export const ESTADO_LEGIBLE: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  PRESTADO: 'Prestado',
  RESERVADO: 'Reservado',
  FUERA_DE_SEDE: 'Fuera de la sede',
  SALIDO: 'Salió de la sede',
  DAÑADO: 'Dañado',
  PERDIDO: 'Perdido',
  EN_MANTENIMIENTO: 'En mantenimiento',
};

export const marcaModelo = (b: BienACargo): string => [b.marca, b.modelo].filter((v) => v && v.trim()).join(' / ');
