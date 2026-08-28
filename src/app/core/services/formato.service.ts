import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Formato } from '../../shared/models';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class FormatoService {
  constructor(private http: HttpClient) {}

  async listarFormatos(): Promise<Formato[]> {
    return firstValueFrom(this.http.get<Formato[]>(`${BASE}/formatos/listar_jwsv`));
  }

  async subirFormato(nombre: string, file: File): Promise<any> {
    const fd = new FormData();
    fd.append('nombre', nombre);
    fd.append('archivo', file);
    return firstValueFrom(this.http.post(`${BASE}/formatos/subir_jwsv`, fd));
  }

  async eliminarFormato(id: number): Promise<any> {
    return firstValueFrom(this.http.delete(`${BASE}/formatos/eliminar_jwsv/${id}`));
  }
}
