import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { PermisosService } from '../../../core/services/permisos.service';
import { AuthService } from '../../../core/services/auth.service';
import { Item, MaterialesApiService, Sitio, Traslado } from '../../../core/services/materiales/materiales-api.service';

/**
 * Traslados de ítems entre sitios para instructor: crear siempre disponible;
 * aprobar/rechazar solo si tiene la excepción personal de "responsable de
 * bodega" (`PermisosService.tieneServicio('materiales.traslados.<accion>')`)
 * Y además es realmente el responsable del sitio origen (o no hay ninguno
 * asignado) y no pidió el traslado él mismo — mismo criterio que la versión
 * admin, ver Ronda 4 Fase 5. El backend igual re-valida todo.
 *
 * Crear (Ronda 4, Fase 6): búsqueda por placa SENA, mismo flujo que la
 * versión admin — ver docblock ahí para el detalle de por qué se resuelve
 * el sitio de origen cruzando contra `sitios` en vez de venir embebido.
 */
@Component({
  selector: 'app-instructor-materiales-traslados',
  standalone: true,
  imports: [FormsModule, DatePipe],
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
        <div class="overflow-x-auto rounded-xl border border-gray-100">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Ítem</th>
                <th class="px-4 py-3 text-left font-medium">Origen</th>
                <th class="px-4 py-3 text-left font-medium">Destino</th>
                <th class="px-4 py-3 text-left font-medium">Justificación</th>
                <th class="px-4 py-3 text-left font-medium">Estado</th>
                <th class="px-4 py-3 text-left font-medium">Fecha</th>
                <th class="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (t of traslados; track t.id_traslado) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ t.item?.codigo_sku ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreSitio(t.id_sitio_origen) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreSitio(t.id_sitio_destino) }}</td>
                  <td class="px-4 py-3 text-gray-500 max-w-[200px] truncate">{{ t.justificacion ?? '—' }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs"
                      [class.bg-amber-100]="t.estado === 'PENDIENTE'" [class.text-amber-700]="t.estado === 'PENDIENTE'"
                      [class.bg-green-100]="t.estado === 'APROBADO'" [class.text-green-700]="t.estado === 'APROBADO'"
                      [class.bg-red-100]="t.estado === 'RECHAZADO'" [class.text-red-700]="t.estado === 'RECHAZADO'">
                      {{ t.estado }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ t.fecha_solicitud | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-1.5">
                      <button (click)="verDetalle(t)"
                        class="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors">
                        Ver
                      </button>
                      @if (t.estado === 'PENDIENTE' && !esSolicitantePropio(t) && esResponsableDelSitio(t)) {
                        @if (puedeAprobar) {
                          <button (click)="aprobar(t)"
                            class="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                            Aprobar
                          </button>
                        }
                        @if (puedeRechazar) {
                          <button (click)="rechazar(t)"
                            class="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
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
                <select [(ngModel)]="idSitioDestino"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                  <option [ngValue]="null">— Selecciona —</option>
                  @for (s of destinosDisponibles(); track s.id_sitio) {
                    <option [value]="s.id_sitio">{{ s.nombre }} ({{ s.tipo }})</option>
                  }
                </select>
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
export class InstructorMaterialesTrasladosComponent implements OnInit {
  traslados: Traslado[] = [];
  items: Item[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  /** "Ver detalles" (Fase 9). */
  detalleAbierto = false;
  detalle: Traslado | null = null;

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
    private permisos: PermisosService,
    private auth: AuthService,
  ) {}

  get puedeAprobar(): boolean {
    return this.permisos.tieneServicio('materiales.traslados.aprobar');
  }
  get puedeRechazar(): boolean {
    return this.permisos.tieneServicio('materiales.traslados.rechazar');
  }

  /** Nunca puede aprobar/rechazar su propio traslado — mismo bloqueo que aplica el backend. */
  esSolicitantePropio(t: Traslado): boolean {
    return t.id_usuario_solicita === this.auth.user()?.id;
  }

  /**
   * Sin responsable asignado en el sitio origen: cualquiera con el servicio
   * puede actuar. Con responsable asignado: solo esa persona exacta —
   * replica `TrasladosService.aprobarTraslado`/`rechazarTraslado`, sin
   * excepción para admin.
   */
  esResponsableDelSitio(t: Traslado): boolean {
    const responsable = t.sitio_origen?.id_responsable;
    return !responsable || responsable === this.auth.user()?.id;
  }

  ngOnInit(): void {
    this.permisos.cargar();
    this.cargar();
  }

  nombreSitio(id: string): string {
    return this.sitios.find((s) => s.id_sitio === id)?.nombre ?? '—';
  }

  verDetalle(t: Traslado): void {
    this.detalle = t;
    this.detalleAbierto = true;
  }

  nombreResponsableOrigen(): string {
    return this.sitioOrigen?.id_responsable ?? '—';
  }

  destinosDisponibles(): Sitio[] {
    return this.sitios.filter((s) => s.id_sitio !== this.sitioOrigen?.id_sitio);
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [traslados, items, sitios] = await Promise.all([
        this.api.listarTraslados(),
        this.api.listarItems(),
        this.api.listarSitios(),
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

  async rechazar(t: Traslado): Promise<void> {
    const observacion = window.prompt('Motivo del rechazo (opcional):');
    if (observacion === null) return;
    try {
      await this.api.rechazarTraslado(t.id_traslado, observacion || undefined);
      this.toast.ok('Traslado rechazado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo rechazar el traslado.');
    }
  }
}
