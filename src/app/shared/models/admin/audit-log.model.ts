export type AuditAccion = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';

export interface AuditLog {
  id: string;
  tenantId: string | null;
  tenantSlug: string | null;
  usuario: string;
  accion: AuditAccion;
  modulo: string;
  descripcion: string | null;
  fecha: string;
}

export interface AuditLogFiltros {
  tenantId?: string;
  desde?: string;
  hasta?: string;
  accion?: AuditAccion;
  /** Máximo de registros (el servidor acepta hasta 500; sin indicarlo devuelve 100). */
  limite?: number;
}

/** Nombre en español de cada acción, para mostrarlo en pantalla. */
export const ACCION_ETIQUETA: Record<AuditAccion, string> = {
  CREATE: 'Creación',
  UPDATE: 'Modificación',
  DELETE: 'Eliminación',
  LOGIN:  'Ingreso',
  LOGOUT: 'Salida',
};

export const ACCION_COLORES: Record<AuditAccion, string> = {
  CREATE:  'bg-green-100 text-green-800',
  UPDATE:  'bg-blue-100 text-blue-800',
  DELETE:  'bg-red-100 text-red-800',
  LOGIN:   'bg-purple-100 text-purple-800',
  LOGOUT:  'bg-gray-100 text-gray-700',
};
