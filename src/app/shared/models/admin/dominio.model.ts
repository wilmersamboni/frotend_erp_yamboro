export interface Dominio {
  id: string;
  subdominio: string;
  ssl: boolean;
  tenantId: string;
  tenantNombre?: string;
  estado: 'activo' | 'inactivo' | 'pendiente';
  creadoEn: string;
  actualizadoEn: string;
}

export interface DominioDto {
  subdominio: string;
  ssl: boolean;
  tenantId: string;
  estado?: 'activo' | 'inactivo' | 'pendiente';
}

export const DOMINIO_ESTADO_COLORES: Record<Dominio['estado'], string> = {
  activo:    'bg-green-100 text-green-700',
  inactivo:  'bg-gray-100 text-gray-500',
  pendiente: 'bg-yellow-100 text-yellow-700',
};
