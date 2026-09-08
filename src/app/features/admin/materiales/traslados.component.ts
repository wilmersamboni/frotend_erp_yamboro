import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import { Item, MaterialesApiService, Sitio, Traslado } from '../../../core/services/materiales/materiales-api.service';

/**
 * Traslados de ítems entre sitios — PENDIENTE → APROBADO/RECHAZADO, terminal
 * (el backend bloquea re-resolver uno ya resuelto). Sin doble confirmación
 * como Solicitudes, pero misma razón que Novedades para tabla a medida:
 * los botones cambian según estado.
 *
 * Gating de botones (Ronda 4, Fase 5; corregido tras el rework de
 * `TrasladosService.assertPuedeResolver`): además del servicio
 * (`materiales.traslados.aprobar`/`.rechazar`), el botón se oculta si (a) el
 * usuario es quien pidió el traslado (`aprobarTraslado`/`rechazarTraslado`
 * bloquean auto-aprobación con una excepción dedicada, sin excepción para
 * admin) o (b) no es admin, ni responsable del sitio ORIGEN, ni responsable
 * del sitio DESTINO — el backend SÍ tiene bypass total de admin (y considera
 * también el responsable de destino, no solo el de origen), así que el gate
 * del frontend replica exactamente esa regla.
 *
 * Crear (Ronda 4, Fase 6): reemplaza el `<select id_item>` plano por
 * búsqueda de placa SENA (mismo flujo que SGM) — `buscarItemPorPlaca()` ya
 * existe y ya lo usa `items.component.ts`. El `Item` que devuelve solo trae
 * `id_sitio` (el backend no mapea la relación `sitio` al dominio), así que
 * el sitio de origen se resuelve cruzando contra `sitios` ya cargado, igual
 * que `esResponsableDelSitio` en Fase 5.
 *
 * Pulido (Ronda 4, Fase 9): "Ver detalles" por fila, reusando los datos ya
 * cargados (sin backend nuevo) — útil sobre todo cuando la justificación no
 * entra en la celda truncada de la tabla.
 */
@Component({
  selector: 'app-materiales-traslados',
  standalone: true,
  imports: [FormsModule, DatePipe, StatusBadgeComponent, SearchableSelectComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Traslados</h1>
        <button (click)="abrirCrear()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Nuevo traslado
        </button>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (traslados.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay traslados registrados</p>
      } @else {
        <div class="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50/80 text-gray-500 text-[11px] uppercase tracking-wide">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Ítem</th>
                <th class="px-4 py-3 text-left font-semibold">Origen</th>
                <th class="px-4 py-3 text-left font-semibold">Destino</th>
                <th class="px-4 py-3 text-left font-semibold">Justificación</th>
                <th class="px-4 py-3 text-left font-semibold">Estado</th>
                <th class="px-4 py-3 text-left font-semibold">Fecha</th>
                <th class="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (t of traslados; track t.id_traslado) {
                <tr class="hover:bg-gray-50/80 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ t.item?.codigo_sku ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreSitio(t.id_sitio_origen) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreSitio(t.id_sitio_destino) }}</td>
                  <td class="px-4 py-3 text-gray-500 max-w-[200px] truncate">{{ t.justificacion ?? '—' }}</td>
                  <td class="px-4 py-3"><app-status-badge [value]="t.estado" /></td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ t.fecha_solicitud | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-2">
                      <button (click)="verDetalle(t)"
                        class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400 transition-colors">
                        Ver
                      </button>
                      @if (t.estado === 'PENDIENTE' && (puedeAprobar || puedeRechazar) && !esSolicitantePropio(t) && esResponsableDelSitio(t)) {
                        @if (puedeAprobar) {
                          <button (click)="aprobar(t)"
                            class="px-3 py-1.5 rounded-full text-xs font-semibold border border-green-200 text-green-600 bg-white hover:bg-green-50 transition-colors">
                            Aprobar
                          </button>
                        }
                        @if (puedeRechazar) {
                          <button (click)="abrirRechazar(t)"
                            class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-red-400 hover:text-red-600 transition-colors">
                            Rechazar
                          </button>
                        }
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          </div>
        </div>
      }
    </div>

    @if (detalleAbierto && detalle) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="detalleAbierto = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Detalle del traslado</h2>
            <button (click)="detalleAbierto = false" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <dl class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Ítem</dt><dd class="text-gray-800 font-medium text-right">{{ detalle.item?.producto?.nombre ?? detalle.item?.codigo_sku ?? '—' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">SKU / Placa</dt><dd class="text-gray-800 font-mono text-right">{{ detalle.item?.placa_sena || detalle.item?.codigo_sku || '—' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Origen</dt><dd class="text-gray-800 text-right">{{ nombreSitio(detalle.id_sitio_origen) }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Destino</dt><dd class="text-gray-800 text-right">{{ nombreSitio(detalle.id_sitio_destino) }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Estado</dt><dd class="text-gray-800 text-right">{{ detalle.estado }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Justificación</dt><dd class="text-gray-800 text-right">{{ detalle.justificacion || '—' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Fecha solicitud</dt><dd class="text-gray-800 text-right">{{ detalle.fecha_solicitud | date: 'medium' }}</dd></div>
            @if (detalle.fecha_resolucion) {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">Fecha resolución</dt><dd class="text-gray-800 text-right">{{ detalle.fecha_resolucion | date: 'medium' }}</dd></div>
            }
            @if (detalle.observacion_resolucion) {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">Observación</dt><dd class="text-gray-800 text-right">{{ detalle.observacion_resolucion }}</dd></div>
            }
          </dl>
          <div class="flex justify-end mt-6">
            <button (click)="detalleAbierto = false" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cerrar</button>
          </div>
        </div>
      </div>
    }

    @if (rechazarOpen && trasladoARechazar) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="rechazarOpen = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-800">Rechazar traslado</h2>
            <button (click)="rechazarOpen = false" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <p class="text-sm text-gray-500 mb-3">
            {{ trasladoARechazar.item?.producto?.nombre ?? trasladoARechazar.item?.codigo_sku ?? 'Ítem' }} →
            {{ nombreSitio(trasladoARechazar.id_sitio_destino) }}
          </p>
          <label class="block text-xs font-medium text-gray-600 mb-1">Motivo (opcional)</label>
          <textarea [(ngModel)]="motivoRechazo" rows="3" placeholder="¿Por qué se rechaza este traslado?"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"></textarea>
          <div class="flex justify-end gap-2 mt-6">
            <button (click)="rechazarOpen = false" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="confirmarRechazar()"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg transition-colors" style="background-color: #DC2626">
              Rechazar traslado
            </button>
          </div>
        </div>
      </div>
    }

    @if (crearOpen) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarCrear()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Nuevo traslado</h2>
            <button (click)="cerrarCrear()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Placa SENA del ítem</label>
              <div class="flex gap-2">
                <input type="text" [(ngModel)]="placaBuscar" (keydown.enter)="buscarPorPlaca()"
                  placeholder="Ej: PS-2024-001" [disabled]="buscando"
                  class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                <button (click)="buscarPorPlaca()" [disabled]="!placaBuscar.trim() || buscando"
                  class="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
                  style="background-color: #39A900">
                  {{ buscando ? 'Buscando...' : 'Buscar' }}
                </button>
              </div>
              @if (errorBusqueda) {
                <p class="text-red-500 text-xs mt-1.5">{{ errorBusqueda }}</p>
              }
            </div>

            @if (itemEncontrado) {
              <div class="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-xs space-y-1.5">
                <p class="text-green-700 font-medium uppercase tracking-wide text-[11px]">Ítem encontrado</p>
                <div class="grid grid-cols-2 gap-x-3 gap-y-1">
                  <div>
                    <p class="text-gray-500">Producto</p>
                    <p class="font-semibold text-gray-800">{{ itemEncontrado.item.producto?.nombre ?? '—' }}</p>
                  </div>
                  <div>
                    <p class="text-gray-500">SKU / Placa</p>
                    <p class="font-mono font-semibold text-gray-800">{{ itemEncontrado.item.placa_sena || itemEncontrado.item.codigo_sku }}</p>
                  </div>
                  <div>
                    <p class="text-gray-500">Estado</p>
                    <p class="font-semibold" [class.text-green-700]="itemEncontrado.item.estado === 'DISPONIBLE'" [class.text-amber-700]="itemEncontrado.item.estado !== 'DISPONIBLE'">
                      {{ itemEncontrado.item.estado }}
                    </p>
                  </div>
                  <div>
                    <p class="text-gray-500">Ubicación actual (origen)</p>
                    <p class="font-semibold text-gray-800">{{ sitioOrigen?.nombre ?? 'Sin ubicación' }}</p>
                  </div>
                  @if (sitioOrigen?.id_responsable) {
                    <div class="col-span-2">
                      <p class="text-gray-500">Responsable (recibirá notificación)</p>
                      <p class="font-semibold text-gray-800">{{ nombreResponsableOrigen() }}</p>
                    </div>
                  }
                </div>
                @if (itemEncontrado.item.estado !== 'DISPONIBLE') {
                  <p class="mt-1.5 rounded-md bg-amber-100 text-amber-800 px-2 py-1">
                    Este ítem no está DISPONIBLE ({{ itemEncontrado.item.estado }}) — el traslado igual queda registrado como pendiente.
                  </p>
                }
                @if (itemEncontrado.novedad_activa) {
                  <p class="mt-1.5 rounded-md bg-red-100 text-red-700 px-2 py-1">
                    Tiene una novedad activa ({{ itemEncontrado.novedad_activa.tipo }}).
                  </p>
                }
              </div>

              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Destino</label>
                <app-ss [options]="opcionesDestino()" placeholder="— Selecciona —" [(ngModel)]="idSitioDestino"></app-ss>
              </div>

              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Justificación (opcional)</label>
                <input type="text" [(ngModel)]="justificacion"
                  placeholder="Motivo del traslado..."
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
              </div>
            }
          </div>

          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button (click)="cerrarCrear()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardarTraslado()" [disabled]="saving || !itemEncontrado || !idSitioDestino"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ saving ? 'Guardando...' : 'Solicitar traslado' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MaterialesTrasladosComponent implements OnInit {
  traslados: Traslado[] = [];
  items: Item[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  /** "Ver detalles" (Fase 9). */
  detalleAbierto = false;
  detalle: Traslado | null = null;

  /** Diálogo de rechazo — reemplaza el window.prompt() nativo por el modal estándar de la app. */
  rechazarOpen = false;
  trasladoARechazar: Traslado | null = null;
  motivoRechazo = '';

  /** Flujo de creación por placa SENA (Fase 6). */
  crearOpen = false;
  placaBuscar = '';
  buscando = false;
  errorBusqueda: string | null = null;
  itemEncontrado: { item: Item; prestamo_activo: any; asignacion_activa: any; novedad_activa: any } | null = null;
  sitioOrigen: Sitio | undefined;
  idSitioDestino: string | null = null;
  justificacion = '';

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
  ) {}

  /**
   * Aprobar/Rechazar gateados por servicio (`materiales.traslados.aprobar`
   * / `.rechazar`), no por cargo — antes un solo `esAdmin` (cargo puro)
   * mostraba ambos botones juntos sin mirar el permiso. Ver plan "Ronda 3".
   */
  get puedeAprobar(): boolean {
    return this.auth.tieneServicio('materiales.traslados.aprobar');
  }
  get puedeRechazar(): boolean {
    return this.auth.tieneServicio('materiales.traslados.rechazar');
  }

  /** Nunca puede aprobar/rechazar su propio traslado — mismo bloqueo que aplica el backend. */
  esSolicitantePropio(t: Traslado): boolean {
    return t.id_usuario_solicita === this.auth.user()?.id;
  }

  /**
   * Admin: siempre puede. Si no, autorizado solo si es responsable del sitio
   * origen o del sitio destino; si ninguno de los dos sitios tiene
   * responsable asignado, cualquiera con el servicio puede actuar — replica
   * `TrasladosService.assertPuedeResolver` (que sí tiene bypass total de
   * admin, a diferencia de lo que decía este comentario antes).
   */
  esResponsableDelSitio(t: Traslado): boolean {
    if (this.auth.isAdmin()) return true;
    const uid = this.auth.user()?.id;
    const responsableOrigen = t.sitio_origen?.id_responsable;
    const responsableDestino = t.sitio_destino?.id_responsable;
    if (!responsableOrigen && !responsableDestino) return true;
    return responsableOrigen === uid || responsableDestino === uid;
  }

  ngOnInit(): void {
    this.cargar();
  }

  nombreSitio(id: string): string {
    return this.sitios.find((s) => s.id_sitio === id)?.nombre ?? '—';
  }

  verDetalle(t: Traslado): void {
    this.detalle = t;
    this.detalleAbierto = true;
  }

  /** El responsable del sitio origen solo se conoce por su id (`idUsuario`) — sin catálogo de nombres cargado acá, se muestra tal cual. */
  nombreResponsableOrigen(): string {
    return this.sitioOrigen?.id_responsable ?? '—';
  }

  /** Todos los sitios salvo el de origen actual del ítem. */
  destinosDisponibles(): Sitio[] {
    return this.sitios.filter((s) => s.id_sitio !== this.sitioOrigen?.id_sitio);
  }

  opcionesDestino(): { value: string; label: string }[] {
    return this.destinosDisponibles().map((s) => ({ value: s.id_sitio, label: `${s.nombre} (${s.tipo})` }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // M9 — solo `listarTraslados()` es crítico; una secundaria con 403
      // (excepción personal) no debe tumbar la tabla entera.
      const [traslados, items, sitios] = await Promise.all([
        this.api.listarTraslados(),
        this.api.listarItems().catch(() => [] as Item[]),
        this.api.listarSitios().catch(() => [] as Sitio[]),
      ]);
      this.traslados = traslados;
      this.items = items;
      this.sitios = sitios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los traslados.');
    } finally {
      this.loading = false;
    }
  }

  abrirCrear(): void {
    this.placaBuscar = '';
    this.buscando = false;
    this.errorBusqueda = null;
    this.itemEncontrado = null;
    this.sitioOrigen = undefined;
    this.idSitioDestino = null;
    this.justificacion = '';
    this.error = null;
    this.crearOpen = true;
  }

  cerrarCrear(): void {
    this.crearOpen = false;
  }

  async buscarPorPlaca(): Promise<void> {
    const placa = this.placaBuscar.trim();
    if (!placa) return;
    this.buscando = true;
    this.errorBusqueda = null;
    this.itemEncontrado = null;
    this.sitioOrigen = undefined;
    this.idSitioDestino = null;
    try {
      const detalle = await this.api.buscarItemPorPlaca(placa);
      if (!detalle) {
        this.errorBusqueda = `No se encontró ningún ítem con la placa "${placa}".`;
        return;
      }
      this.itemEncontrado = detalle;
      this.sitioOrigen = detalle.item.id_sitio
        ? this.sitios.find((s) => s.id_sitio === detalle.item.id_sitio)
        : undefined;
      if (!detalle.item.id_sitio) {
        this.errorBusqueda = 'Este ítem no tiene una ubicación asignada actualmente, no se puede trasladar.';
        this.itemEncontrado = null;
      }
    } catch (e: any) {
      this.errorBusqueda = e?.error?.message ?? `No se encontró ningún ítem con la placa "${placa}".`;
    } finally {
      this.buscando = false;
    }
  }

  async guardarTraslado(): Promise<void> {
    if (!this.itemEncontrado || !this.idSitioDestino) return;
    this.saving = true;
    this.error = null;
    try {
      await this.api.crearTraslado({
        id_item: this.itemEncontrado.item.id_item,
        id_sitio_destino: this.idSitioDestino,
        justificacion: this.justificacion.trim() || undefined,
      });
      this.toast.ok('Traslado solicitado');
      this.crearOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear el traslado.';
    } finally {
      this.saving = false;
    }
  }

  async aprobar(t: Traslado): Promise<void> {
    try {
      await this.api.aprobarTraslado(t.id_traslado);
      this.toast.ok('Traslado aprobado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo aprobar el traslado.');
    }
  }

  abrirRechazar(t: Traslado): void {
    this.trasladoARechazar = t;
    this.motivoRechazo = '';
    this.rechazarOpen = true;
  }

  async confirmarRechazar(): Promise<void> {
    if (!this.trasladoARechazar) return;
    try {
      await this.api.rechazarTraslado(this.trasladoARechazar.id_traslado, this.motivoRechazo.trim() || undefined);
      this.toast.ok('Traslado rechazado');
      this.rechazarOpen = false;
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo rechazar el traslado.');
    }
  }
}
