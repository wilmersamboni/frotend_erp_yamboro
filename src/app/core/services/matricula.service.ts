import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class MatriculaService {
  constructor(private http: HttpClient) {}

  async listarMatriculasPorAlumno(idAlumno: string): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(this.http.get(`${BASE}/matriculas/persona/${idAlumno}`));
      if (Array.isArray(resp)) return resp;
      if (resp?.data       && Array.isArray(resp.data))       return resp.data;
      if (resp?.matriculas && Array.isArray(resp.matriculas)) return resp.matriculas;
      return [];
    } catch { return []; }
  }

  /** Obtener TODAS las matrículas de una vez (optimización) */
  async listarTodasMatriculas(): Promise<any[]> {
    try {
      const resp: any = await firstValueFrom(this.http.get(`${BASE}/matriculas`));
      if (Array.isArray(resp)) return resp;
      if (resp?.data       && Array.isArray(resp.data))       return resp.data;
      if (resp?.matriculas && Array.isArray(resp.matriculas)) return resp.matriculas;
      return [];
    } catch (error) {
      console.error('Error listando todas las matrículas:', error);
      return [];
    }
  }
}
