import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MaterialesLiveService } from '../../../core/services/realtime/materiales-live.service';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { PermisosService } from '../../../core/services/permisos.service';
import { AuthService } from '../../../core/services/auth.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import { Item, ItemDetalleBusqueda, MaterialesApiService, Sitio, Traslado } from '../../../core/services/materiales/materiales-api.service';

/**
 * Traslados de ítems entre sitios para instructor: crear siempre disponible;
 * aprobar/rechazar solo si tiene la excepción personal de "responsable de
 * bodega" (`PermisosService.tieneServicio('materiales.traslados.<accion>')`)
 * Y además es realmente el responsable del sitio origen o destino (o no hay
 * ninguno asignado a ninguno de los dos) y no pidió el traslado él mismo —
 * mismo criterio que la versión admin, ver Ronda 4 Fase 5 (gate corregido
 * tras el rework de `TrasladosService.assertPuedeResolver`). El backend
 * igual re-valida todo.
 *
 * Crear (Ronda 4, Fase 6): búsqueda por placa SENA, mismo flujo que la
 * versión admin — ver docblock ahí para el detalle de por qué se resuelve
 * el sitio de origen cruzando contra `sitios` en vez de venir embebido.
 */
@Component({
  selector: 'app-instructor-materiales-traslados',
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
                  <td class="px-4 py-3 text-gray-700">{{ t.item?.producto?.nombre ?? t.item?.placa_sena ?? t.item?.codigo_sku ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreSitioTraslado(t.sitio_origen, t.id_sitio_origen) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreSitioTraslado(t.sitio_destino, t.id_sitio_destino) }}</td>
                  <td class="px-4 py-3 text-gray-500 max-w-[200px] truncate">{{ t.justificacion ?? '—' }}</td>
                  <td class="px-4 py-3"><app-status-badge [value]="t.estado" /></td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ t.fecha_solicitud | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-2">
                      <button (click)="verDetalle(t)"
                        class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400 transition-colors">
                        Ver
                      </button>
                      @if (t.estado === 'PENDIENTE' && !esSolicitantePropio(t) && esResponsableDelSitio(t)) {
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
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Origen</dt><dd class="text-gray-800 text-right">{{ nombreSitioTraslado(detalle.sitio_origen, detalle.id_sitio_origen) }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Encargado del origen</dt><dd class="text-gray-800 text-right">{{ detalle.origen_responsable_nombre ?? detalle.sitio_origen?.id_responsable ?? 'sin responsable' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Destino</dt><dd class="text-gray-800 text-right">{{ nombreSitioTraslado(detalle.sitio_destino, detalle.id_sitio_destino) }}</dd></div>
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
            {{ nombreSitioTraslado(trasladoARechazar.sitio_destino, trasladoARechazar.id_sitio_destino) }}
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
              <label class="block text-xs font-medium text-gray-600 mb-1">Agregar ítems al traslado</label>
              @if (opcionesItems().length) {
                <app-ss [options]="opcionesItems()" placeholder="Buscá por placa SENA, SKU o producto..."
                  [(ngModel)]="itemSeleccionadoId" (ngModelChange)="onItemSeleccionado($event)"></app-ss>
                <p class="text-[11px] text-gray-400 mt-1">Elegí uno o varios ítems devolutivos con placa SENA. Todos van a la misma bodega de destino.</p>
              } @else {
                <p class="text-xs text-gray-400">No hay ítems devolutivos con placa SENA. Asigná las placas desde el módulo de Ítems.</p>
              }
              @if (buscando) { <p class="text-gray-400 text-xs mt-1.5">Buscando...</p> }
              @if (errorBusqueda) { <p class="text-red-500 text-xs mt-1.5">{{ errorBusqueda }}</p> }
            </div>

            @if (itemsSeleccionados.length) {
              <ul class="divide-y divide-gray-100 border border-gray-100 rounded-lg text-xs">
                @for (it of itemsSeleccionados; track it.item.id_item) {
                  <li class="px-3 py-2"
                    [class.bg-red-50]="fallidos[it.item.id_item]"
                    [class.border-l-2]="fallidos[it.item.id_item]"
                    [class.border-red-400]="fallidos[it.item.id_item]">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <span class="font-semibold text-gray-800">{{ it.item.producto?.nombre ?? 'Ítem' }}</span>
                        <span class="font-mono text-gray-500"> · {{ it.item.placa_sena || it.item.codigo_sku }}</span>
                        <span class="block text-gray-500">Sale de: <span class="text-gray-800 font-medium">{{ it.ubicacion?.nombre ?? '—' }}</span> · estado {{ it.item.estado }}</span>
                        <span class="block text-gray-500">Encargado: <span class="text-gray-800">{{ it.ubicacion?.responsable_nombre ?? it.ubicacion?.id_responsable ?? 'sin responsable' }}</span></span>
                        @if (it.novedad_activa) {
                          <span class="block text-amber-600">Tiene una novedad activa ({{ it.novedad_activa.tipo }})</span>
                        }
                        @if (fallidos[it.item.id_item]) {
                          <span class="block text-red-600 font-medium">⚠ {{ fallidos[it.item.id_item] }}</span>
                        }
                      </div>
                      <button type="button" (click)="quitarItem(it.item.id_item)"
                        class="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 text-base leading-none">×</button>
                    </div>
                  </li>
                }
              </ul>

              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Destino</label>
                <app-ss [options]="opcionesDestino()" placeholder="— Selecciona —" [(ngModel)]="idSitioDestino"></app-ss>
              </div>

              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Justificación <span class="text-red-500">*</span></label>
                <textarea [(ngModel)]="justificacion" rows="2"
                  placeholder="¿Por qué y para qué se traslada? (mín. 10 caracteres)"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"></textarea>
                @if (justificacion.trim().length > 0 && justificacion.trim().length < 10) {
                  <p class="text-[11px] text-amber-600 mt-0.5">Faltan {{ 10 - justificacion.trim().length }} caracteres.</p>
                }
              </div>
            }
          </div>

          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button (click)="cerrarCrear()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardarTraslado()"
              [disabled]="saving || itemsSeleccionados.length === 0 || !idSitioDestino || justificacion.trim().length < 10"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ saving ? 'Guardando...' : (itemsSeleccionados.length > 1 ? 'Solicitar ' + itemsSeleccionados.length + ' traslados' : 'Solicitar traslado') }}
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

  /** Diálogo de rechazo — reemplaza el window.prompt() nativo por el modal estándar de la app. */
  rechazarOpen = false;
  trasladoARechazar: Traslado | null = null;
  motivoRechazo = '';

  /** Flujo de creación — traslado masivo (varios ítems, mismo destino). */
  crearOpen = false;
  placaBuscar = '';
  buscando = false;
  errorBusqueda: string | null = null;
  /** Ítems agregados al traslado. */
  itemsSeleccionados: ItemDetalleBusqueda[] = [];
  /** `id_item → motivo` de los que el backend rechazó (respuesta 400 del masivo). */
  fallidos: Record<string, string> = {};
  /** Ítem elegido en el selector con búsqueda (por placa/SKU). */
  itemSeleccionadoId: string | null = null;
  idSitioDestino: string | null = null;
  justificacion = '';

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private permisos: PermisosService,
    private auth: AuthService,
    private live: MaterialesLiveService,
    private destroyRef: DestroyRef,
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
   * "Origen manda con válvula de escape" — replica `TrasladosService.assertPuedeResolver`:
   * admin siempre; si el ORIGEN tiene responsable, solo él (salvo que sea
   * además el solicitante → ahí también el responsable del DESTINO); si el
   * origen no tiene responsable, el del destino, o cualquiera si tampoco hay.
   */
  esResponsableDelSitio(t: Traslado): boolean {
    if (this.auth.isAdmin()) return true;
    const uid = this.auth.user()?.id;
    const respOrigen = t.sitio_origen?.id_responsable ?? null;
    const respDestino = t.sitio_destino?.id_responsable ?? null;
    if (respOrigen) {
      const origenEsSolicitante = respOrigen === t.id_usuario_solicita;
      return respOrigen === uid || (origenEsSolicitante && respDestino === uid);
    }
    return !respDestino || respDestino === uid;
  }

  ngOnInit(): void {
    this.permisos.cargar();
    this.cargar();
    this.live.eventos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargar());
  }

  /** Nombre del sitio: primero el que viene embebido en el traslado (siempre
   *  presente, no depende del scope), luego la lista local, luego "—". */
  nombreSitioTraslado(sitio: Sitio | undefined, id: string): string {
    return sitio?.nombre ?? this.sitios.find((s) => s.id_sitio === id)?.nombre ?? '—';
  }

  verDetalle(t: Traslado): void {
    this.detalle = t;
    this.detalleAbierto = true;
  }

  /**
   * Opciones del selector: SOLO ítems devolutivos CON placa SENA — un traslado
   * cambia la ubicación física de una unidad identificable. Un consumible
   * (lote, ej. "pollo") se solicita para consumo, no se traslada; y un
   * devolutivo sin placa todavía no es rastreable como unidad.
   */
  opcionesItems(): { value: string; label: string }[] {
    return this.items
      .filter((i) => !!i.placa_sena && i.producto?.tipo_material !== 'CONSUMO' && i.producto?.tipo_material !== 'PERECEDERO')
      .map((i) => ({
        value: i.placa_sena!,
        label: `${i.placa_sena} · ${i.producto?.nombre ?? 'Ítem'} (${i.estado})`,
      }));
  }

  onItemSeleccionado(placa: string | null): void {
    if (!placa) return;
    this.placaBuscar = placa;
    this.buscarPorPlaca();
  }

  quitarItem(idItem: string): void {
    this.itemsSeleccionados = this.itemsSeleccionados.filter((i) => i.item.id_item !== idItem);
    delete this.fallidos[idItem];
  }

  /** Bodegas de origen de todos los ítems ya agregados (el destino no puede ser una de ellas). */
  private get idsSitioOrigen(): Set<string> {
    return new Set(
      this.itemsSeleccionados.map((i) => i.ubicacion?.id_sitio).filter((x): x is string => !!x),
    );
  }

  destinosDisponibles(): Sitio[] {
    return this.sitios.filter((s) => !this.idsSitioOrigen.has(s.id_sitio));
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
    this.itemSeleccionadoId = null;
    this.buscando = false;
    this.errorBusqueda = null;
    this.itemsSeleccionados = [];
    this.fallidos = {};
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
    try {
      const detalle = await this.api.buscarItemPorPlaca(placa);
      if (!detalle) {
        this.errorBusqueda = `No se encontró ningún ítem con la placa "${placa}".`;
        return;
      }
      if (!detalle.ubicacion) {
        this.errorBusqueda = 'Este ítem no tiene una ubicación asignada actualmente, no se puede trasladar.';
        return;
      }
      if (this.itemsSeleccionados.some((i) => i.item.id_item === detalle.item.id_item)) {
        this.errorBusqueda = 'Ese ítem ya está en la lista.';
        return;
      }
      this.itemsSeleccionados = [...this.itemsSeleccionados, detalle];
      this.itemSeleccionadoId = null;
    } catch (e: any) {
      this.errorBusqueda = e?.error?.message ?? `No se encontró ningún ítem con la placa "${placa}".`;
    } finally {
      this.buscando = false;
    }
  }

  async guardarTraslado(): Promise<void> {
    if (this.itemsSeleccionados.length === 0 || !this.idSitioDestino) return;
    if (this.justificacion.trim().length < 10) {
      this.error = 'La justificación es obligatoria (mín. 10 caracteres).';
      return;
    }
    this.saving = true;
    this.error = null;
    this.fallidos = {};
    try {
      await this.api.crearTraslado({
        id_items: this.itemsSeleccionados.map((i) => i.item.id_item),
        id_sitio_destino: this.idSitioDestino,
        justificacion: this.justificacion.trim(),
      });
      this.toast.ok(this.itemsSeleccionados.length > 1 ? 'Traslados solicitados' : 'Traslado solicitado');
      this.crearOpen = false;
      await this.cargar();
    } catch (e: any) {
      const fallidos = e?.error?.data?.fallidos as { id_item: string; motivo: string }[] | undefined;
      if (fallidos?.length) {
        this.fallidos = Object.fromEntries(fallidos.map((f) => [f.id_item, f.motivo]));
        this.error = e?.error?.message ?? 'Algunos ítems no se pueden trasladar. Revisá los marcados en rojo y quitalos.';
      } else {
        this.error = e?.error?.message ?? 'No se pudo crear el traslado.';
      }
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
