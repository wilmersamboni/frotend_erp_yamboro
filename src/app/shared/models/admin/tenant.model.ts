export type EstadoTenant = 'activo' | 'inactivo';

export interface Tenant {
  id: string;
  nombre: string;
  slug: string;
  dominio: string;
  estado: EstadoTenant;
  creadoEn: string;
  actualizadoEn: string;
}

export interface TenantCredenciales {
  login: string;
  password: string;
}

export interface TenantCreado extends Tenant {
  credencialesDefecto?: TenantCredenciales | null;
}

export interface CreateTenantDto {
  nombre: string;
  slug: string;
  dominio: string;
  estado?: EstadoTenant;
}

export type UpdateTenantDto = Partial<CreateTenantDto>;
