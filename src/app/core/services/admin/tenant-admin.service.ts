import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreateTenantDto, Tenant, TenantCreado, UpdateTenantDto } from '../../../shared/models/admin/tenant.model';

@Injectable({ providedIn: 'root' })
export class TenantAdminService {
  private readonly baseUrl = '/api/admin/tenants';

  constructor(private http: HttpClient) {}

  crear(dto: CreateTenantDto): Observable<TenantCreado> {
    return this.http.post<TenantCreado>(this.baseUrl, dto);
  }

  obtenerTodos(): Observable<Tenant[]> {
    return this.http.get<Tenant[]>(this.baseUrl);
  }

  obtenerPorId(id: string): Observable<Tenant> {
    return this.http.get<Tenant>(`${this.baseUrl}/${id}`);
  }

  actualizar(id: string, dto: UpdateTenantDto): Observable<Tenant> {
    return this.http.patch<Tenant>(`${this.baseUrl}/${id}`, dto);
  }

  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  toggleEstado(id: string, estado: 'activo' | 'inactivo'): Observable<Tenant> {
    return this.http.patch<Tenant>(`${this.baseUrl}/${id}`, { estado });
  }

  verificarConexion(id: string): Observable<{ erpDb: boolean }> {
    return this.http.get<{ erpDb: boolean }>(`${this.baseUrl}/${id}/verificar`);
  }

  reinicializar(id: string): Observable<{ mensaje: string; credencialesDefecto: { login: string; password: string } | null }> {
    return this.http.post<{ mensaje: string; credencialesDefecto: { login: string; password: string } | null }>(`${this.baseUrl}/${id}/reinicializar`, {});
  }
}
