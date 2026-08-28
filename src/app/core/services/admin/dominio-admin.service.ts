import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Dominio, DominioDto } from '../../../shared/models/admin/dominio.model';

@Injectable({ providedIn: 'root' })
export class DominioAdminService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/admin/dominios';

  obtenerTodos(): Observable<Dominio[]> {
    return this.http.get<Dominio[]>(this.base);
  }

  obtenerPorTenant(tenantId: string): Observable<Dominio[]> {
    return this.http.get<Dominio[]>(`${this.base}?tenantId=${tenantId}`);
  }

  obtenerPorId(id: string): Observable<Dominio> {
    return this.http.get<Dominio>(`${this.base}/${id}`);
  }

  crear(dto: DominioDto): Observable<Dominio> {
    return this.http.post<Dominio>(this.base, dto);
  }

  actualizar(id: string, dto: Partial<DominioDto>): Observable<Dominio> {
    return this.http.patch<Dominio>(`${this.base}/${id}`, dto);
  }

  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
