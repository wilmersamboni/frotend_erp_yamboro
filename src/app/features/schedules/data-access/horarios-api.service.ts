import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

const BASE2 = environment.apiPracticaUrl; // → EPSAS-práctica, puerto 3001 vía proxy

/**
 * Cliente HTTP del módulo de horarios (backend-practica-hexagonal),
 * portado 1:1 de los métodos de horarios/competencias/eventos
 * que ChronoGest tenía en su ApiService monolítico.
 */
@Injectable({ providedIn: 'root' })
export class HorariosApiService {
  constructor(private http: HttpClient) {}

  // ── Horarios ────────────────────────────────────────────────────────────────

  getHorarios(): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/horarios`));
  }
  getHorariosStats(): Promise<{ total: number; activos: number }> {
    return firstValueFrom(this.http.get<{ total: number; activos: number }>(`${BASE2}/horarios/stats`));
  }
  getHorariosDisponiblesAhora(): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/horarios/disponibles-ahora`));
  }
  getHorariosByInstructor(id: string): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/horarios/by-instructor/${id}`));
  }
  getHorariosByFicha(id: string): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/horarios/by-ficha/${id}`));
  }
  getHorariosByAmbiente(id: string): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/horarios/by-ambiente/${id}`));
  }
  getAmbientesDisponibilidad(diaSemana: string, jornada: string, tipo?: string): Promise<any[]> {
    let params = new HttpParams().set('diaSemana', diaSemana).set('jornada', jornada);
    if (tipo) params = params.set('tipo', tipo);
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/horarios/ambientes-disponibilidad`, { params }));
  }
  getHorario(id: string): Promise<any> {
    return firstValueFrom(this.http.get(`${BASE2}/horarios/${id}`));
  }
  /** Crea uno o varios horarios de una — usa el endpoint dedicado de batch. */
  createHorariosBatch(dias: any[]): Promise<any[]> {
    return firstValueFrom(this.http.post<any[]>(`${BASE2}/horarios/batch`, { dias }));
  }
  createHorario(dto: any): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE2}/horarios`, dto));
  }
  updateHorario(id: string, dto: any): Promise<any> {
    return firstValueFrom(this.http.put(`${BASE2}/horarios/${id}`, dto));
  }
  deleteHorario(id: string): Promise<any> {
    return firstValueFrom(this.http.delete(`${BASE2}/horarios/${id}`));
  }
  toggleHorario(id: string): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/horarios/${id}/toggle`, {}));
  }
  playHorario(id: string, body?: { ambienteId?: string; ubicacionId?: string; ubicacionNombre?: string }): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/horarios/${id}/play`, body ?? {}));
  }
  finalizarHorario(id: string, motivo: string): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/horarios/${id}/finalizar`, { motivo }));
  }
  finalizarHorarioTransversal(id: string): Promise<any> {
    return firstValueFrom(this.http.patch(`${BASE2}/horarios/${id}/finalizar-transversal`, {}));
  }

  // ── Competencias ────────────────────────────────────────────────────────────

  getCompetencias(): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/competencias`));
  }
  getCompetenciasByHorario(horarioId: string): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/competencias/by-horario/${horarioId}`));
  }
  getCompetenciasByInstructor(id: string): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/competencias/instructor/${id}`));
  }
  createCompetencia(dto: any): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE2}/competencias`, dto));
  }
  updateCompetencia(id: string, dto: any): Promise<any> {
    return firstValueFrom(this.http.put(`${BASE2}/competencias/${id}`, dto));
  }
  deleteCompetencia(id: string): Promise<any> {
    return firstValueFrom(this.http.delete(`${BASE2}/competencias/${id}`));
  }

  // ── Eventos ─────────────────────────────────────────────────────────────────

  getEventos(): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/eventos`));
  }
  getEventosByFicha(fichaId: string): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE2}/eventos/by-ficha/${fichaId}`));
  }
  createEvento(dto: any): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE2}/eventos`, dto));
  }
  updateEvento(id: string, dto: any): Promise<any> {
    return firstValueFrom(this.http.put(`${BASE2}/eventos/${id}`, dto));
  }
  deleteEvento(id: string): Promise<any> {
    return firstValueFrom(this.http.delete(`${BASE2}/eventos/${id}`));
  }
}
