import { Injectable, inject, signal, effect } from '@angular/core';
import { IndexedDbService, AccionPendiente } from './indexed-db.service';
import { NetworkStatusService } from './network-status.service';

type Handler<T = any> = (payload: T) => Promise<void>;

/** Ciclo de reintento cuando hay pendientes y hay red, además de disparar
 *  al volver la señal y al encolar algo nuevo. */
const INTERVALO_REINTENTO_MS = 20_000;

/**
 * Un handler la lanza para decir "esto es un rechazo real del backend (los
 * datos ya no son válidos — placa en uso, ítem no disponible, etc.), no un
 * fallo de red" — la acción pasa a `conflicto` y NO se reintenta sola. Sin
 * esto, un `throw` cualquiera (incluida una promesa rechazada por fetch
 * fallida) se trata como fallo de red y se reintenta en el próximo ciclo.
 */
export class ConflictoSyncError extends Error {}

/**
 * Motor genérico de sincronización — lo comparten todos los flujos offline
 * (asignación de placas, entrega de solicitud, y los que se agreguen
 * después). No conoce ningún endpoint de negocio: cada flujo registra su
 * propio `handler` con `registerHandler(tipo, fn)`, y este servicio solo
 * sabe encolar, reintentar con backoff simple, y clasificar cada fallo como
 * "reintentable" (red) o "conflicto" (rechazo del backend, requiere
 * revisión humana — ver `ReconciliationDialogComponent`).
 *
 * Procesa la cola FIFO, una acción a la vez (nunca en paralelo) — evita que
 * dos acciones que tocan el mismo ítem se crucen. Sincroniza en foreground
 * (app abierta): a propósito NO usa la Background Sync API del Service
 * Worker, porque no existe en iOS Safari y dejaría el flujo roto en buena
 * parte de los celulares.
 */
@Injectable({ providedIn: 'root' })
export class SyncQueueService {
  private readonly db = inject(IndexedDbService);
  private readonly red = inject(NetworkStatusService);

  private readonly handlers = new Map<string, Handler>();
  private procesando = false;

  readonly pendientes = signal(0);
  readonly conflictos = signal(0);
  /** Ids de solicitud con una entrega guardada localmente y aún sin enviar
   *  (de la sesión actual) — para marcar la fila y no dejar entregarla dos veces. */
  readonly entregasPendientes = signal<ReadonlySet<string>>(new Set());

  constructor() {
    this.recuperarInterrumpidas();

    // Dispara al pasar de sin-red a con-red.
    effect(() => {
      if (this.red.alcanzable()) this.procesarCola();
    });

    // Reintento periódico — solo si hay algo que enviar y hay señal (evita
    // pings de cola vacía cada 20s todo el día). También refresca los
    // contadores: la sesión pudo cambiar (otro usuario entró al mismo celular).
    setInterval(() => {
      this.refrescarContadores();
      if (this.red.alcanzable() && this.pendientes() > 0) this.procesarCola();
    }, INTERVALO_REINTENTO_MS);
  }

  /** Sesión actual, leída de donde la guarda `AuthService` (no se inyecta
   *  para no acoplar este motor genérico al login). */
  private contexto(): { usuarioId: string | null; tenant: string | null } {
    let usuarioId: string | null = null;
    try {
      usuarioId = JSON.parse(localStorage.getItem('user') ?? 'null')?.id ?? null;
    } catch {
      usuarioId = null;
    }
    let tenant: string | null = null;
    try {
      tenant = localStorage.getItem('tenantSlug') || null;
    } catch {
      tenant = null;
    }
    return { usuarioId, tenant };
  }

  /** ¿Esta acción es de la sesión actual? Sin sello (acciones anteriores a
   *  este cambio) se considera propia; con sello, debe coincidir. */
  private esDeEstaSesion(a: AccionPendiente): boolean {
    if (a.usuarioId == null && a.tenant == null) return true;
    const c = this.contexto();
    return a.usuarioId === c.usuarioId && a.tenant === c.tenant;
  }

  /**
   * Al arrancar la app no puede haber nada realmente "enviando": si el proceso
   * se cerró (celular bloqueado, pestaña cerrada) a mitad de un envío, esa
   * acción quedó en `enviando` y `procesarCola` solo toma las `pendiente` — se
   * habría contado como pendiente para siempre sin enviarse nunca. Se devuelve a
   * `pendiente`; si el servidor sí llegó a aplicarla, el reintento vuelve como
   * rechazo (400/409) y termina en `conflicto` para revisión humana, sin duplicar.
   */
  async recuperarInterrumpidas(): Promise<void> {
    try {
      const atascadas = await this.db.listarAccionesPorEstado('enviando');
      for (const a of atascadas) {
        a.estado = 'pendiente';
        await this.db.actualizarAccion(a);
      }
    } catch {
      // Sin IndexedDB (tests/navegador restringido): no hay cola que recuperar.
    }
    await this.refrescarContadores();
  }

  /** Cada flujo (Fase 2/3) registra acá cómo llamar a su propio endpoint —
   *  este motor nunca conoce `asignarPlacas` ni `entregarSolicitud`. */
  registerHandler<T>(tipo: string, handler: Handler<T>): void {
    this.handlers.set(tipo, handler as Handler);
  }

  /** Guarda la acción localmente y devuelve su id (para que la UI pueda
   *  mostrar "guardado, pendiente de enviar #N" de inmediato, optimista). */
  async enqueue<T>(tipo: string, payload: T): Promise<number> {
    const id = await this.db.agregarAccion({
      tipo,
      payload,
      creadoEn: Date.now(),
      intentos: 0,
      ultimoError: null,
      estado: 'pendiente',
      ...this.contexto(),
    });
    await this.refrescarContadores();
    if (this.red.alcanzable()) this.procesarCola();
    return id;
  }

  async procesarCola(): Promise<void> {
    if (this.procesando) return;
    this.procesando = true;
    try {
      const acciones = (await this.db.listarAccionesPorEstado('pendiente'))
        .filter((a) => this.esDeEstaSesion(a))
        .sort((a, b) => a.creadoEn - b.creadoEn);
      for (const accion of acciones) {
        if (!this.red.alcanzable()) break; // se cortó la señal a mitad de la cola
        await this.procesarUna(accion);
      }
    } finally {
      this.procesando = false;
      await this.refrescarContadores();
    }
  }

  private async procesarUna(accion: AccionPendiente): Promise<void> {
    const handler = this.handlers.get(accion.tipo);
    // Handler todavía no registrado (ej. la feature dueña de este tipo no
    // se cargó en esta sesión) — se deja pendiente, se reintenta después,
    // sin contar como fallo.
    if (!handler) return;

    accion.estado = 'enviando';
    await this.db.actualizarAccion(accion);
    try {
      await handler(accion.payload);
      await this.db.eliminarAccion(accion.id!);
    } catch (e: any) {
      accion.intentos += 1;
      accion.ultimoError = e?.message ?? 'Error desconocido';
      const esRechazoBackend =
        e instanceof ConflictoSyncError ||
        e?.status === 400 ||
        e?.status === 403 ||
        e?.status === 404 ||
        e?.status === 409;
      accion.estado = esRechazoBackend ? 'conflicto' : 'pendiente';
      await this.db.actualizarAccion(accion);
    }
  }

  /** El diálogo de reconciliación pasa por acá al elegir "Reintentar". */
  async reintentarManualmente(id: number): Promise<void> {
    const accion = await this.db.obtenerAccion(id);
    if (!accion) return;
    accion.estado = 'pendiente';
    accion.ultimoError = null;
    await this.db.actualizarAccion(accion);
    await this.refrescarContadores();
    if (this.red.alcanzable()) this.procesarCola();
  }

  /** El diálogo de reconciliación pasa por acá al elegir "Descartar" — la
   *  acción se mueve al histórico (auditoría), nunca se pierde en silencio. */
  async descartar(id: number): Promise<void> {
    const accion = await this.db.obtenerAccion(id);
    if (!accion) return;
    await this.db.agregarAlHistorialConflictos({ ...accion, resueltoEn: Date.now(), resolucion: 'descartada' });
    await this.db.eliminarAccion(id);
    await this.refrescarContadores();
  }

  /** Todo lo que queda en `pendingActions` — una acción sale de ese store
   *  recién cuando `handler` resuelve sin error (`eliminarAccion`), así que
   *  no hace falta filtrar por estado acá: lo que está, importa. */
  async listarPendientesYConflictos(): Promise<AccionPendiente[]> {
    const todas = (await this.db.listarAcciones()).filter((a) => this.esDeEstaSesion(a));
    return todas.sort((a, b) => a.creadoEn - b.creadoEn);
  }

  private async refrescarContadores(): Promise<void> {
    // Sin IndexedDB (SSR/tests/navegador restringido) no hay cola que contar: quedan en 0.
    const todas = (await this.db.listarAcciones().catch(() => [])).filter((a) => this.esDeEstaSesion(a));
    const enCurso = todas.filter((a) => a.estado === 'pendiente' || a.estado === 'enviando');
    this.pendientes.set(enCurso.length);
    this.conflictos.set(todas.filter((a) => a.estado === 'conflicto').length);
    this.entregasPendientes.set(
      new Set(
        enCurso
          .filter((a) => a.tipo === 'materiales.entregarSolicitud')
          .map((a) => (a.payload as { id_solicitud?: string })?.id_solicitud)
          .filter((id): id is string => !!id),
      ),
    );
  }
}
