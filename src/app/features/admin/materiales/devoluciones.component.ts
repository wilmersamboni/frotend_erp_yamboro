import { Component, DestroyRef, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MaterialesLiveService } from '../../../core/services/realtime/materiales-live.service';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import {
  CreateDevolucionConsumibleDto,
  CreateDevolucionDto,
  Devolucion,
  EstadoDevolucion,
  Item,
  ItemPendienteDevolucion,
  LineaConsumiblePendiente,
  Lote,
  MaterialesApiService,
  Solicitud,
  Chequeo,
  ItemChequeo
} from '../../../core/services/materiales/materiales-api.service';

const ESTADOS_DEVOLUCION: { value: EstadoDevolucion; label: string; desc: string }[] = [
  { value: 'BUENO', label: 'Bueno', desc: 'Sin daños visibles' },
  { value: 'REGULAR', label: 'Regular', desc: 'Desgaste normal de uso' },
  { value: 'DAÑADO', label: 'Dañado', desc: 'Requiere reparación' },
  { value: 'PERDIDO', label: 'Perdido', desc: 'No fue devuelto' },
];

interface FilaDevolucion extends ItemPendienteDevolucion {
  estadoDev: EstadoDevolucion;
  /** M9 — ¿esta unidad volvió? Destildar = queda pendiente (devolución parcial). */
  volvio: boolean;
}

/**
 * Registro de devoluciones de material prestado (M10a — devolución por unidad).
 *
 * Un préstamo entrega N unidades; esta pantalla cierra la devolución de TODAS
 * las unidades pendientes de una sola vez: se elige un "estado general" que se
 * aplica a todas, y solo se toca fila por fila la placa de las 1-2 unidades que
 * vuelven en otro estado. El backend crea una fila `devolucion` por unidad,
 * restaura el stock (BUENO/REGULAR → DISPONIBLE, DAÑADO/PERDIDO → ese estado),
 * cierra la solicitud (→ DEVUELTA) y crea el `Chequeo` de auditoría cuando ya
 * volvieron todas las unidades. No hay botones de fila: es alta + listado.
 */
@Component({
  selector: 'app-materiales-devoluciones',
  standalone: true,
  imports: [FormsModule, DatePipe, StatusBadgeComponent, SearchableSelectComponent],
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
        <div class="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          <!-- Toolbar: búsqueda + filtro de estado + filas por página -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <div class="relative flex-1 max-w-sm">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </div>
              <input type="text" [(ngModel)]="filtroTexto" (ngModelChange)="page = 0"
                placeholder="Buscar por producto o ítem..."
                class="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900] focus:bg-white transition-all text-gray-900 placeholder:text-gray-400" />
              @if (filtroTexto) {
                <button (click)="filtroTexto = ''; page = 0" class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              }
            </div>
            <div class="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</span>

              <!-- Dropdown personalizado para estado -->
              <div class="relative">
                <button
                  type="button"
                  (click)="estadoDropdownOpen.update(v => !v)"
                  class="flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-transparent focus:outline-none cursor-pointer">
                  <span>{{ estadoActualLabel() }}</span>
                  <svg class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200" [class.rotate-180]="estadoDropdownOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                @if (estadoDropdownOpen()) {
                  <!-- Backdrop para cerrar al hacer clic afuera -->
                  <div class="fixed inset-0 z-10" (click)="estadoDropdownOpen.set(false)"></div>

                  <!-- Menú flotante -->
                  <div class="absolute left-0 top-full mt-2 z-20 w-44 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div class="p-1 space-y-0.5 max-h-64 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <button
                        type="button"
                        (click)="seleccionarEstado('')"
                        class="w-full px-3 py-1.5 text-sm text-left rounded-lg transition-colors font-medium"
                        [class.bg-green-50]="filtroEstado === ''"
                        [class.text-green-700]="filtroEstado === ''"
                        [class.text-gray-600]="filtroEstado !== ''"
                        [class.hover:bg-gray-50]="filtroEstado !== ''">
                        Todos
                      </button>
                      @for (e of estadosDevolucion; track e.value) {
                        <button
                          type="button"
                          (click)="seleccionarEstado(e.value)"
                          class="w-full px-3 py-1.5 text-sm text-left rounded-lg transition-colors font-medium"
                          [class.bg-green-50]="filtroEstado === e.value"
                          [class.text-green-700]="filtroEstado === e.value"
                          [class.text-gray-600]="filtroEstado !== e.value"
                          [class.hover:bg-gray-50]="filtroEstado !== e.value">
                          {{ e.label }}
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
            <!-- Filas por página -->
            <div class="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
              <span class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filas</span>
              <div class="relative">
                <button
                  type="button"
                  (click)="pageSizeDropdownOpen.update(v => !v)"
                  class="flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-transparent focus:outline-none cursor-pointer">
                  <span>{{ pageSize() }}</span>
                  <svg class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200" [class.rotate-180]="pageSizeDropdownOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                @if (pageSizeDropdownOpen()) {
                  <div class="fixed inset-0 z-10" (click)="pageSizeDropdownOpen.set(false)"></div>

                  <div class="absolute left-0 top-full mt-2 z-20 w-20 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div class="p-1 space-y-0.5">
                      @for (size of [10, 20, 50, 100]; track size) {
                        <button
                          type="button"
                          (click)="seleccionarPageSize(size)"
                          class="w-full px-3 py-1.5 text-sm text-center rounded-lg transition-colors font-medium"
                          [class.bg-green-50]="pageSize() === size"
                          [class.text-green-700]="pageSize() === size"
                          [class.text-gray-600]="pageSize() !== size"
                          [class.hover:bg-gray-50]="pageSize() !== size">
                          {{ size }}
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>

          @if (devolucionesFiltradas.length === 0) {
            <p class="text-center text-gray-400 text-sm py-10">Sin resultados para estos filtros</p>
          } @else {
          <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50/80 text-gray-500 text-[11px] uppercase tracking-wide">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Producto</th>
                <th class="px-4 py-3 text-left font-semibold">Ítem</th>
                <th class="px-4 py-3 text-left font-semibold">Estado</th>
                <th class="px-4 py-3 text-left font-semibold">Observación</th>
                <th class="px-4 py-3 text-left font-semibold">Fecha</th>
                <th class="px-4 py-3 text-left font-semibold">Chequeo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (d of devolucionesPaginadas; track d.id_devolucion) {
                <tr class="hover:bg-gray-50/80 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ nombreProducto(d) }}</td>
                  <td class="px-4 py-3 text-gray-700">
                    @if (d.id_item) {
                      {{ nombreItem(d.id_item) }}
                    } @else {
                      <span class="text-gray-500">Sobrante: {{ d.cantidad }} {{ unidadDeLote(d) }}</span>
                    }
                  </td>
                  <td class="px-4 py-3"><app-status-badge [value]="d.estado" /></td>
                  <td class="px-4 py-3 text-gray-500 max-w-[220px] truncate">{{ d.observacion ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ d.fecha | date: 'short' }}</td>
                  <td class="px-4 py-3 ">
                  @if (!d.id_item) {
                    <span class="text-gray-300 text-xs">—</span>
                  } @else if(itemChequeoDe(d);as ic){
                    <app-status-badge [value]= "ic.estado ? 'BUENO' : 'DAÑADO'" [labelOverride]="ic.estado ? 'pasa' : 'No pasa'" />

                  }@else {
                    <span class= "text-gray-400 text-xs"> Pendiente</span>
                  }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          </div>

          @if (devolucionesFiltradas.length > pageSize()) {
            <div class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
              <span class="text-sm text-gray-500">
                Mostrando <strong class="text-gray-800">{{ devolucionesPaginadas.length }}</strong>
                de <strong class="text-gray-800">{{ devolucionesFiltradas.length }}</strong> registros
              </span>
              <div class="flex items-center gap-2">
                <button (click)="page = page - 1" [disabled]="page === 0"
                  class="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-[#39A900] hover:text-white hover:border-[#39A900] disabled:opacity-30 disabled:pointer-events-none transition-all">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <span class="px-4 py-1.5 text-sm font-semibold text-[#39A900] bg-[#39A900]/10 rounded-lg border border-[#39A900]/20">{{ page + 1 }} / {{ totalPaginas }}</span>
                <button (click)="page = page + 1" [disabled]="page + 1 >= totalPaginas"
                  class="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-[#39A900] hover:text-white hover:border-[#39A900] disabled:opacity-30 disabled:pointer-events-none transition-all">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </button>
              </div>
            </div>
          }
          }
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

          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Préstamo a devolver</label>
              <app-ss [options]="opcionesSolicitud()" placeholder="— Selecciona —"
                [(ngModel)]="idSolicitud" (ngModelChange)="onSolicitudChange()"></app-ss>
            </div>

            @if (idSolicitud) {
              @if (cargandoPendientes) {
                <p class="text-gray-400 text-xs">Cargando unidades…</p>
              } @else if (filas.length === 0) {
                <p class="rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-xs px-3 py-2">
                  No quedan unidades pendientes de devolución para este préstamo.
                </p>
              } @else {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Estado de las unidades que volvieron</label>
                  <select [(ngModel)]="estadoGeneral" (ngModelChange)="aplicarATodas()"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                    @for (op of estadosDevolucion; track op.value) {
                      <option [ngValue]="op.value">{{ op.label }} — {{ op.desc }}</option>
                    }
                  </select>
                  <p class="text-[11px] text-gray-400 mt-1">
                    Destildá las unidades que <b>todavía no volvieron</b>: el préstamo queda abierto hasta registrarlas.
                    Cambiá el estado fila por fila solo si alguna vuelve distinto.
                  </p>
                </div>

                <div class="rounded-lg border border-gray-100 divide-y divide-gray-50 max-h-56 overflow-y-auto">
                  @for (f of filas; track f.id_item) {
                    <div class="flex items-center gap-3 px-3 py-2" [class.opacity-40]="!f.volvio">
                      <input type="checkbox" [(ngModel)]="f.volvio"
                        class="w-4 h-4 accent-[#39A900] flex-none" title="¿Volvió esta unidad?" />
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-gray-800 truncate">{{ f.producto_nombre || 'Unidad' }}</p>
                        <p class="font-mono text-[11px] text-gray-400 truncate">
                          {{ f.placa_sena || f.codigo_sku || '' }}{{ f.placa_sena && f.codigo_sku ? ' · ' + f.codigo_sku : '' }}
                        </p>
                      </div>
                      <select [(ngModel)]="f.estadoDev" [disabled]="!f.volvio"
                        class="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900] disabled:opacity-50"
                        [class.border-red-300]="f.estadoDev === 'DAÑADO' || f.estadoDev === 'PERDIDO'"
                        [class.border-amber-300]="f.estadoDev === 'REGULAR'">
                        @for (op of estadosDevolucion; track op.value) {
                          <option [ngValue]="op.value">{{ op.label }}</option>
                        }
                      </select>
                    </div>
                  }
                </div>
                @if (marcadas.length && marcadas.length < filas.length) {
                  <p class="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                    Devolución parcial: {{ marcadas.length }} de {{ filas.length }}. El préstamo sigue ENTREGADO hasta que vuelvan todas.
                  </p>
                }

                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Observación general (opcional)</label>
                  <input type="text" [(ngModel)]="observacion"
                    placeholder="Estado físico, daños, detalles del chequeo..."
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                </div>
              }

              <!-- Sobrante de consumible/perecedero (2026-09-11): un consumible
                   mayormente NO vuelve, pero a veces sí un sobrante parcial (ej.
                   de 250kg de abono prestados, 1-2kg). Independiente de la
                   grilla por unidad de arriba: no cierra ni exige nada de la
                   solicitud, cada línea se registra por separado. -->
              @if (cargandoConsumibles) {
                <p class="text-gray-400 text-xs">Revisando sobrantes…</p>
              } @else if (lineasConsumibles.length > 0) {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Sobrante a devolver</label>
                  <p class="text-[11px] text-gray-400 mb-2">
                    Un consumible/perecedero normalmente NO vuelve. Si sobró algo sin usar, registralo acá.
                  </p>
                  <div class="space-y-2">
                    @for (l of lineasConsumibles; track l.id_lote) {
                      <div class="rounded-lg border border-gray-100 p-2.5">
                        <div class="flex items-center justify-between mb-1.5 gap-2">
                          <p class="text-xs font-semibold text-gray-800 truncate">
                            {{ l.producto_nombre || 'Lote' }}{{ l.codigo_lote ? ' · ' + l.codigo_lote : '' }}
                          </p>
                          <span class="text-[11px] text-gray-400 flex-none">{{ l.cantidad_pendiente }} {{ l.unidad_medida || '' }} pendiente(s)</span>
                        </div>
                        <div class="flex gap-2">
                          <input type="number" min="1" [max]="l.cantidad_pendiente"
                            [(ngModel)]="formConsumible[l.id_lote].cantidad"
                            placeholder="Cantidad"
                            class="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                          <input type="text" [(ngModel)]="formConsumible[l.id_lote].observacion"
                            placeholder="Observación (opcional)"
                            class="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                          <button type="button" (click)="registrarSobrante(l)"
                            [disabled]="guardandoConsumible[l.id_lote] || !formConsumible[l.id_lote].cantidad"
                            class="px-3 py-1.5 text-white text-xs font-medium rounded-lg disabled:opacity-60 transition-colors flex-none"
                            style="background-color: #39A900">
                            {{ guardandoConsumible[l.id_lote] ? 'Guardando…' : 'Registrar' }}
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            }
          </div>

          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button (click)="cerrarCrear()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardarDevolucion()" [disabled]="saving || !idSolicitud || filas.length === 0"
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
  lotes: Lote[] = [];
  chequeo: Chequeo[]=[];
  item_chequeo: ItemChequeo[]=[]
  loading = false;
  saving = false;
  error: string | null = null;

  readonly estadosDevolucion = ESTADOS_DEVOLUCION;

  // ── Filtros y paginación de la tabla (client-side) ──────────────────
  filtroTexto = '';
  filtroEstado: EstadoDevolucion | '' = '';
  pageSize = signal(20);
  pageSizeDropdownOpen = signal(false);
  estadoDropdownOpen = signal(false);
  page = 0;

  seleccionarEstado(valor: EstadoDevolucion | ''): void {
    this.filtroEstado = valor;
    this.page = 0;
    this.estadoDropdownOpen.set(false);
  }

  estadoActualLabel(): string {
    if (!this.filtroEstado) return 'Todos';
    return this.estadosDevolucion.find((e) => e.value === this.filtroEstado)?.label ?? this.filtroEstado;
  }

  seleccionarPageSize(size: number): void {
    this.pageSize.set(size);
    this.page = 0;
    this.pageSizeDropdownOpen.set(false);
  }

  get devolucionesFiltradas(): Devolucion[] {
    const q = this.filtroTexto.trim().toLowerCase();
    return this.devoluciones.filter((d) => {
      if (this.filtroEstado && d.estado !== this.filtroEstado) return false;
      if (!q) return true;
      return this.nombreProducto(d).toLowerCase().includes(q) || this.nombreItem(d.id_item).toLowerCase().includes(q);
    });
  }
  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.devolucionesFiltradas.length / this.pageSize()));
  }
  get devolucionesPaginadas(): Devolucion[] {
    const start = this.page * this.pageSize();
    return this.devolucionesFiltradas.slice(start, start + this.pageSize());
  }

  crearOpen = false;
  idSolicitud: string | null = null;
  cargandoPendientes = false;
  filas: FilaDevolucion[] = [];
  estadoGeneral: EstadoDevolucion = 'BUENO';
  observacion = '';

  // ── Sobrante de consumible/perecedero (2026-09-11) — ver docblock del componente ──
  lineasConsumibles: LineaConsumiblePendiente[] = [];
  cargandoConsumibles = false;
  formConsumible: Record<string, { cantidad: number | null; observacion: string }> = {};
  guardandoConsumible: Record<string, boolean> = {};

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private live: MaterialesLiveService,
    private destroyRef: DestroyRef,
  ) {}

  /**
   * Préstamos en estado ENTREGADA. El backend cierra la solicitud (→ DEVUELTA)
   * cuando ya volvieron todas las unidades, así que basta con el estado; si
   * quedan filas `devolucion` pero la solicitud sigue ENTREGADA (parciales /
   * datos viejos), el endpoint de pendientes devuelve solo lo que falta.
   */
  get solicitudesEntregadas(): Solicitud[] {
    return this.solicitudes.filter((s) => s.estado === 'ENTREGADA');
  }

  opcionesSolicitud(): { value: string; label: string }[] {
    return this.solicitudesEntregadas.map((s) => ({
      value: s.id_solicitud,
      label: `${s.producto?.nombre ?? 'Material'} — Cant. ${s.cantidad} — ${new Date(s.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}`,
    }));
  }

  ngOnInit(): void {
    this.cargar();
    this.live.eventos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargar());
  }

  nombreItem(id: string | null): string {
    if (!id) return '—';
    const item = this.items.find((i) => i.id_item === id);
    return item ? `${item.codigo_sku}${item.placa_sena ? ' — ' + item.placa_sena : ''}` : '—';
  }

  /** Unidad del lote de una devolución de sobrante — para la tabla de historial. */
  unidadDeLote(d: Devolucion): string {
    if (!d.id_lote) return '';
    const lote = this.lotes.find((l) => l.id_lote === d.id_lote);
    return lote?.producto?.unidad_medida ?? lote?.unidad_medida ?? '';
  }

  nombreProducto(d: Devolucion): string {
    // El producto real de la unidad/lote devuelto — una solicitud multi-línea
    // mezcla varios, así que no sirve el `producto` de la solicitud.
    const item = this.items.find((i) => i.id_item === d.id_item);
    const lote = d.id_lote ? this.lotes.find((l) => l.id_lote === d.id_lote) : undefined;
    return (
      item?.producto?.nombre ??
      lote?.producto?.nombre ??
      this.solicitudes.find((s) => s.id_solicitud === d.id_solicitud)?.producto?.nombre ??
      '—'
    );
  }

  itemChequeoDe(d: Devolucion): ItemChequeo | undefined{
    const chq = this.chequeo.find((c)=>c.id_solicitud === d.id_solicitud);
    if(!chq){
      return undefined;
      
    }
    return this.item_chequeo.find((ic)=> ic.id_chequeo === chq.id_chequeo && ic.id_item === d.id_item)
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // M9 — solo `listarDevoluciones()` es crítico; si una secundaria da 403
      // (excepción personal) no debe tumbar la tabla entera.
      const [devoluciones, solicitudes, items, lotes, chequeo, item_chequeo] = await Promise.all([
        this.api.listarDevoluciones(),
        this.api.listarSolicitudes().catch(() => [] as Solicitud[]),
        this.api.listarItems().catch(() => [] as Item[]),
        this.api.listarLotes().catch(() => [] as Lote[]),
        this.api.listarChequeos().catch(()=>[] as Chequeo[]),
        this.api.listarItemsChequeo().catch(()=> [] as ItemChequeo[]),
      ]);
      this.devoluciones = devoluciones;
      this.solicitudes = solicitudes;
      this.items = items;
      this.lotes = lotes;
      this.chequeo = chequeo;
      this.item_chequeo = item_chequeo;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las devoluciones.');
    } finally {
      this.loading = false;
    }
  }

  abrirCrear(): void {
    if (this.solicitudesEntregadas.length === 0) {
      this.toast.warn('Nada que devolver', 'No hay préstamos en estado ENTREGADA pendientes de devolución.');
      return;
    }
    this.idSolicitud = null;
    this.filas = [];
    this.estadoGeneral = 'BUENO';
    this.observacion = '';
    this.lineasConsumibles = [];
    this.formConsumible = {};
    this.guardandoConsumible = {};
    this.error = null;
    this.crearOpen = true;
  }

  cerrarCrear(): void {
    this.crearOpen = false;
  }

  async onSolicitudChange(): Promise<void> {
    this.filas = [];
    this.lineasConsumibles = [];
    this.error = null;
    if (!this.idSolicitud) return;
    this.cargandoPendientes = true;
    this.cargandoConsumibles = true;
    try {
      const [pendientes, consumibles] = await Promise.all([
        this.api.itemsPendientesDevolucion(this.idSolicitud),
        this.api.lineasConsumiblesPendientes(this.idSolicitud).catch(() => [] as LineaConsumiblePendiente[]),
      ]);
      this.filas = pendientes.map((p) => ({ ...p, estadoDev: this.estadoGeneral, volvio: true }));
      this.lineasConsumibles = consumibles;
      for (const l of consumibles) {
        this.formConsumible[l.id_lote] ??= { cantidad: null, observacion: '' };
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudieron cargar las unidades del préstamo.';
    } finally {
      this.cargandoPendientes = false;
      this.cargandoConsumibles = false;
    }
  }

  /** Registra el sobrante de UNA línea de lote — independiente del resto del
   *  formulario: no cierra ni exige nada de la solicitud. */
  async registrarSobrante(linea: LineaConsumiblePendiente): Promise<void> {
    if (!this.idSolicitud) return;
    const f = this.formConsumible[linea.id_lote];
    const cantidad = Number(f?.cantidad) || 0;
    if (cantidad <= 0) return;
    if (cantidad > linea.cantidad_pendiente) {
      this.toast.warn('Cantidad inválida', `Como máximo podés devolver ${linea.cantidad_pendiente} ${linea.unidad_medida ?? ''}.`);
      return;
    }
    this.guardandoConsumible[linea.id_lote] = true;
    try {
      const dto: CreateDevolucionConsumibleDto = {
        id_solicitud: this.idSolicitud,
        id_lote: linea.id_lote,
        cantidad,
        observacion: f?.observacion?.trim() || undefined,
      };
      await this.api.registrarDevolucionConsumible(dto);
      this.toast.ok(`Se registraron ${cantidad} ${linea.unidad_medida ?? ''} devueltos de "${linea.producto_nombre ?? 'material'}"`);
      delete this.formConsumible[linea.id_lote];
      await this.onSolicitudChange();
      await this.cargar();
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo registrar el sobrante.');
    } finally {
      this.guardandoConsumible[linea.id_lote] = false;
    }
  }

  aplicarATodas(): void {
    for (const f of this.filas) if (f.volvio) f.estadoDev = this.estadoGeneral;
  }

  /** Unidades tildadas como "volvió" — usado por el template y el submit. */
  get marcadas(): any[] {
    return this.filas.filter((f) => f.volvio);
  }

  async guardarDevolucion(): Promise<void> {
    if (!this.idSolicitud || this.filas.length === 0) return;
    const marcadas = this.marcadas;
    if (marcadas.length === 0) {
      this.error = 'Marcá al menos una unidad que haya vuelto.';
      return;
    }
    const parcial = marcadas.length < this.filas.length;
    this.saving = true;
    this.error = null;
    try {
      const dto: CreateDevolucionDto = parcial
        ? {
            // M9 — devolución parcial: solo las unidades marcadas, cada una con su estado.
            id_solicitud: this.idSolicitud,
            observacion: this.observacion.trim() || undefined,
            items: marcadas.map((f) => ({ id_item: f.id_item, estado: f.estadoDev })),
          }
        : {
            // Cierre total: estado general + solo las excepciones en `items`.
            id_solicitud: this.idSolicitud,
            estado_general: this.estadoGeneral,
            observacion: this.observacion.trim() || undefined,
            items: (() => {
              const exc = marcadas
                .filter((f) => f.estadoDev !== this.estadoGeneral)
                .map((f) => ({ id_item: f.id_item, estado: f.estadoDev }));
              return exc.length > 0 ? exc : undefined;
            })(),
          };
      await this.api.crearDevolucion(dto);
      this.toast.ok(
        parcial
          ? `Devolución parcial registrada — quedan ${this.filas.length - marcadas.length} unidad(es)`
          : 'Devolución registrada',
      );
      this.crearOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo registrar la devolución.';
    } finally {
      this.saving = false;
    }
  }
}
