import { Component, DestroyRef, OnInit, signal, inject, effect, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MaterialesLiveService } from '../data-access/materiales-live.service';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { PermisosService } from '../../../core/services/permisos.service';
import { AuthService } from '../../../core/services/auth.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { DateInputComponent } from '../../../shared/components/date-input.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import { EntregarSolicitudModalComponent } from '../ui/entregar-solicitud-modal.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton.component';
import { TuiDayCache } from '../../../shared/utils/tui-day.util';
import type { TuiDay } from '@taiga-ui/cdk';
import { MaterialesApiService, Item, Lote, Producto, Sitio, Solicitud, EstadoSolicitud, ResumenExistencias, SeleccionLineaEntregaInput } from '../data-access/materiales-api.service';
import { ApiService, CursoLiderado } from '../../../core/services/api.service';
import { NetworkStatusService } from '../../../core/offline/network-status.service';
import { SyncQueueService } from '../../../core/offline/sync-queue.service';
import { OfflineSnapshotService } from '../../../core/offline/offline-snapshot.service';
import {
  guardarListaSolicitudes,
  leerListaSolicitudes,
  lineasDevolutivasDeSolicitud,
  prepararSnapshotEntregaOffline,
  prepararTodasEntregaOffline,
} from '../ui/solicitud-entrega-offline.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AlertComponent } from '../../../shared/ui/alert.component';

/** Línea del modal "Nueva solicitud" — `p:<id>` producto devolutivo, `l:<id>` lote consumible. */
interface LineaForm {
  ref: string;
  cantidad: number;
}

/**
 * Solicitudes de préstamo para instructor: crear siempre disponible.
 * Aprobar/rechazar/entregar/cancelar exigen la excepción personal de
 * "responsable de bodega" (`PermisosService.tieneServicio('materiales.
 * solicitudes.<accion>')`) Y ser realmente responsable del sitio del
 * producto (el admin bypasea siempre — regla A+C, ver docblock de la
 * versión admin — pero esta pantalla es de instructor, así que en la
 * práctica `auth.isAdmin()` nunca es true acá) y no ser quien pidió la
 * solicitud — ver Ronda 4 Fase 5. Confirmar recepción exige ser el propio
 * solicitante. El backend igual re-valida cada paso.
 * El backend ya filtra `GET /solicitudes` según quién pregunta (dueño vs.
 * responsable vs. admin), así que la lista no se filtra client-side.
 *
 * Crear (Ronda 4, Fase 7): flujo de 2 pasos Bodega → Producto, con fecha de
 * devolución solo si aplica — ver docblock de la versión admin.
 */
@Component({
  selector: 'app-instructor-materiales-solicitudes',
  standalone: true,
  imports: [AlertComponent, EmptyStateComponent, FormsModule, DatePipe, StatusBadgeComponent, DateInputComponent, SearchableSelectComponent, EntregarSolicitudModalComponent, LoadingSkeletonComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Solicitudes</h1>
        <button (click)="nuevo()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Nueva solicitud
        </button>
      </div>

      @if (bodegasInactivas().length > 0) {
        <app-alert class="mb-4" variante="advertencia" [titulo]="bodegasInactivas().length === 1 ? 'Bodega inactiva' : 'Bodegas inactivas'">
          <strong>{{ bodegasInactivas().map(s => s.nombre).join(', ') }}</strong>
          — no se pueden gestionar sus productos, ítems, lotes, solicitudes ni traslados mientras estén así.
        </app-alert>
      }

      @if (datosGuardadosDe) {
        <app-alert class="mb-4" variante="advertencia" titulo="Sin conexión">
          Mostrando las solicitudes guardadas a las <strong>{{ datosGuardadosDe | date: 'shortTime' }}</strong>.
          Las entregas que marques se enviarán cuando vuelva la señal.
        </app-alert>
      }

      @if (red.alcanzable() && solicitudesPreparables().length > 0) {
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
          <span class="text-gray-600">¿Vas a entregar en un lugar sin señal? Descarga las placas de tus {{ solicitudesPreparables().length }} solicitudes aprobadas.</span>
          <button (click)="prepararTodasOffline()" [disabled]="preparandoTodas"
            class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400 disabled:opacity-50 transition-colors">
            {{ preparandoTodas ? 'Preparando…' : 'Preparar todas offline' }}
          </button>
        </div>
      }

      @if (loading) {
        <app-loading-skeleton variant="table" [rows]="6" [columns]="6" [showToolbar]="false" label="Cargando solicitudes" />
      } @else if (solicitudes.length === 0) {
        <app-empty-state titulo="No hay solicitudes registradas" />
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
                placeholder="Buscar por producto o solicitante..."
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
                  <span>{{ filtroEstado || 'Todos' }}</span>
                  <svg class="w-3.5 h-3.5 text-gray-400 transition-transform duration-200" [class.rotate-180]="estadoDropdownOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                @if (estadoDropdownOpen()) {
                  <!-- Backdrop para cerrar al hacer clic afuera -->
                  <div class="fixed inset-0 z-10" (click)="estadoDropdownOpen.set(false)"></div>

                  <!-- Menú flotante -->
                  <div class="absolute left-0 top-full mt-2 z-20 w-40 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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
                      @for (e of estadosSolicitud; track e) {
                        <button
                          type="button"
                          (click)="seleccionarEstado(e)"
                          class="w-full px-3 py-1.5 text-sm text-left rounded-lg transition-colors font-medium"
                          [class.bg-green-50]="filtroEstado === e"
                          [class.text-green-700]="filtroEstado === e"
                          [class.text-gray-600]="filtroEstado !== e"
                          [class.hover:bg-gray-50]="filtroEstado !== e">
                          {{ e }}
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

          @if (solicitudesFiltradas.length === 0) {
            <app-empty-state titulo="Sin resultados para estos filtros" variante="busqueda" />
          } @else {
          <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50/80 text-gray-500 text-[11px] uppercase tracking-wide">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Producto</th>
                <th class="px-4 py-3 text-left font-semibold">Solicitó</th>
                <th class="px-4 py-3 text-left font-semibold">Cantidad</th>
                <th class="px-4 py-3 text-left font-semibold">Disponible</th>
                <th class="px-4 py-3 text-left font-semibold">Observación</th>
                <th class="px-4 py-3 text-left font-semibold">Estado</th>
                <th class="px-4 py-3 text-left font-semibold">Fecha</th>
                <th class="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (s of solicitudesPaginadas; track s.id_solicitud) {
                <tr class="hover:bg-gray-50/80 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ productosResumen(s) }}</td>
                  <td class="px-4 py-3 text-gray-600">{{ s.usuario_nombre || '—' }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ s.cantidad }}</td>
                  <td class="px-4 py-3">
                    @if ((s.estado === 'PENDIENTE' || s.estado === 'APROBADA') && stockDe(s); as st) {
                      <span class="text-xs font-medium"
                        [class.text-red-600]="st.disponibles < s.cantidad"
                        [class.text-green-700]="st.disponibles >= s.cantidad">
                        {{ st.disponibles }} / {{ st.total }}
                      </span>
                      @if (st.disponibles < s.cantidad) {
                        <span class="block text-[11px] text-red-500">faltan {{ s.cantidad - st.disponibles }}</span>
                      }
                    } @else {
                      <span class="text-xs text-gray-300">—</span>
                    }
                  </td>
                  <td class="px-4 py-3 text-gray-500 max-w-[220px] truncate">{{ s.observacion ?? '—' }}</td>
                  <td class="px-4 py-3"><app-status-badge [value]="s.estado" /></td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ s.fecha | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    @if (bodegaInactiva(s) && (s.estado === 'PENDIENTE' || s.estado === 'APROBADA')) {
                      <div class="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                        ⚠️ Bodega inactiva — {{ s.estado === 'PENDIENTE' ? 'no se puede aprobar' : 'no se puede entregar' }}
                      </div>
                    }
                    <div class="flex flex-wrap justify-end gap-2">
                      <button (click)="verDetalle(s)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400 transition-colors">Ver</button>
                      @if (s.estado === 'PENDIENTE' && puedeAprobar && puedeGestionar(s)) {
                        <button (click)="aprobar(s)" [disabled]="bodegaInactiva(s)"
                          [title]="bodegaInactiva(s) ? 'Bodega inactiva — no se puede aprobar. Rechazá o cancelá en su lugar.' : ''"
                          [style.opacity]="bodegaInactiva(s) ? 0.45 : 1" [style.cursor]="bodegaInactiva(s) ? 'not-allowed' : 'pointer'"
                          [style.backgroundColor]="bodegaInactiva(s) ? '#f3f4f6' : '#fff'" [style.color]="bodegaInactiva(s) ? '#9ca3af' : '#16a34a'" [style.borderColor]="bodegaInactiva(s) ? '#e5e7eb' : '#bbf7d0'"
                          class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors">Aprobar</button>
                      }
                      @if (s.estado === 'PENDIENTE' && puedeRechazar && puedeGestionar(s)) {
                        <button (click)="rechazar(s)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-red-400 hover:text-red-600 transition-colors">Rechazar</button>
                      }
                      @if (s.estado === 'APROBADA' && entregaPendiente(s)) {
                            <span class="px-3 py-1.5 rounded-full text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-700" title="La entrega quedó guardada en este dispositivo y se enviará cuando haya señal">Entrega pendiente de enviar</span>
                          }
                          @if (s.estado === 'APROBADA' && !entregaPendiente(s) && puedeEntregar && puedeGestionar(s)) {
                        <button (click)="abrirEntregar(s)" [disabled]="bodegaInactiva(s)"
                          [title]="bodegaInactiva(s) ? 'Bodega inactiva — no se puede entregar. Cancelá la solicitud en su lugar.' : ''"
                          [style.opacity]="bodegaInactiva(s) ? 0.45 : 1" [style.cursor]="bodegaInactiva(s) ? 'not-allowed' : 'pointer'"
                          [style.backgroundColor]="bodegaInactiva(s) ? '#f3f4f6' : '#fff'" [style.color]="bodegaInactiva(s) ? '#9ca3af' : '#2563eb'" [style.borderColor]="bodegaInactiva(s) ? '#e5e7eb' : '#bfdbfe'"
                          class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors">Marcar en entrega</button>
                        @if (red.alcanzable()) {
                          <button (click)="prepararEntregaOffline(s)" title="Descarga las placas disponibles de esta solicitud para poder entregarla sin conexión"
                            class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-500 bg-white hover:border-gray-400 transition-colors">Preparar offline</button>
                        }
                      }
                      @if (s.estado === 'APROBADA' && !entregaPendiente(s) && puedeRechazar && puedeGestionar(s)) {
                        <button (click)="cancelar(s)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400 transition-colors">Cancelar</button>
                      }
                      @if (s.estado === 'EN_ENTREGA' && esSolicitantePropio(s)) {
                        <button (click)="confirmarRecepcion(s)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-green-200 text-green-600 bg-white hover:bg-green-50 transition-colors">Confirmar recepción</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          </div>

          @if (solicitudesFiltradas.length > pageSize()) {
            <div class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/60">
              <span class="text-sm text-gray-500">
                Mostrando <strong class="text-gray-800">{{ solicitudesPaginadas.length }}</strong>
                de <strong class="text-gray-800">{{ solicitudesFiltradas.length }}</strong> registros
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

    @if (modalOpen) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarModal()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Nueva solicitud</h2>
            <button (click)="cerrarModal()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-4">
            @if (fichasLideradas.length > 0) {
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Destino</label>
                <div class="flex gap-2">
                  <button type="button" (click)="tipoDestino = 'personal'"
                    class="flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
                    [class.text-white]="tipoDestino === 'personal'"
                    [class.text-gray-600]="tipoDestino !== 'personal'"
                    [class.border-gray-200]="tipoDestino !== 'personal'"
                    [style.backgroundColor]="tipoDestino === 'personal' ? '#39A900' : '#fff'"
                    [style.borderColor]="tipoDestino === 'personal' ? '#39A900' : null">
                    Para mí
                  </button>
                  <button type="button" (click)="tipoDestino = 'ficha'"
                    class="flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
                    [class.text-white]="tipoDestino === 'ficha'"
                    [class.text-gray-600]="tipoDestino !== 'ficha'"
                    [class.border-gray-200]="tipoDestino !== 'ficha'"
                    [style.backgroundColor]="tipoDestino === 'ficha' ? '#39A900' : '#fff'"
                    [style.borderColor]="tipoDestino === 'ficha' ? '#39A900' : null">
                    Para una ficha (asignación)
                  </button>
                </div>
                @if (tipoDestino === 'ficha') {
                  <div class="mt-2">
                    <app-ss [options]="opcionesFicha" placeholder="— Selecciona la ficha —"
                      [(ngModel)]="idCursoSeleccionado"></app-ss>
                    <p class="text-[11px] text-gray-400 mt-1">Al entregarse, el material queda asignado a esta ficha (no a vos) — se devuelve desde Asignaciones, no desde Devoluciones.</p>
                  </div>
                }
              </div>
            }

            @if (pasoBodega) {
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Bodega</label>
                <app-ss [options]="opcionesSitio" placeholder="— Selecciona una bodega —"
                  [(ngModel)]="idSitioSeleccionado" (ngModelChange)="onSitioChange($event)"></app-ss>
                <p class="text-[11px] text-gray-400 mt-1">Todas las líneas de una solicitud tienen que ser de la misma bodega.</p>
              </div>
            }

            @if (!pasoBodega || idSitioSeleccionado) {
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="block text-xs font-medium text-gray-600">Ítems a solicitar</label>
                  <button type="button" (click)="agregarLinea()"
                    [disabled]="opcionesDisponibles().length === 0"
                    class="text-xs font-medium text-[#39A900] hover:underline disabled:text-gray-300 disabled:no-underline">
                    + Agregar línea
                  </button>
                </div>

                @if (opciones().length === 0) {
                  <p class="text-xs text-gray-400 py-2">Esta bodega no tiene productos ni lotes disponibles.</p>
                }

                <div class="space-y-2">
                  @for (linea of lineas; track $index) {
                    <div class="flex gap-2 items-start">
                      <!-- min-w-0: un flex item con flex-1 no se achica por debajo del
                           ancho de SU contenido a menos que se le fuerce — sin esto, un
                           label largo (nombre + lote + cantidad + unidad) empujaba el
                           input de cantidad fuera del modal (reporte QA 2026-09-11). -->
                      <div class="flex-1 min-w-0">
                        <app-ss [options]="opcionesLinea(linea)" placeholder="— Selecciona producto o lote —"
                          [(ngModel)]="linea.ref" (ngModelChange)="onRefChange(linea)"></app-ss>
                        @if (linea.ref) {
                          <p class="text-[11px] mt-0.5"
                            [class.text-red-500]="disponibleDe(linea) < linea.cantidad"
                            [class.text-gray-400]="disponibleDe(linea) >= linea.cantidad">
                            {{ disponibleDe(linea) }} disponible(s){{ disponibleDe(linea) < linea.cantidad ? ' — cantidad excede el stock' : '' }}
                          </p>
                        }
                      </div>
                      <input type="number" [(ngModel)]="linea.cantidad" min="1"
                        class="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                      <button type="button" (click)="quitarLinea($index)"
                        class="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 text-lg leading-none">×</button>
                    </div>
                  }
                </div>
              </div>

              @if (requiereFechaDevolucion()) {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Fecha de devolución <span class="text-red-500">*</span></label>
                  <app-date-input placeholder="DD/MM/AAAA" [min]="hoyTuiDay"
                    [ngModel]="cacheFechaDevolucion.get(fechaDevolucion)"
                    (ngModelChange)="fechaDevolucion = tuiDayToIso($event)"></app-date-input>
                  <p class="text-[11px] text-gray-400 mt-1">Alguna línea es de un material devolutivo.</p>
                </div>
              }

              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Observación <span class="text-red-500">*</span></label>
                <textarea [(ngModel)]="observacion" rows="2"
                  placeholder="¿Para qué y en qué ambiente se usará el material? (mín. 10 caracteres)"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"></textarea>
                @if (observacion.trim().length > 0 && observacion.trim().length < 10) {
                  <p class="text-[11px] text-amber-600 mt-0.5">Faltan {{ 10 - observacion.trim().length }} caracteres.</p>
                }
              </div>
            }
          </div>

          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button (click)="cerrarModal()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardar()" [disabled]="saving || !puedeGuardar()"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ saving ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (detalleAbierto && detalle) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="detalleAbierto = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Detalle de la solicitud</h2>
            <button (click)="detalleAbierto = false" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <dl class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Estado</dt><dd class="text-gray-800 text-right">{{ detalle.estado }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Destino</dt><dd class="text-gray-800 text-right">{{ detalle.id_curso ? 'Asignación a ficha' : 'Personal' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Solicitó</dt><dd class="text-gray-800 text-right">{{ detalle.usuario_nombre || '—' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Bodega (de dónde sale)</dt><dd class="text-gray-800 text-right">{{ detalle.bodega_nombre || '—' }}</dd></div>
            <div>
              <dt class="text-gray-500 mb-1">Ítems solicitados</dt>
              <dd>
                @if (detalleCargando) {
                  <span class="text-gray-400 text-xs">Cargando líneas...</span>
                } @else if (detalle.lineas?.length) {
                  <ul class="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                    @for (l of detalle.lineas; track l.id_detalle) {
                      <li class="px-3 py-2 flex justify-between gap-3">
                        <span class="text-gray-700">
                          {{ l.producto_nombre ?? l.lote_codigo ?? '—' }}
                          @if (l.id_lote) { <span class="text-[11px] text-gray-400">(lote)</span> }
                        </span>
                        <span class="text-gray-500 text-xs">{{ l.cantidad_entregada }}/{{ l.cantidad }}</span>
                      </li>
                    }
                  </ul>
                } @else {
                  <span class="text-gray-700">{{ detalle.producto?.nombre ?? '—' }} × {{ detalle.cantidad }}</span>
                }
              </dd>
            </div>
            <div><dt class="text-gray-500 mb-1">Observación</dt><dd class="text-gray-800">{{ detalle.observacion || '—' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Fecha</dt><dd class="text-gray-800 text-right">{{ detalle.fecha | date: 'medium' }}</dd></div>
            @if (detalle.fecha_devolucion) {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">Fecha de devolución</dt><dd class="text-gray-800 text-right">{{ detalle.fecha_devolucion | date: 'mediumDate' }}</dd></div>
            }
            @if (detalle.id_usuario_aprueba || detalle.fecha_aprobacion) {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">Aprobó</dt><dd class="text-gray-800 text-right">{{ detalle.usuario_aprueba_nombre || '—' }}<span class="block text-[11px] text-gray-400">{{ detalle.fecha_aprobacion | date: 'short' }}</span></dd></div>
            }
            @if (detalle.id_usuario_entrega || detalle.fecha_entrega) {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">Entregó</dt><dd class="text-gray-800 text-right">{{ detalle.usuario_entrega_nombre || '—' }}<span class="block text-[11px] text-gray-400">{{ detalle.fecha_entrega | date: 'short' }}</span></dd></div>
            }
            @if (detalle.estado === 'RECHAZADA' && detalle.motivo_rechazo) {
              <div class="rounded-lg bg-red-50 border border-red-100 p-3">
                <dt class="text-red-600 font-medium mb-1">Motivo del rechazo</dt>
                <dd class="text-red-700 whitespace-pre-wrap">{{ detalle.motivo_rechazo }}</dd>
              </div>
            }
          </dl>
          <div class="flex justify-end mt-6">
            <button (click)="detalleAbierto = false" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cerrar</button>
          </div>
        </div>
      </div>
    }

    @if (rechazoAbierto && rechazoSolicitud) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarRechazo()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-800">Rechazar solicitud</h2>
            <button (click)="cerrarRechazo()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <p class="text-sm text-gray-500 mb-3">
            Se le informará al solicitante de
            "<span class="font-medium text-gray-700">{{ rechazoSolicitud.producto?.nombre ?? 'este material' }}</span>".
            El motivo es obligatorio.
          </p>
          <textarea [(ngModel)]="motivoRechazo" rows="3" maxlength="500"
            placeholder="Ej: No hay stock disponible para la fecha solicitada."
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30 focus:border-red-400 resize-none"></textarea>
          <div class="text-right text-[11px] text-gray-400 mt-1">{{ motivoRechazo.length }}/500</div>
          <div class="flex justify-end gap-2 mt-4">
            <button (click)="cerrarRechazo()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="confirmarRechazo()" [disabled]="!motivoRechazo.trim() || rechazando"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors bg-red-600 hover:bg-red-700">
              {{ rechazando ? 'Rechazando...' : 'Rechazar' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (aprobarAbierto && aprobarRef) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarAprobar()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-800">Aprobar solicitud</h2>
            <button (click)="cerrarAprobar()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <p class="text-sm text-gray-500 mb-3">
            "<span class="font-medium text-gray-700">{{ aprobarRef.producto?.nombre ?? 'este material' }}</span>"
            × {{ aprobarRef.cantidad }}.
          </p>
          @if (aprobarRequiereFecha(aprobarRef)) {
            <label class="block text-xs font-medium text-gray-600 mb-1">Fecha de devolución</label>
            <app-date-input placeholder="DD/MM/AAAA" [min]="hoyTuiDay"
              [ngModel]="cacheFechaDevAprobar.get(fechaDevAprobar)"
              (ngModelChange)="fechaDevAprobar = tuiDayToIso($event)"></app-date-input>
            <p class="text-[11px] text-gray-400 mt-1">Podés ajustar la fecha que puso el solicitante. Se le avisa si cambia.</p>
          }
          <div class="flex justify-end gap-2 mt-4">
            <button (click)="cerrarAprobar()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="confirmarAprobar()" [disabled]="aprobando"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ aprobando ? 'Aprobando...' : 'Aprobar' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (solicitudAEntregar) {
      <app-entregar-solicitud-modal [abierto]="true" [solicitud]="solicitudAEntregar"
        (cerrado)="cerrarEntregar()" (confirmado)="confirmarEntrega($event)"></app-entregar-solicitud-modal>
    }
  `,
})
export class InstructorMaterialesSolicitudesComponent implements OnInit {
  private readonly confirmDlg = inject(ConfirmService);
  solicitudes: Solicitud[] = [];
  productos: Producto[] = [];
  lotes: Lote[] = [];
  items: Item[] = [];
  sitios: Sitio[] = [];
  /** Bodegas que puede GESTIONAR (responsable puntual O líder de su área —
   *  mismo `SitiosACargoService` que ahora usa el backend para autorizar
   *  aprobar/rechazar/entregar/cancelar, 2026-09-21). Usado por
   *  `puedeGestionar()`; autoservicio, sin `@RequiereServicio`. */
  misSitiosACargoIds = new Set<string>();
  loading = false;
  saving = false;
  error: string | null = null;

  // ── Filtros y paginación de la tabla (client-side) ──────────────────
  filtroTexto = '';
  filtroEstado: EstadoSolicitud | '' = '';
  pageSize = signal(20);
  pageSizeDropdownOpen = signal(false);
  estadoDropdownOpen = signal(false);
  page = 0;
  readonly estadosSolicitud: EstadoSolicitud[] =
    ['PENDIENTE', 'APROBADA', 'EN_ENTREGA', 'ENTREGADA', 'DEVUELTA', 'CONSUMIDA', 'RECHAZADA', 'CANCELADA'];

  seleccionarPageSize(size: number): void {
    this.pageSize.set(size);
    this.page = 0;
    this.pageSizeDropdownOpen.set(false);
  }

  seleccionarEstado(valor: EstadoSolicitud | ''): void {
    this.filtroEstado = valor;
    this.page = 0;
    this.estadoDropdownOpen.set(false);
  }

  /**
   * Texto para la columna "Producto" — todas las líneas si es multi-línea
   * (2026-09-17: antes solo mostraba `s.producto`, el legacy de una sola
   * línea, aunque la solicitud tuviera 2 o 3), o el legacy de una sola línea
   * para solicitudes viejas sin `lineas`.
   */
  productosResumen(s: Solicitud): string {
    if (s.lineas && s.lineas.length > 0) {
      return s.lineas.map((l) => `${l.producto_nombre ?? l.lote_codigo ?? 'Material'} (×${l.cantidad})`).join(', ');
    }
    return s.producto?.nombre ?? '—';
  }

  get solicitudesFiltradas(): Solicitud[] {
    const q = this.filtroTexto.trim().toLowerCase();
    return this.solicitudes.filter((s) => {
      if (this.filtroEstado && s.estado !== this.filtroEstado) return false;
      if (!q) return true;
      return this.productosResumen(s).toLowerCase().includes(q) ||
        (s.usuario_nombre?.toLowerCase().includes(q) ?? false);
    });
  }
  get totalPaginas(): number {
    return Math.max(1, Math.ceil(this.solicitudesFiltradas.length / this.pageSize()));
  }
  get solicitudesPaginadas(): Solicitud[] {
    const start = this.page * this.pageSize();
    return this.solicitudesFiltradas.slice(start, start + this.pageSize());
  }

  modalOpen = false;

  /** Líneas del modal "Nueva solicitud" (Tier SigMat M4) — al menos 1. */
  lineas: LineaForm[] = [];
  observacion = '';
  fechaDevolucion = '';
  readonly cacheFechaDevolucion = new TuiDayCache();
  /** Stock de productos devolutivos elegidos en el modal, cacheado por id. */
  stockProd: Record<string, { disponibles: number; total: number }> = {};

  /** Fichas de las que el instructor logueado es líder (`GET /cursos/lider/:id`)
   *  — solo si lidera al menos una se ofrece "Para una ficha" en el modal. */
  fichasLideradas: CursoLiderado[] = [];
  tipoDestino: 'personal' | 'ficha' = 'personal';
  idCursoSeleccionado: string | null = null;

  get opcionesFicha(): { value: string; label: string }[] {
    return this.fichasLideradas.map((f) => ({
      value: f.idCurso,
      label: `${f.codigo}${f.programa?.nombre ? ' — ' + f.programa.nombre : ''}`,
    }));
  }

  /** "Ver detalles" (Fase 9) — trae `lineas[]` vía GET /:id. */
  detalleAbierto = false;
  detalle: Solicitud | null = null;
  detalleCargando = false;

  /** Diálogo de rechazo — el motivo es obligatorio (#7). */
  rechazoAbierto = false;
  rechazoSolicitud: Solicitud | null = null;
  motivoRechazo = '';
  rechazando = false;

  /** Diálogo de aprobación — el aprobador puede ajustar la fecha de devolución (#3b). */
  aprobarAbierto = false;
  aprobarRef: Solicitud | null = null;
  fechaDevAprobar = '';
  aprobando = false;
  readonly hoyISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,
  '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  readonly hoyTuiDay = TuiDayCache.fromIso(this.hoyISO);
  readonly cacheFechaDevAprobar = new TuiDayCache();

  /** <app-date-input> trabaja con TuiDay; el resto del componente sigue en 'yyyy-MM-dd'. */
  tuiDayToIso(day: TuiDay | null): string {
    return TuiDayCache.toIso(day);
  }

  /** Bodega elegida en el paso 1 del modal. */
  idSitioSeleccionado: string | null = null;

  /** Stock disponible por producto para las filas PENDIENTE / APROBADA de la tabla. */
  stocksPorProducto: Record<string, { disponibles: number; total: number }> = {};

  constructor(
    private api: MaterialesApiService,
    private erpApi: ApiService,
    private toast: ToastService,
    private permisos: PermisosService,
    private auth: AuthService,
    private live: MaterialesLiveService,
    private destroyRef: DestroyRef,
    public red: NetworkStatusService,
    private syncQueue: SyncQueueService,
    private offlineSnapshot: OfflineSnapshotService,
  ) {
    // Al volver la señal (o cuando una entrega guardada termina de enviarse) la
    // lista se refresca sola: si no, seguiría mostrando datos guardados o la
    // solicitud como "Aprobada" hasta que alguien recargue.
    effect(() => {
      const enCola = this.syncQueue.entregasPendientes().size;
      const conectado = this.red.alcanzable();
      untracked(() => {
        if (conectado && (this.datosGuardadosDe || enCola < this.entregasEnColaAntes)) void this.cargar();
        this.entregasEnColaAntes = enCola;
      });
    });
  }

  /** Hora (ms) de la copia guardada que se está mostrando; `null` si son datos en vivo. */
  datosGuardadosDe: number | null = null;
  preparandoTodas = false;
  private entregasEnColaAntes = 0;

  /** APROBADAS que este usuario puede entregar y tienen ítems puntuales que descargar. */
  solicitudesPreparables(): Solicitud[] {
    return this.solicitudes.filter(
      (s) =>
        s.estado === 'APROBADA' &&
        this.puedeEntregar &&
        this.puedeGestionar(s) &&
        !this.bodegaInactiva(s) &&
        !this.entregaPendiente(s) &&
        lineasDevolutivasDeSolicitud(s).length > 0,
    );
  }

  async prepararTodasOffline(): Promise<void> {
    this.preparandoTodas = true;
    try {
      const lista = this.solicitudesPreparables();
      const listas = await prepararTodasEntregaOffline(lista, this.api, this.offlineSnapshot);
      if (listas === lista.length) this.toast.ok(`${listas} solicitud(es) preparadas para entregar sin conexión`);
      else this.toast.warn('Preparación incompleta', `Se prepararon ${listas} de ${lista.length}. Reintenta con señal.`);
    } finally {
      this.preparandoTodas = false;
    }
  }

  private async cargarListaGuardada(): Promise<boolean> {
    const snap = await leerListaSolicitudes(this.offlineSnapshot);
    if (!snap) return false;
    this.solicitudes = snap.data;
    this.datosGuardadosDe = snap.fetchedAt;
    return true;
  }

  /** La entrega de esta solicitud está guardada en el dispositivo, aún sin enviar. */
  entregaPendiente(s: Solicitud): boolean {
    return this.syncQueue.entregasPendientes().has(s.id_solicitud);
  }

  async prepararEntregaOffline(s: Solicitud): Promise<void> {
    const preparo = await prepararSnapshotEntregaOffline(s, this.api, this.offlineSnapshot);
    if (preparo) this.toast.ok('Preparada para entregar sin conexión');
  }

  get puedeAprobar(): boolean {
    return this.permisos.tieneServicio('materiales.solicitudes.aprobar');
  }
  get puedeRechazar(): boolean {
    return this.permisos.tieneServicio('materiales.solicitudes.rechazar');
  }
  get puedeEntregar(): boolean {
    return this.permisos.tieneServicio('materiales.solicitudes.entregar');
  }

  /** Solo el propio solicitante puede confirmar recepción — el backend lo bloquea si no. */
  esSolicitantePropio(s: Solicitud): boolean {
    return s.id_usuario === this.auth.user()?.id;
  }

  /**
   * Nunca puede gestionar su propia solicitud. Admin: siempre puede (regla
   * A+C). Si no, autorizado solo si es el responsable del sitio del
   * producto, o si el sitio no tiene ninguno asignado — replica
   * `SolicitudesService.cambiarEstadoSolicitud` / `entregarSolicitud` /
   * `cancelarSolicitud`.
   */
  /**
   * `bodega_responsable_id` viene resuelto por el backend a partir de la
   * bodega REAL de la solicitud (línea por línea, no `producto?.id_sitio` —
   * la "bodega de casa" del producto puede no ser de dónde sale ESTA
   * solicitud; reporte QA 2026-09-11, caso "Pollo" con lote en otra bodega).
   *
   * También autorizado si es LÍDER DEL ÁREA de esa bodega (2026-09-21):
   * `misSitiosACargoIds` viene de `GET /sitios/a-cargo`, que ya resuelve
   * "responsable puntual O líder del área de esa bodega" — mismo criterio
   * que `SitiosACargoService.puedeGestionarSitio()`, que es lo que el
   * backend usa ahora para autorizar aprobar/rechazar/entregar/cancelar. Sin
   * esto, un líder de área veía la solicitud pero nunca los botones, aunque
   * el backend ya lo dejara actuar.
   */
  puedeGestionar(s: Solicitud): boolean {
    if (this.esSolicitantePropio(s)) return false;
    if (this.auth.isAdmin()) return true;
    if (s.bodega_responsable_id && s.bodega_responsable_id === this.auth.user()?.id) return true;
    return !!s.id_sitio && this.misSitiosACargoIds.has(s.id_sitio);
  }

  /** La bodega ya no acepta aprobar/entregar (ver plan 2026-09-18) — deshabilita
   *  esos dos botones con aviso, sin esperar el error del backend. */
  bodegaInactiva(s: Solicitud): boolean {
    return s.bodega_activa === false;
  }

  /** Banner general de la pantalla — lista todas las bodegas inactivas del
   *  tenant, no solo la de una fila puntual (ver plan 2026-09-18). */
  bodegasInactivas(): Sitio[] {
    return this.sitios.filter((s) => !s.estado);
  }

  ngOnInit(): void {
    this.permisos.cargar();
    this.cargar();
    this.live.eventos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargar());
  }

  // ── Modal multi-línea (Tier SigMat M4) ──────────────────────────────

  /**
   * Solo DEVOLUTIVO — un consumible/perecedero se solicita por LOTE (única
   * unidad realmente disponible: `producto.stock` no existe, vive en
   * `lote.cantidad_disponible`), nunca como "el producto pelado". Antes esto
   * listaba cualquier producto de la bodega sin filtrar por tipo, así que un
   * consumible con lote aparecía DOS VECES en el selector: una como producto
   * suelto (opción rota — no había nada que entregar) y otra como su lote
   * (reporte QA 2026-09-11: "Abono orgánico" salía duplicado al buscar).
   */
  /** ¿Se muestra el paso "Bodega"? Solo si tenemos el catálogo de sitios —
   *  `GET /sitios` exige `materiales.sitios.ver` o `materiales.traslados.crear`,
   *  ninguno de los dos por defecto en un instructor común (2026-09-15 y
   *  2026-09-16 respectivamente), así que para ese caso se salta el paso y se
   *  ofrecen directo todos los productos/lotes visibles, sin agrupar por
   *  bodega (mismo patrón que la versión aprendiz). */
  get pasoBodega(): boolean {
    return this.sitios.length > 0;
  }

  /**
   * Cuando hay paso de bodega, filtra por ÍTEMS REALES disponibles en la
   * bodega elegida, no por `producto.id_sitio` (la bodega "de casa" del
   * producto) — un ítem devolutivo trasladado a otra bodega cambia
   * `item.id_sitio`, nunca `producto.id_sitio`. Filtrar por este último
   * recreaba el mismo bug "Pollo" ya corregido para lotes/consumibles el
   * 2026-09-11, pero nunca para devolutivos (auditoría 2026-09-16/21).
   */
  private productosDeBodega(): Producto[] {
    if (!this.pasoBodega) {
      return this.productos.filter((p) => p.tipo_material === 'DEVOLUTIVO');
    }
    if (!this.idSitioSeleccionado) return [];
    const idsConStockAqui = new Set(
      this.items
        .filter((i) => i.id_sitio === this.idSitioSeleccionado && i.estado === 'DISPONIBLE')
        .map((i) => i.id_producto),
    );
    return this.productos.filter(
      (p) => p.tipo_material === 'DEVOLUTIVO' && idsConStockAqui.has(p.id_producto),
    );
  }

  private lotesDeBodega(): Lote[] {
    return this.lotes.filter(
      (l) =>
        l.estado === 'ACTIVO' &&
        l.cantidad_disponible > 0 &&
        (!this.pasoBodega || !this.idSitioSeleccionado || l.id_sitio === this.idSitioSeleccionado),
    );
  }

  opciones(): { ref: string; label: string }[] {
    const prods = this.productosDeBodega().map((p) => ({
      ref: `p:${p.id_producto}`,
      label: `${p.nombre}${p.marca ? ' · ' + p.marca : ''}`,
    }));
    const lotes = this.lotesDeBodega().map((l) => ({
      ref: `l:${l.id_lote}`,
      // La cantidad SIEMPRE con su unidad — un "250" pelado no dice si son
      // kg, litros o unidades (reporte QA 2026-09-11).
      label: `${l.producto?.nombre ?? 'Lote'}${l.codigo_lote ? ' · ' + l.codigo_lote : ''} (lote, ${l.cantidad_disponible} ${(l.producto?.unidad_medida ?? l.unidad_medida ?? '').toLowerCase() || 'und'})`,
    }));
    return [...prods, ...lotes];
  }

  opcionesDisponibles(): { ref: string; label: string }[] {
    const usadas = new Set(this.lineas.map((l) => l.ref).filter(Boolean));
    return this.opciones().filter((o) => !usadas.has(o.ref));
  }

  opcionesParaLinea(linea: LineaForm): { ref: string; label: string }[] {
    const usadasEnOtras = new Set(
      this.lineas.filter((l) => l !== linea).map((l) => l.ref).filter(Boolean),
    );
    return this.opciones().filter((o) => !usadasEnOtras.has(o.ref));
  }

  /** <app-ss> espera {value,label} — mismo filtrado que opcionesParaLinea, solo mapeado. */
  opcionesLinea(linea: LineaForm): { value: string; label: string }[] {
    return this.opcionesParaLinea(linea).map((o) => ({ value: o.ref, label: o.label }));
  }

  get opcionesSitio(): { value: string; label: string }[] {
    // Una bodega inactiva no acepta solicitudes nuevas (ver plan 2026-09-18)
    // — no se ofrece acá para elegir.
    return this.sitios.filter((s) => s.estado).map((s) => ({ value: s.id_sitio, label: `${s.nombre} (${s.tipo})` }));
  }

  disponibleDe(linea: LineaForm): number {
    if (!linea.ref) return 0;
    const [tipo, id] = linea.ref.split(':');
    if (tipo === 'l') return this.lotes.find((l) => l.id_lote === id)?.cantidad_disponible ?? 0;
    return this.stockProd[id]?.disponibles ?? 0;
  }

  async onRefChange(linea: LineaForm): Promise<void> {
    if (!linea.ref) return;
    const [tipo, id] = linea.ref.split(':');
    if (tipo === 'p' && !this.stockProd[id]) {
      try {
        this.stockProd[id] = await this.api.stockProducto(id);
      } catch {
        this.stockProd[id] = { disponibles: 0, total: 0 };
      }
    }
  }

  onSitioChange(idSitio: string | null): void {
    this.idSitioSeleccionado = idSitio;
    this.lineas = idSitio || !this.pasoBodega ? [{ ref: '', cantidad: 1 }] : [];
    this.fechaDevolucion = '';
  }

  agregarLinea(): void {
    this.lineas.push({ ref: '', cantidad: 1 });
  }

  quitarLinea(i: number): void {
    this.lineas.splice(i, 1);
    if (this.lineas.length === 0) this.lineas.push({ ref: '', cantidad: 1 });
  }

  /** ¿Alguna línea es de un producto devolutivo (no CONSUMO/PERECEDERO)? */
  requiereFechaDevolucion(): boolean {
    return this.lineas.some((l) => {
      if (!l.ref.startsWith('p:')) return false;
      const p = this.productos.find((x) => x.id_producto === l.ref.slice(2));
      const tipo = p?.tipo_material;
      return !!tipo && tipo !== 'CONSUMO' && tipo !== 'PERECEDERO';
    });
  }

  /**
   * Mismo criterio que `requiereFechaDevolucion()`, pero sobre una
   * `Solicitud` ya creada (no el formulario de "crear") — se usa en el modal
   * de "Aprobar" para no pedir fecha de devolución si la solicitud es
   * 100% consumible/perecedero. Un consumible normalmente NO vuelve — solo
   * puede volver un sobrante parcial, que se registra aparte en
   * Devoluciones, no como un préstamo con fecha de devolución (2026-09-17).
   * Multi-línea: cada línea es XOR `id_producto` (devolutivo) o `id_lote`
   * (consumible/perecedero vía lote) — basta con que UNA sea `id_producto`.
   * Legacy de una sola línea: cae al `tipo_material` del `producto` de la
   * solicitud, igual que el formulario de crear.
   */
  aprobarRequiereFecha(s: Solicitud | null): boolean {
    if (!s) return false;
    if (s.lineas && s.lineas.length > 0) {
      return s.lineas.some((l) => !!l.id_producto);
    }
    const tipo = s.producto?.tipo_material;
    return !!tipo && tipo !== 'CONSUMO' && tipo !== 'PERECEDERO';
  }

  puedeGuardar(): boolean {
    if (this.observacion.trim().length < 10) return false;
    const activas = this.lineas.filter((l) => l.ref && Number(l.cantidad) >= 1);
    if (activas.length === 0) return false;
    for (const l of activas) if (Number(l.cantidad) > this.disponibleDe(l)) return false;
    if (this.tipoDestino === 'ficha' && !this.idCursoSeleccionado) return false;
    return !this.requiereFechaDevolucion() || !!this.fechaDevolucion;
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      if (!this.red.alcanzable() && (await this.cargarListaGuardada())) return;
      // M9 — solo `listarSolicitudes()` es crítico; si una secundaria da 403
      // (excepción personal) no debe tumbar la tabla entera. `GET /sitios`
      // exige `materiales.sitios.ver` O `materiales.traslados.crear`
      // (`SitiosController.getSitios`) — un instructor común no tiene ninguno
      // de los dos por defecto desde el recorte de esta sesión (antes sí,
      // vía `traslados.crear`, y por eso este 403 no se veía hasta ahora), así
      // que ni se pide si no aplica ninguno de los dos: el paso "Bodega" del
      // modal se salta solo (ver `pasoBodega`), no bloquea crear la solicitud.
      const verSitios =
        this.auth.tieneServicio('materiales.sitios.ver') ||
        this.auth.tieneServicio('materiales.traslados.crear');
      const personaId = this.auth.user()?.personaId;
      // Mismos servicios que acepta el backend en GET /items y GET /lotes: pedir lo que el
      // rol no puede ver dispara un 403 y el aviso global "Sin permiso" aunque se ignore.
      const tiene = (...servicios: string[]) => servicios.some((x) => this.auth.tieneServicio(x));
      const verItems = tiene('materiales.items.ver', 'materiales.novedades.crear', 'materiales.traslados.crear');
      const verLotes = tiene('materiales.lotes.ver', 'materiales.solicitudes.crear');
      const [solicitudes, productos, lotes, items, sitios, fichas, sitiosACargo] = await Promise.all([
        this.api.listarSolicitudes(),
        this.api.listarProductos().catch(() => [] as Producto[]),
        verLotes ? this.api.listarLotes().catch(() => [] as Lote[]) : Promise.resolve([] as Lote[]),
        verItems ? this.api.listarItems().catch(() => [] as Item[]) : Promise.resolve([] as Item[]),
        verSitios ? this.api.listarSitios().catch(() => [] as Sitio[]) : Promise.resolve([] as Sitio[]),
        personaId ? this.erpApi.obtenerCursosLiderados(personaId).catch(() => [] as CursoLiderado[]) : Promise.resolve([] as CursoLiderado[]),
        this.api.sitiosACargo().catch(() => [] as Sitio[]),
      ]);
      this.solicitudes = solicitudes;
      this.datosGuardadosDe = null;
      void guardarListaSolicitudes(solicitudes, this.offlineSnapshot);
      this.productos = productos;
      this.lotes = lotes;
      this.items = items;
      this.sitios = sitios;
      this.fichasLideradas = fichas;
      this.misSitiosACargoIds = new Set(sitiosACargo.map((s) => s.id_sitio));
      await this.cargarStocks();
    } catch (e) {
      if ((e as { status?: number })?.status === 0 && (await this.cargarListaGuardada())) return;
      this.toast.httpError(e, 'No se pudieron cargar las solicitudes.');
    } finally {
      this.loading = false;
    }
  }

  /**
   * Stock en vivo de los productos de las solicitudes PENDIENTE / APROBADA.
   *
   * Antes hacía una petición HTTP por cada producto distinto (`stockProducto`
   * en un `Promise.all`) — con varios productos pendientes eso son varias
   * idas y vueltas en paralelo en cada carga (y en cada notificación en
   * vivo), compitiendo por las pocas conexiones que el navegador permite por
   * origen. Ahora usa una sola llamada a `GET /existencias` (ya trae todo el
   * tenant/scope de una vez) y reconstruye el mismo cálculo que hacía el
   * backend en `countStockByProducto` por producto:
   *  - DEVOLUTIVO con bodega propia: cuenta SOLO los ítems de esa bodega
   *    (un ítem trasladado a otra bodega no cuenta, igual que antes).
   *  - DEVOLUTIVO sin bodega propia: suma ítems de TODAS las bodegas.
   *  - CONSUMO/PERECEDERO: suma el saldo de lotes ACTIVO de TODAS las
   *    bodegas (los lotes de un consumible sí pueden repartirse en varias).
   */
  private async cargarStocks(): Promise<void> {
    const idsPendientes = new Set(
      this.solicitudes
        .filter((s) => s.estado === 'PENDIENTE' || s.estado === 'APROBADA')
        .map((s) => s.producto?.id_producto)
        .filter((id): id is string => !!id),
    );
    if (idsPendientes.size === 0) {
      this.stocksPorProducto = {};
      return;
    }
    try {
      const existencias = await this.api.obtenerExistencias();
      const filasPorProducto = new Map<string, ResumenExistencias[]>();
      for (const f of existencias) {
        if (!idsPendientes.has(f.id_producto)) continue;
        const lista = filasPorProducto.get(f.id_producto);
        if (lista) lista.push(f); else filasPorProducto.set(f.id_producto, [f]);
      }
      const mapa: Record<string, { disponibles: number; total: number }> = {};
      for (const s of this.solicitudes) {
        const id = s.producto?.id_producto;
        if (!id || mapa[id] || !idsPendientes.has(id)) continue;
        const filas = filasPorProducto.get(id) ?? [];
        if (s.producto?.tipo_material === 'DEVOLUTIVO') {
          const idSitioProducto = s.producto?.id_sitio ?? null;
          if (idSitioProducto) {
            const fila = filas.find((f) => f.id_sitio === idSitioProducto);
            mapa[id] = fila ? { disponibles: fila.disponibles, total: fila.total } : { disponibles: 0, total: 0 };
          } else {
            mapa[id] = {
              disponibles: filas.reduce((a, f) => a + f.disponibles, 0),
              total: filas.reduce((a, f) => a + f.total, 0),
            };
          }
        } else {
          mapa[id] = {
            disponibles: filas.reduce((a, f) => a + f.lote_disponible, 0),
            total: filas.reduce((a, f) => a + f.lote_total, 0),
          };
        }
      }
      this.stocksPorProducto = mapa;
    } catch {
      this.stocksPorProducto = {};
    }
  }

  /** Stock disponible del producto de una fila (o null si no se consultó). */
  stockDe(s: Solicitud): { disponibles: number; total: number } | null {
    const id = s.producto?.id_producto;
    return id ? this.stocksPorProducto[id] ?? null : null;
  }

  nuevo(): void {
    if (this.productos.length === 0 && this.lotes.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos un producto o lote para crear una solicitud.');
      return;
    }
    this.idSitioSeleccionado = null;
    this.lineas = this.pasoBodega ? [] : [{ ref: '', cantidad: 1 }];
    this.observacion = '';
    this.fechaDevolucion = '';
    this.stockProd = {};
    this.tipoDestino = 'personal';
    this.idCursoSeleccionado = null;
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async verDetalle(s: Solicitud): Promise<void> {
    this.detalle = s;
    this.detalleAbierto = true;
    this.detalleCargando = true;
    try {
      this.detalle = await this.api.obtenerSolicitud(s.id_solicitud);
    } catch {
      // nos quedamos con la fila de la lista
    } finally {
      this.detalleCargando = false;
    }
  }

  async guardar(): Promise<void> {
    // Doble chequeo — no alcanza con deshabilitar el botón, ver Fase 1 del plan.
    if (!this.puedeGuardar()) {
      this.error = this.observacion.trim().length < 10
        ? 'La observación es obligatoria (mín. 10 caracteres): indicá para qué y dónde se usará el material.'
        : this.tipoDestino === 'ficha' && !this.idCursoSeleccionado
        ? 'Seleccioná a qué ficha se asigna el material.'
        : this.requiereFechaDevolucion() && !this.fechaDevolucion
        ? 'Alguna línea es devolutiva: indicá la fecha de devolución.'
        : 'Revisá las líneas: cada una necesita producto/lote y una cantidad dentro del stock.';
      return;
    }
    this.saving = true;
    this.error = null;
    try {
      const lineas = this.lineas
        .filter((l) => l.ref && Number(l.cantidad) >= 1)
        .map((l) => {
          const [tipo, id] = l.ref.split(':');
          return tipo === 'l'
            ? { id_lote: id, cantidad: Number(l.cantidad) }
            : { id_producto: id, cantidad: Number(l.cantidad) };
        });
      await this.api.crearSolicitud({
        tipo: 'PRESTAMO',
        lineas,
        observacion: this.observacion || undefined,
        fecha_devolucion: this.fechaDevolucion || undefined,
        id_curso: this.tipoDestino === 'ficha' ? this.idCursoSeleccionado! : undefined,
      });
      this.toast.ok('Solicitud creada');
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear la solicitud.';
    } finally {
      this.saving = false;
    }
  }

  async aprobar(s: Solicitud): Promise<void> {
    // Aviso (no bloquea): aprobar por encima del stock actual. La entrega
    // igual quedará bloqueada por M8 hasta que haya unidades.
    const st = this.stockDe(s);
    if (st && st.disponibles < s.cantidad) {
      const ok = await this.confirmDlg.ask(
        `Estás aprobando ${s.cantidad} unidad(es) de "${s.producto?.nombre ?? 'este producto'}" pero solo hay ${st.disponibles} disponible(s) ahora. La solicitud quedará APROBADA y se podrá entregar cuando haya stock. ¿Continuar?`,
        { header: 'Aprobar sin stock suficiente', acceptLabel: 'Aprobar de todas formas', rejectLabel: 'Volver', danger: false },
      );
      if (!ok) return;
    }
    this.aprobarRef = s;
    this.fechaDevAprobar = s.fecha_devolucion ? String(s.fecha_devolucion).slice(0, 10) : '';
    this.aprobarAbierto = true;
  }

  cerrarAprobar(): void {
    this.aprobarAbierto = false;
    this.aprobarRef = null;
    this.fechaDevAprobar = '';
  }

  async confirmarAprobar(): Promise<void> {
    const s = this.aprobarRef;
    if (!s) return;
    this.aprobando = true;
    try {
      await this.api.aprobarSolicitud(s.id_solicitud, { fecha_devolucion: this.fechaDevAprobar || undefined });
      this.toast.ok('Solicitud aprobada');
      this.cerrarAprobar();
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo aprobar la solicitud.');
    } finally {
      this.aprobando = false;
    }
  }

  async cancelar(s: Solicitud): Promise<void> {
    if (!(await this.confirmDlg.ask(
      `¿Cancelar esta solicitud aprobada de "${s.producto?.nombre ?? 'este producto'}"? El solicitante será notificado y no se entregará. No afecta el inventario.`,
      { header: 'Cancelar solicitud', acceptLabel: 'Sí, cancelar', rejectLabel: 'Volver' },
    ))) return;
    try {
      await this.api.cancelarSolicitud(s.id_solicitud);
      this.toast.ok('Solicitud cancelada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cancelar la solicitud.');
    }
  }

  rechazar(s: Solicitud): void {
    this.rechazoSolicitud = s;
    this.motivoRechazo = '';
    this.rechazoAbierto = true;
  }

  cerrarRechazo(): void {
    this.rechazoAbierto = false;
    this.rechazoSolicitud = null;
    this.motivoRechazo = '';
  }

  async confirmarRechazo(): Promise<void> {
    const s = this.rechazoSolicitud;
    const motivo = this.motivoRechazo.trim();
    if (!s || !motivo) return;
    this.rechazando = true;
    try {
      await this.api.rechazarSolicitud(s.id_solicitud, motivo);
      this.toast.ok('Solicitud rechazada');
      this.cerrarRechazo();
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo rechazar la solicitud.');
    } finally {
      this.rechazando = false;
    }
  }

  /** Solicitud abierta en el modal de "Marcar en entrega" — ver docblock del modal. */
  solicitudAEntregar: Solicitud | null = null;

  abrirEntregar(s: Solicitud): void {
    this.solicitudAEntregar = s;
  }

  cerrarEntregar(): void {
    this.solicitudAEntregar = null;
  }

  async confirmarEntrega(seleccion: SeleccionLineaEntregaInput[] | undefined): Promise<void> {
    const s = this.solicitudAEntregar;
    if (!s) return;

    if (!this.red.alcanzable()) {
      await this.syncQueue.enqueue('materiales.entregarSolicitud', { id_solicitud: s.id_solicitud, seleccion });
      this.toast.ok('Guardado localmente — se enviará cuando haya señal');
      this.solicitudAEntregar = null;
      return;
    }

    try {
      await this.api.entregarSolicitud(s.id_solicitud, seleccion);
      this.toast.ok('Solicitud marcada en entrega');
      this.solicitudAEntregar = null;
      await this.cargar();
    } catch (e: any) {
      if (e?.status === 0) {
        await this.syncQueue.enqueue('materiales.entregarSolicitud', { id_solicitud: s.id_solicitud, seleccion });
        this.toast.ok('Sin conexión — guardado localmente, se enviará cuando haya señal');
        this.solicitudAEntregar = null;
      } else {
        this.toast.httpError(e, 'No se pudo marcar en entrega.');
      }
    }
  }

  async confirmarRecepcion(s: Solicitud): Promise<void> {
    try {
      await this.api.confirmarRecepcionSolicitud(s.id_solicitud);
      this.toast.ok('Recepción confirmada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo confirmar la recepción.');
    }
  }
}
