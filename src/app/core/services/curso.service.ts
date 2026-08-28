import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Curso } from '../../shared/models';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class CursoService {
  constructor(private http: HttpClient) {}

  async listarCursosArea(idArea: number): Promise<Curso[]> {
    return firstValueFrom(this.http.get<Curso[]>(`${BASE}/curso/listar_jwsv/${idArea}`));
  }

  async crearCurso(data: Partial<Curso>): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE}/curso/registrar_jwsv`, data));
  }

  async editarCurso(id: number, data: Partial<Curso>): Promise<any> {
    return firstValueFrom(this.http.put(`${BASE}/curso/actualizar_jwsv/${id}`, data));
  }

  async eliminarCurso(id: number): Promise<any> {
    return firstValueFrom(this.http.delete(`${BASE}/curso/eliminar_jwsv/${id}`));
  }
}
