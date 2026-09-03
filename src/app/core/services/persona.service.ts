import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Persona } from '../../shared/models';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class PersonaService {
  constructor(private http: HttpClient) {}

  // ── Personas / Aprendices ──────────────────────────────────────────────────

  /** Retorna TODAS las personas (uso interno). */
  async listarTodas(): Promise<any[]> {
    const resp: any = await firstValueFrom(
      this.http.get(`${BASE}/personas`, { withCredentials: true })
    );
    if (Array.isArray(resp)) return resp;
    if (resp?.data       && Array.isArray(resp.data))       return resp.data;
    if (resp?.aprendices && Array.isArray(resp.aprendices)) return resp.aprendices;
    if (resp?.personas   && Array.isArray(resp.personas))   return resp.personas;
    return [];
  }

  /** Retorna solo personas con cargo 'aprendiz'. */
  async listarAprendices(): Promise<any[]> {
    const todas = await this.listarTodas();
    return todas.filter((p: any) => p.cargo === 'aprendiz');
  }

  /** Retorna solo personas con cargo 'instructor' o 'administrador'. */
  async listarInstructores(): Promise<any[]> {
    const todas = await this.listarTodas();
    return todas.filter((p: any) =>
      p.cargo === 'instructor' || p.cargo === 'administrador'
    );
  }

  async buscarPersona(id: number): Promise<Persona> {
    return firstValueFrom(this.http.get<Persona>(`${BASE}/persona/buscar_jwsv/${id}`));
  }

  async actualizarPersona(id: number, data: Partial<Persona>): Promise<any> {
    return firstValueFrom(this.http.put(`${BASE}/persona/${id}`, data));
  }

  async crearPersona(data: Partial<Persona>): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE}/persona/registrar_jwsv`, data));
  }

  // ── Usuarios y Credenciales ───────────────────────────────────────────────

  /**
   * Todos los usuarios del tenant con su persona resuelta (nombre, cargo,
   * correo — la `cargo` vive en `Persona`, no en `Usuario`). Sin selector de
   * cargo propio en el backend — se filtra client-side (ver `listarResponsablesBodega`).
   */
  async listarUsuarios(): Promise<any[]> {
    const resp: any = await firstValueFrom(
      this.http.get(`${BASE}/usuarios`, { withCredentials: true })
    );
    return Array.isArray(resp) ? resp : (resp?.data ?? []);
  }

  /**
   * Usuarios elegibles como responsable de un sitio de Materiales: activos, de
   * cualquier cargo — un "encargado de bodega" puede ser instructor O aprendiz
   * (ver Fase B: `SitiosACargoService` resuelve por `sitio.id_responsable`
   * sin mirar el cargo, y `EncargadoBodegaPermisosService` le otorga el bundle
   * B3). Antes esto excluía a los aprendices y no se los podía seleccionar en
   * el form aunque el backend sí los soportaba.
   */
  async listarResponsablesBodega(): Promise<any[]> {
    const todos = await this.listarUsuarios();
    const cargosPermitidos = ['administrador', 'administrador_erp', 'instructor', 'aprendiz'];
    return todos.filter((u: any) =>
      cargosPermitidos.includes(u.persona?.cargo) && u.persona?.estado !== 'inactivo'
    );
  }

  /** Centros de formación del tenant (una BD de tenant puede tener más de uno). */
  async listarCentros(): Promise<any[]> {
    const resp: any = await firstValueFrom(
      this.http.get(`${BASE}/centro-formacion`, { withCredentials: true })
    );
    return Array.isArray(resp) ? resp : (resp?.data ?? []);
  }

  /** Programas de formación del tenant (TIC, Gastronomía, …). Usado para
   *  clasificar los sitios de Materiales por programa (Ronda 7). */
  async listarProgramas(): Promise<any[]> {
    const resp: any = await firstValueFrom(
      this.http.get(`${BASE}/programas`, { withCredentials: true })
    );
    return Array.isArray(resp) ? resp : (resp?.data ?? []);
  }

  async crearUsuario(data: { fk_persona: number; fk_aplicativo: number }): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE}/usuario/registrar_jwsv`, data));
  }

  async crearCredencial(data: {
    login: string; password: string; fk_usuario: number; fk_rol: number;
  }): Promise<any> {
    return firstValueFrom(this.http.post(`${BASE}/credencial/registrar_jwsv`, data));
  }

  // ── Recuperación de contraseña ────────────────────────────────────────────

  async solicitarRecuperacion(correo: string): Promise<any> {
    return firstValueFrom(
      this.http.post(`${BASE}/departamento/recuperar/solicitar`, { correo })
    );
  }

  async verificarCodigo(correo: string, codigo: string): Promise<any> {
    return firstValueFrom(
      this.http.post(`${BASE}/departamento/recuperar/verificar`, { correo, codigo })
    );
  }

  async cambiarPassword(correo: string, codigo: string, nuevoPassword: string): Promise<any> {
    return firstValueFrom(
      this.http.post(`${BASE}/departamento/recuperar/cambiar`, { correo, codigo, nuevoPassword })
    );
  }
}
