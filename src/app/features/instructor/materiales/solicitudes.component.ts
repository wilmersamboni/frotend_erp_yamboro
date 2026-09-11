import { Component, DestroyRef, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MaterialesLiveService } from '../../../core/services/realtime/materiales-live.service';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { PermisosService } from '../../../core/services/permisos.service';
import { AuthService } from '../../../core/services/auth.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { DateInputComponent } from '../../../shared/components/date-input.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import { TuiDayCache } from '../../../shared/utils/tui-day.util';
import type { TuiDay } from '@taiga-ui/cdk';
import { MaterialesApiService, Lote, Producto, Sitio, Solicitud, EstadoSolicitud } from '../../../core/services/materiales/materiales-api.service';

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
  imports: [FormsModule, DatePipe, StatusBadgeComponent, DateInputComponent, SearchableSelectComponent],
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

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (solicitudes.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay solicitudes registradas</p>
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
            <p class="text-center text-gray-400 text-sm py-10">Sin resultados para estos filtros</p>
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
                  <td class="px-4 py-3 text-gray-700">{{ s.producto?.nombre ?? '—' }}</td>
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
                    <div class="flex flex-wrap justify-end gap-2">
                      <button (click)="verDetalle(s)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400 transition-colors">Ver</button>
                      @if (s.estado === 'PENDIENTE' && puedeAprobar && puedeGestionar(s)) {
                        <button (click)="aprobar(s)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-green-200 text-green-600 bg-white hover:bg-green-50 transition-colors">Aprobar</button>
                      }
                      @if (s.estado === 'PENDIENTE' && puedeRechazar && puedeGestionar(s)) {
                        <button (click)="rechazar(s)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-red-400 hover:text-red-600 transition-colors">Rechazar</button>
                      }
                      @if (s.estado === 'APROBADA' && puedeEntregar && puedeGestionar(s)) {
                        <button (click)="entregar(s)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-blue-200 text-blue-600 bg-white hover:bg-blue-50 transition-colors">Marcar en entrega</button>
                      }
                      @if (s.estado === 'APROBADA' && puedeRechazar && puedeGestionar(s)) {
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
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Bodega</label>
              <app-ss [options]="opcionesSitio" placeholder="— Selecciona una bodega —"
                [(ngModel)]="idSitioSeleccionado" (ngModelChange)="onSitioChange($event)"></app-ss>
              <p class="text-[11px] text-gray-400 mt-1">Todas las líneas de una solicitud tienen que ser de la misma bodega.</p>
            </div>

            @if (idSitioSeleccionado) {
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
                  <app-date-input placeholder="DD/MM/AAAA"
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
          <label class="block text-xs font-medium text-gray-600 mb-1">Fecha de devolución</label>
          <app-date-input placeholder="DD/MM/AAAA" [min]="hoyTuiDay"
            [ngModel]="cacheFechaDevAprobar.get(fechaDevAprobar)"
            (ngModelChange)="fechaDevAprobar = tuiDayToIso($event)"></app-date-input>
          <p class="text-[11px] text-gray-400 mt-1">Podés ajustar la fecha que puso el solicitante. Se le avisa si cambia.</p>
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
  `,
})
export class InstructorMaterialesSolicitudesComponent implements OnInit {
  solicitudes: Solicitud[] = [];
  productos: Producto[] = [];
  lotes: Lote[] = [];
  sitios: Sitio[] = [];
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
    ['PENDIENTE', 'APROBADA', 'EN_ENTREGA', 'ENTREGADA', 'DEVUELTA', 'RECHAZADA', 'CANCELADA'];

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

  get solicitudesFiltradas(): Solicitud[] {
    const q = this.filtroTexto.trim().toLowerCase();
    return this.solicitudes.filter((s) => {
      if (this.filtroEstado && s.estado !== this.filtroEstado) return false;
      if (!q) return true;
      return (s.producto?.nombre?.toLowerCase().includes(q) ?? false) ||
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
  readonly hoyISO = new Date().toISOString().slice(0, 10);
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
    private toast: ToastService,
    private permisos: PermisosService,
    private auth: AuthService,
    private live: MaterialesLiveService,
    private destroyRef: DestroyRef,
  ) {}

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
   */
  puedeGestionar(s: Solicitud): boolean {
    if (this.esSolicitantePropio(s)) return false;
    if (this.auth.isAdmin()) return true;
    return !!s.bodega_responsable_id && s.bodega_responsable_id === this.auth.user()?.id;
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
  private productosDeBodega(): Producto[] {
    if (!this.idSitioSeleccionado) return [];
    return this.productos.filter(
      (p) => p.id_sitio === this.idSitioSeleccionado && p.tipo_material === 'DEVOLUTIVO',
    );
  }

  private lotesDeBodega(): Lote[] {
    return this.lotes.filter(
      (l) => l.estado === 'ACTIVO' && l.cantidad_disponible > 0 && l.id_sitio === this.idSitioSeleccionado,
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
    return this.sitios.map((s) => ({ value: s.id_sitio, label: `${s.nombre} (${s.tipo})` }));
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
    this.lineas = idSitio ? [{ ref: '', cantidad: 1 }] : [];
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

  puedeGuardar(): boolean {
    if (this.observacion.trim().length < 10) return false;
    const activas = this.lineas.filter((l) => l.ref && Number(l.cantidad) >= 1);
    if (activas.length === 0) return false;
    for (const l of activas) if (Number(l.cantidad) > this.disponibleDe(l)) return false;
    return !this.requiereFechaDevolucion() || !!this.fechaDevolucion;
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // M9 — solo `listarSolicitudes()` es crítico; si una secundaria da 403
      // (excepción personal) no debe tumbar la tabla entera.
      const [solicitudes, productos, lotes, sitios] = await Promise.all([
        this.api.listarSolicitudes(),
        this.api.listarProductos().catch(() => [] as Producto[]),
        this.api.listarLotes().catch(() => [] as Lote[]),
        this.api.listarSitios().catch(() => [] as Sitio[]),
      ]);
      this.solicitudes = solicitudes;
      this.productos = productos;
      this.lotes = lotes;
      this.sitios = sitios;
      await this.cargarStocks();
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las solicitudes.');
    } finally {
      this.loading = false;
    }
  }

  /** Stock en vivo de los productos de las solicitudes PENDIENTE / APROBADA. */
  private async cargarStocks(): Promise<void> {
    const ids = [
      ...new Set(
        this.solicitudes
          .filter((s) => s.estado === 'PENDIENTE' || s.estado === 'APROBADA')
          .map((s) => s.producto?.id_producto)
          .filter((id): id is string => !!id),
      ),
    ];
    const pares = await Promise.all(
      ids.map(async (id) => {
        try {
          return [id, await this.api.stockProducto(id)] as const;
        } catch {
          return null;
        }
      }),
    );
    const mapa: Record<string, { disponibles: number; total: number }> = {};
    for (const par of pares) if (par) mapa[par[0]] = par[1];
    this.stocksPorProducto = mapa;
  }

  /** Stock disponible del producto de una fila (o null si no se consultó). */
  stockDe(s: Solicitud): { disponibles: number; total: number } | null {
    const id = s.producto?.id_producto;
    return id ? this.stocksPorProducto[id] ?? null : null;
  }

  nuevo(): void {
    if ((this.productos.length === 0 && this.lotes.length === 0) || this.sitios.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos un producto o lote y un sitio para crear una solicitud.');
      return;
    }
    this.idSitioSeleccionado = null;
    this.lineas = [];
    this.observacion = '';
    this.fechaDevolucion = '';
    this.stockProd = {};
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
      const ok = confirm(
        `Estás aprobando ${s.cantidad} unidad(es) de "${s.producto?.nombre ?? 'este producto'}" ` +
        `pero solo hay ${st.disponibles} disponible(s) ahora.\n\n` +
        `La solicitud quedará APROBADA y se podrá entregar cuando haya stock. ¿Continuar?`,
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
    if (!confirm(
      `¿Cancelar esta solicitud aprobada de "${s.producto?.nombre ?? 'este producto'}"?\n\n` +
      `El solicitante será notificado y no se entregará. No afecta el inventario.`,
    )) return;
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

  async entregar(s: Solicitud): Promise<void> {
    try {
      await this.api.entregarSolicitud(s.id_solicitud);
      this.toast.ok('Solicitud marcada en entrega');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo marcar en entrega.');
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
