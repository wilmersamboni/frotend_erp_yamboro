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

/**
 * ¿Puede esta cuenta ser cuentadante? (misma regla que el backend, `CuentadanteService.assertPuedeSerCuentadante`):
 * instructor o administrador por su cargo (administradores desde el 2026-10-09), o cualquier otra cuenta que el
 * administrador habilitó en Usuarios (`puedeSerCuentadante`). Un aprendiz nunca, tenga o no la marca.
 */
export function puedeSerCuentadante(u: { puedeSerCuentadante?: boolean | null; persona?: { cargo?: string | null } | null }): boolean {
  const cargo = u.persona?.cargo?.toLowerCase() ?? '';
  if (cargo === 'aprendiz') return false;
  return ['instructor', 'administrador', 'administrador_erp'].includes(cargo) || u.puedeSerCuentadante === true;
}

export const marcaModelo = (b: BienACargo): string => [b.marca, b.modelo].filter((v) => v && v.trim()).join(' / ');
