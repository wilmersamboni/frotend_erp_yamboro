import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuditLog, AuditLogFiltros } from '../../../shared/models/admin/audit-log.model';

@Injectable({ providedIn: 'root' })
export class AuditLogAdminService {
  private readonly baseUrl = '/api/admin/audit';

  constructor(private http: HttpClient) {}

  obtenerLogs(filtros: AuditLogFiltros = {}): Observable<AuditLog[]> {
    let params = new HttpParams();
    if (filtros.tenantId) params = params.set('tenantId', filtros.tenantId);
    if (filtros.desde)    params = params.set('desde', filtros.desde);
    if (filtros.hasta)    params = params.set('hasta', filtros.hasta);
    if (filtros.accion)   params = params.set('accion', filtros.accion);

    return this.http.get<AuditLog[]>(this.baseUrl, { params });
  }
}
