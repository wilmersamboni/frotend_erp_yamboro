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
