import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { CreateDevolucionDto, Devolucion, EstadoDevolucion, Item, MaterialesApiService, Solicitud } from '../../../core/services/materiales/materiales-api.service';

const ESTADOS_DEVOLUCION: { value: EstadoDevolucion; label: string; desc: string }[] = [
  { value: 'BUENO', label: 'Bueno', desc: 'Sin daños visibles' },
  { value: 'REGULAR', label: 'Regular', desc: 'Desgaste normal de uso' },
  { value: 'DAÑADO', label: 'Dañado', desc: 'Requiere reparación' },
  { value: 'PERDIDO', label: 'Perdido', desc: 'No fue devuelto' },
];

/**
 * Registro de devoluciones de material prestado. A diferencia de
 * Novedades/Traslados/Solicitudes, este submódulo NO tiene máquina de
 * estados propia en el backend (solo `GET`/`POST` — ver
 * devoluciones.controller.ts): es un log de "esto se devolvió, en tal
 * estado", no un flujo con aprobación. Por eso no hay botones de fila,
 * solo alta + listado.
 *
 * Crear (Ronda 4, Fase 6): búsqueda por placa SENA en vez de dos `<select>`
 * planos — mismo flujo que SGM (`devoluciones.component.ts` en
 * frontend-proyecto). La solicitud a devolver se auto-detecta cruzando
 * `item.id_producto` contra las solicitudes ENTREGADA ya cargadas (sin
 * filtrar por usuario — a diferencia de SGM, acá es una pantalla de
 * administración/bodega, no de autoservicio del solicitante). El backend
 * no valida el estado del ítem ni la relación producto↔solicitud (ver
 * `DevolucionesService.crearDevolucion` — solo persiste), así que ambos
 * chequeos son de UX, igual que ya documentaba el componente anterior.
 *
 * Chequeos (Ronda 4, Fase 8): tras registrar la devolución, se crea además
 * un `Chequeo` (`{id_solicitud}`, marcador de auditoría de "se inspeccionó
 * esto" — el estado físico real ya vive en `Devolucion.estado` de arriba,
 * mismo criterio que SGM, que tampoco le manda un estado al chequeo). Si
 * falla, no revierte ni bloquea la devolución ya registrada — mismo
 * criterio de "no interrumpir" que ya usa el backend en sus notificaciones.
 */
@Component({
  selector: 'app-materiales-devoluciones',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Devoluciones</h1>
        <button (click)="abrirCrear()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Registrar devolución
        </button>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (devoluciones.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay devoluciones registradas</p>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gray-100">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Producto</th>
                <th class="px-4 py-3 text-left font-medium">Ítem</th>
                <th class="px-4 py-3 text-left font-medium">Estado</th>
                <th class="px-4 py-3 text-left font-medium">Observación</th>
                <th class="px-4 py-3 text-left font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (d of devoluciones; track d.id_devolucion) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ nombreProducto(d) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreItem(d.id_item) }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs"
                      [class.bg-green-100]="d.estado === 'BUENO'" [class.text-green-700]="d.estado === 'BUENO'"
                      [class.bg-amber-100]="d.estado === 'REGULAR'" [class.text-amber-700]="d.estado === 'REGULAR'"
                      [class.bg-red-100]="d.estado === 'DAÑADO' || d.estado === 'PERDIDO'" [class.text-red-700]="d.estado === 'DAÑADO' || d.estado === 'PERDIDO'">
                      {{ d.estado }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-500 max-w-[220px] truncate">{{ d.observacion ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ d.fecha | date: 'short' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (crearOpen) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarCrear()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Registrar devolución</h2>
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
                    <p class="text-gray-500">Estado actual</p>
                    <p class="font-semibold" [class.text-amber-700]="itemEncontrado.item.estado === 'PRESTADO'" [class.text-gray-700]="itemEncontrado.item.estado !== 'PRESTADO'">
                      {{ itemEncontrado.item.estado }}
                    </p>
                  </div>
                </div>
                @if (itemEncontrado.item.estado !== 'PRESTADO') {
                  <p class="mt-1.5 rounded-md bg-amber-100 text-amber-800 px-2 py-1">
                    Este ítem no figura como PRESTADO — revisá que corresponda antes de registrar la devolución.
                  </p>
                }
              </div>

              @if (solicitudesMatcheadas.length === 0) {
                <p class="rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-xs px-3 py-2">
                  No se encontró una solicitud ENTREGADA pendiente de devolución para este producto.
                </p>
              } @else if (solicitudesMatcheadas.length === 1) {
                <div class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
                  <p class="text-blue-700 font-medium uppercase tracking-wide text-[10px] mb-0.5">Solicitud asociada</p>
                  <p class="text-gray-800 font-semibold">Cant. {{ solicitudesMatcheadas[0].cantidad }} — {{ solicitudesMatcheadas[0].fecha | date: 'short' }}</p>
                </div>
              } @else {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Seleccionar solicitud</label>
                  <select [(ngModel)]="idSolicitudSeleccionada"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                    <option [ngValue]="null">— Selecciona —</option>
                    @for (s of solicitudesMatcheadas; track s.id_solicitud) {
                      <option [value]="s.id_solicitud">Cant. {{ s.cantidad }} — {{ s.fecha | date: 'short' }}</option>
                    }
                  </select>
                </div>
              }

              @if (solicitudParaDevolucion()) {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Estado del ítem al devolver</label>
                  <div class="grid grid-cols-2 gap-2">
                    @for (op of estadosDevolucion; track op.value) {
                      <button type="button" (click)="estadoSeleccionado = op.value"
                        class="text-left rounded-lg border-2 px-3 py-2 transition-colors"
                        [class.border-gray-200]="estadoSeleccionado !== op.value"
                        [class.border-[#39A900]]="estadoSeleccionado === op.value"
                        [class.bg-[#39A900]/5]="estadoSeleccionado === op.value">
                        <p class="text-xs font-semibold text-gray-800">{{ op.label }}</p>
                        <p class="text-[11px] text-gray-500">{{ op.desc }}</p>
                      </button>
                    }
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Observación (opcional)</label>
                  <input type="text" [(ngModel)]="observacion"
                    placeholder="Estado físico, daños, detalles del chequeo..."
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                </div>
              }
            }
          </div>

          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button (click)="cerrarCrear()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardarDevolucion()" [disabled]="saving || !solicitudParaDevolucion() || !estadoSeleccionado"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ saving ? 'Guardando...' : 'Registrar devolución' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MaterialesDevolucionesComponent implements OnInit {
  devoluciones: Devolucion[] = [];
  solicitudes: Solicitud[] = [];
  items: Item[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  readonly estadosDevolucion = ESTADOS_DEVOLUCION;

  /** Flujo de creación por placa SENA (Fase 6). */
  crearOpen = false;
  placaBuscar = '';
  buscando = false;
  errorBusqueda: string | null = null;
  itemEncontrado: { item: Item; prestamo_activo: any; asignacion_activa: any; novedad_activa: any } | null = null;
  solicitudesMatcheadas: Solicitud[] = [];
  idSolicitudSeleccionada: string | null = null;
  estadoSeleccionado: EstadoDevolucion | null = null;
  observacion = '';

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
  ) {}

  /**
   * Solo se puede registrar devolución de solicitudes ya entregadas Y que
   * todavía no tengan una devolución registrada — `devolucion` tiene un
   * `UNIQUE(id_solicitud)` real en la base (una sola devolución por
   * solicitud), y a diferencia de SGM, acá crear una devolución nunca
   * cambia el estado de la solicitud (se queda en ENTREGADA para siempre),
   * así que sin este filtro una solicitud ya devuelta seguía apareciendo
   * como candidata y el intento de repetirla chocaba con un 400 genérico
   * ("Error al crear la devolución") sin ninguna pista de la causa real.
   */
  get solicitudesEntregadas(): Solicitud[] {
    const yaDevueltas = new Set(this.devoluciones.map((d) => d.id_solicitud));
    return this.solicitudes.filter((s) => s.estado === 'ENTREGADA' && !yaDevueltas.has(s.id_solicitud));
  }

  ngOnInit(): void {
    this.cargar();
  }

  nombreItem(id: string): string {
    const item = this.items.find((i) => i.id_item === id);
    return item ? `${item.codigo_sku}${item.placa_sena ? ' — ' + item.placa_sena : ''}` : '—';
  }

  /**
   * `GET /devoluciones` solo trae la relación `solicitud` a un nivel (sin
   * su `producto` anidado), así que el nombre se resuelve contra la lista
   * ya cargada por `listarSolicitudes()`, que sí lo trae completo.
   */
  nombreProducto(d: Devolucion): string {
    return this.solicitudes.find((s) => s.id_solicitud === d.id_solicitud)?.producto?.nombre ?? '—';
  }

  /** Única coincidencia → auto-seleccionada; varias → la que el usuario eligió en el `<select>`. */
  solicitudParaDevolucion(): Solicitud | null {
    if (this.solicitudesMatcheadas.length === 1) return this.solicitudesMatcheadas[0];
    if (this.idSolicitudSeleccionada) {
      return this.solicitudesMatcheadas.find((s) => s.id_solicitud === this.idSolicitudSeleccionada) ?? null;
    }
    return null;
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [devoluciones, solicitudes, items] = await Promise.all([
        this.api.listarDevoluciones(),
        this.api.listarSolicitudes(),
        this.api.listarItems(),
      ]);
      this.devoluciones = devoluciones;
      this.solicitudes = solicitudes;
      this.items = items;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las devoluciones.');
    } finally {
      this.loading = false;
    }
  }

  abrirCrear(): void {
    if (this.solicitudesEntregadas.length === 0) {
      this.toast.warn('Nada que devolver', 'No hay solicitudes en estado ENTREGADA pendientes de devolución.');
      return;
    }
    this.placaBuscar = '';
    this.buscando = false;
    this.errorBusqueda = null;
    this.itemEncontrado = null;
    this.solicitudesMatcheadas = [];
    this.idSolicitudSeleccionada = null;
    this.estadoSeleccionado = null;
    this.observacion = '';
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
    this.solicitudesMatcheadas = [];
    this.idSolicitudSeleccionada = null;
    this.estadoSeleccionado = null;
    try {
      const detalle = await this.api.buscarItemPorPlaca(placa);
      if (!detalle) {
        this.errorBusqueda = `No se encontró ningún ítem con la placa "${placa}".`;
        return;
      }
      this.itemEncontrado = detalle;
      this.solicitudesMatcheadas = this.solicitudesEntregadas.filter(
        (s) => s.id_producto === detalle.item.id_producto,
      );
    } catch (e: any) {
      this.errorBusqueda = e?.error?.message ?? `No se encontró ningún ítem con la placa "${placa}".`;
    } finally {
      this.buscando = false;
    }
  }

  async guardarDevolucion(): Promise<void> {
    const sol = this.solicitudParaDevolucion();
    if (!sol || !this.itemEncontrado || !this.estadoSeleccionado) return;
    this.saving = true;
    this.error = null;
    try {
      const dto: CreateDevolucionDto = {
        id_solicitud: sol.id_solicitud,
        id_item: this.itemEncontrado.item.id_item,
        estado: this.estadoSeleccionado,
        observacion: this.observacion.trim() || undefined,
      };
      await this.api.crearDevolucion(dto);
      try {
        await this.api.crearChequeo({ id_solicitud: sol.id_solicitud });
      } catch {
        // No interrumpir — la devolución ya quedó registrada, mismo criterio que el backend.
      }
      this.toast.ok('Devolución registrada');
      this.crearOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo registrar la devolución.';
    } finally {
      this.saving = false;
    }
  }
}
