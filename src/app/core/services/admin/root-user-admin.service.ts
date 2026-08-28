import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreateRootUserDto, RootUser, UpdateRootUserDto } from '../../../shared/models/admin/root-user.model';

@Injectable({ providedIn: 'root' })
export class RootUserAdminService {
  private readonly baseUrl = '/api/admin/root-users';

  constructor(private http: HttpClient) {}

  obtenerTodos(): Observable<RootUser[]> {
    return this.http.get<RootUser[]>(this.baseUrl);
  }

  obtenerPorId(id: string): Observable<RootUser> {
    return this.http.get<RootUser>(`${this.baseUrl}/${id}`);
  }

  crear(dto: CreateRootUserDto): Observable<RootUser> {
    return this.http.post<RootUser>(this.baseUrl, dto);
  }

  actualizar(id: string, dto: UpdateRootUserDto): Observable<RootUser> {
    return this.http.patch<RootUser>(`${this.baseUrl}/${id}`, dto);
  }

  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
