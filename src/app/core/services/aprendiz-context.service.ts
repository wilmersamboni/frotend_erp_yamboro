import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';

/**
 * Estado compartido de "¿este aprendiz tiene una etapa práctica creada?" —
 * lo consumen tanto HomeComponent (qué dashboard mostrar) como
 * SidebarComponent (mostrar "Seguimiento" o "Mis Horarios", nunca ambos).
 * Una sola carga por sesión de usuario, para no duplicar la llamada HTTP
 * entre el layout y el home.
 */
@Injectable({ providedIn: 'root' })
export class AprendizContextService {
  private auth = inject(AuthService);
  private api  = inject(ApiService);

  /** null = aún no se sabe (cargando o no aplica a este rol). */
  readonly tieneEtapa = signal<boolean | null>(null);
  readonly practicas  = signal<any[]>([]);

  private cargando = false;
  private cargadoParaUsuario: string | null = null;
  private cargadoEn = 0;
  // Antes el caché no vencía nunca dentro de la misma sesión (auditoría
  // 2026-09-16): si a un aprendiz le creaban una etapa práctica con la
  // pestaña abierta, el guard `soloAprendizConEtapa` y el sidebar seguían
  // viendo `tieneEtapa=false` hasta cerrar sesión. TTL corto en vez de
  // enganchar el canal de WebSocket — esta pantalla no lo tenía ya cableado
  // y el dato no es tan sensible al segundo como para justificarlo.
  private static readonly TTL_MS = 60_000;

  async cargar(): Promise<void> {
    if (this.auth.cargo() !== 'aprendiz') {
      this.tieneEtapa.set(null);
      return;
    }

    const userId = this.auth.user()?.id ?? null;
    // Ya está cargado para ESTE usuario y todavía no venció — evita refetch
    // si el mismo aprendiz navega entre home/sidebar/otras páginas seguido.
    const vigente = Date.now() - this.cargadoEn < AprendizContextService.TTL_MS;
    if (this.cargadoParaUsuario === userId && userId !== null && vigente) return;
    if (this.cargando) return;

    this.cargando = true;
    try {
      const practicas = await this.api.listarPracticas();
      this.practicas.set(practicas);
      this.tieneEtapa.set(practicas.length > 0);
      this.cargadoParaUsuario = userId;
      this.cargadoEn = Date.now();
    } catch {
      this.practicas.set([]);
      this.tieneEtapa.set(false);
      this.cargadoParaUsuario = userId;
      this.cargadoEn = Date.now();
    } finally {
      this.cargando = false;
    }
  }
}
