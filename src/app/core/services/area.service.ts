import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Area } from '../../shared/models';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class AreaService {
  constructor(private http: HttpClient) {}

  async listarAreas(params?: any): Promise<Area[]> {
    const resp: any = await firstValueFrom(this.http.get(`${BASE}/areas`, { params }));
    if (Array.isArray(resp)) return resp;
    if (resp?.data  && Array.isArray(resp.data))  return resp.data;
    if (resp?.areas && Array.isArray(resp.areas)) return resp.areas;
    return [];
  }

  async crearArea(data: Partial<Area>): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE}/area/registrar_jwsv`, data));
  }

  async editarArea(id: number, data: Partial<Area>): Promise<any> {
    return firstValueFrom(this.http.put(`${BASE}/area/actualizar_jwsv/${id}`, data));
  }

  async eliminarArea(id: number): Promise<any> {
    return firstValueFrom(this.http.delete(`${BASE}/area/eliminar_jwsv/${id}`));
  }
}
