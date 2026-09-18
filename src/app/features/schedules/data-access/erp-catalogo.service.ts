import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HorariosApiService } from './horarios-api.service';
import { environment } from '../../../../environments/environment';

const BASE = environment.apiUrl; // → ERP, puerto 3000 vía proxy

/**
 * Adapta las respuestas del ERP real (personas/cursos/ambientes/matrículas)
 * a la forma que esperan las pantallas de horarios portadas de ChronoGest
 * (que originalmente hablaban con endpoints propios /instructores, /fichas,
 * /ambientes que ya no existen — ese dominio vive en el ERP).
 */
@Injectable({ providedIn: 'root' })
export class ErpCatalogoService {
  constructor(
    private http: HttpClient,
    private horariosApi: HorariosApiService,
  ) {}

  // ── Personas ────────────────────────────────────────────────────────────────

  private mapPersona(p: any) {
    return {
      id: p.idPersona,
      nombre: p.nombre ?? '',
      apellido: p.apellido ?? '',
      tipoDoc: p.tipoDoc ?? 'CC',
      numDoc: String(p.cedula ?? ''),
      correo: p.correo ?? '',
      telefono: String(p.telefono ?? ''),
      fotoPerfil: p.fotoPerfil ?? null,
      municipio: p.municipio?.nombre ?? '',
      estado: p.estado ?? 'activo',
      esLider: p.esLider ?? false,
      areaLiderada: p.areaLiderada ?? null,
      esTransversal: p.esTransversal ?? false,
    };
  }

  async getInstructores(): Promise<any[]> {
    const list: any[] = await firstValueFrom(this.http.get<any[]>(`${BASE}/personas/cargo/instructor`));
    return (list ?? []).map((p) => this.mapPersona(p));
  }

  async getAdministradores(): Promise<any[]> {
    const list: any[] = await firstValueFrom(this.http.get<any[]>(`${BASE}/personas/cargo/administrador`));
    return (list ?? []).map((p) => this.mapPersona(p));
  }

  async getAprendices(): Promise<any[]> {
    const list: any[] = await firstValueFrom(this.http.get<any[]>(`${BASE}/personas/cargo/aprendiz`));
    return (list ?? []).map((p) => this.mapPersona(p));
  }

  async getPersona(id: string): Promise<any | null> {
    if (!id) return null;
    const p: any = await firstValueFrom(this.http.get(`${BASE}/personas/${id}`));
    return p ? this.mapPersona(p) : null;
  }

  setLider(id: string, body: { esLider: boolean; areaLiderada?: string }): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE}/personas/${id}/lider`, body));
  }

  setTransversal(id: string, body: { esTransversal: boolean }): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE}/personas/${id}/transversal`, body));
  }

  // ── Fichas (Curso) ──────────────────────────────────────────────────────────

  private mapFicha(c: any) {
    return {
      id: c.idCurso,
      idCurso: c.idCurso,
      codigo: c.codigo ?? '',
      programa: c.programa?.nombre ?? '',
      area: c.area?.nombre ?? '',
      estado: 'activo', // Curso del ERP no tiene estado propio
    };
  }

  async getFichas(): Promise<any[]> {
    const list: any[] = await firstValueFrom(this.http.get<any[]>(`${BASE}/cursos`));
    return (list ?? []).map((c) => this.mapFicha(c));
  }

  /** Resuelve la(s) matrícula(s)/ficha(s) de un aprendiz — reemplaza el `fichaId` plano que tenía ChronoGest. */
  async getMatriculasDePersona(personaId: string): Promise<any[]> {
    if (!personaId) return [];
    const list: any[] = await firstValueFrom(this.http.get<any[]>(`${BASE}/matriculas/persona/${personaId}`));
    return (list ?? []).map((m) => ({
      idMatricula: m.idMatricula,
      estado: m.estado,
      avance: m.avance,
      ficha: m.curso ? this.mapFicha(m.curso) : null,
    }));
  }

  // ── Ambientes ───────────────────────────────────────────────────────────────

  private mapAmbiente(a: any) {
    return {
      id: a.idAmbiente,
      nombre: a.nombre,
      tipo: a.tipo ?? 'ambiente',
      area: a.area?.nombre ?? null,
      areaId: a.areaId ?? null,
      sede: a.sede?.nombre ?? null,
      municipio: a.municipio?.nombre ?? null,
    };
  }

  async getAmbientes(): Promise<any[]> {
    const list: any[] = await firstValueFrom(this.http.get<any[]>(`${BASE}/ambientes`));
    return (list ?? []).map((a) => this.mapAmbiente(a));
  }

  /** Disponibilidad de ambientes para un día/jornada dados — calculada en backend-epsas-horarios (ver HorariosService.getAmbientesDisponibilidad). */
  getAmbientesDisponibilidad(diaSemana: string, jornada: string, tipo?: string): Promise<any[]> {
    return this.horariosApi.getAmbientesDisponibilidad(diaSemana, jornada, tipo);
  }
}
