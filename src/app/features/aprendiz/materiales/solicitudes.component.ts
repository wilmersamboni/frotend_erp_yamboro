import { Component, DestroyRef, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MaterialesLiveService } from '../../../core/services/realtime/materiales-live.service';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { DateInputComponent } from '../../../shared/components/date-input.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import { TuiDayCache } from '../../../shared/utils/tui-day.util';
import type { TuiDay } from '@taiga-ui/cdk';
import {
  MaterialesApiService,
  Lote,
  Producto,
  Sitio,
  Solicitud,
  EstadoSolicitud,
} from '../../../core/services/materiales/materiales-api.service';

/**
 * Solicitudes de préstamo para aprendiz: crear + ver propias + confirmar
 * recepción. El backend ya filtra `GET /solicitudes` por dueño para quien
 * no es admin ni responsable (`SolicitudesService.obtenerSolicitudes`), así
 * que acá no se filtra nada client-side.
 *
 * Multi-línea (Tier SigMat M4): el modal "Nueva solicitud" arma N líneas,
 * cada una de un PRODUCTO devolutivo o de un LOTE consumible, todas de la
 * misma bodega (el backend rechaza con 400 si se mezclan bodegas). El body
 * legacy de 1 línea sigue soportado — acá siempre mandamos `lineas[]`.
 */

interface LineaForm {
  /** `p:<id>` para producto devolutivo, `l:<id>` para lote consumible. */
  ref: string;
  cantidad: number;
}

@Component({
  selector: 'app-aprendiz-materiales-solicitudes',
  standalone: true,
  imports: [FormsModule, DatePipe, StatusBadgeComponent, DateInputComponent, SearchableSelectComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Mis solicitudes</h1>
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
        <p class="text-center text-gray-400 text-sm py-10">No tenés solicitudes registradas</p>
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
                placeholder="Buscar por producto..."
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
                <th class="px-4 py-3 text-left font-semibold">Solicitud</th>
                <th class="px-4 py-3 text-left font-semibold">Ítems</th>
                @if (hayAjenas()) { <th class="px-4 py-3 text-left font-semibold">Solicitó</th> }
                <th class="px-4 py-3 text-left font-semibold">Estado</th>
                <th class="px-4 py-3 text-left font-semibold">Fecha</th>
                <th class="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (s of solicitudesPaginadas; track s.id_solicitud) {
                <tr class="hover:bg-gray-50/80 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ s.producto?.nombre ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ s.cantidad }} unidad(es)</td>
                  @if (hayAjenas()) { <td class="px-4 py-3 text-gray-600 text-xs">{{ s.usuario_nombre || '—' }}</td> }
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
                        <button (click)="confirmarRecepcion(s)"
                          class="px-3 py-1.5 rounded-full text-xs font-semibold border border-green-200 text-green-600 bg-white hover:bg-green-50 transition-colors">
                          Confirmar recepción
                        </button>
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
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Nueva solicitud</h2>
            <button (click)="cerrarModal()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-4">
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
                      <div class="flex-1">
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
            @if (detalle.fecha_aprobacion) {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">Aprobada</dt><dd class="text-gray-800 text-right">{{ detalle.fecha_aprobacion | date: 'short' }}</dd></div>
            }
            @if (detalle.fecha_entrega) {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">Entregada</dt><dd class="text-gray-800 text-right">{{ detalle.fecha_entrega | date: 'short' }}</dd></div>
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
export class AprendizMaterialesSolicitudesComponent implements OnInit {
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

  /** Líneas del modal — al menos 1. */
  lineas: LineaForm[] = [];
  observacion = '';
  fechaDevolucion = '';
  readonly cacheFechaDevolucion = new TuiDayCache();

  /** <app-date-input> trabaja con TuiDay; el resto del componente sigue en 'yyyy-MM-dd'. */
  tuiDayToIso(day: TuiDay | null): string {
    return TuiDayCache.toIso(day);
  }

  detalleAbierto = false;
  detalle: Solicitud | null = null;
  detalleCargando = false;

  /** Bodega elegida en el paso 1 del modal. */
  idSitioSeleccionado: string | null = null;

  /** Gestión de solicitudes ajenas — solo visible para el aprendiz encargado de bodega. */
  rechazoAbierto = false;
  rechazoSolicitud: Solicitud | null = null;
  motivoRechazo = '';
  rechazando = false;

  aprobarAbierto = false;
  aprobarRef: Solicitud | null = null;
  fechaDevAprobar = '';
  aprobando = false;
  readonly hoyISO = new Date().toISOString().slice(0, 10);
  readonly hoyTuiDay = TuiDayCache.fromIso(this.hoyISO);
  readonly cacheFechaDevAprobar = new TuiDayCache();

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
    private live: MaterialesLiveService,
    private destroyRef: DestroyRef,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.live.eventos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargar());
  }

  esSolicitantePropio(s: Solicitud): boolean {
    return s.id_usuario === this.auth.user()?.id;
  }

  /**
   * ¿Hay al menos una solicitud pedida por otra persona? Solo entonces tiene
   * sentido la columna "Solicitó" en la tabla — un aprendiz encargado de
   * bodega ve solicitudes ajenas (las de su bodega); uno normal, solo las suyas.
   */
  hayAjenas(): boolean {
    const uid = this.auth.user()?.id;
    return this.solicitudes.some((s) => s.id_usuario !== uid);
  }

  // ── Gestión (aprendiz encargado de bodega) ──────────────────────────────
  get puedeAprobar(): boolean {
    return this.auth.tieneServicio('materiales.solicitudes.aprobar');
  }
  get puedeRechazar(): boolean {
    return this.auth.tieneServicio('materiales.solicitudes.rechazar');
  }
  get puedeEntregar(): boolean {
    return this.auth.tieneServicio('materiales.solicitudes.entregar');
  }

  /**
   * Nunca su propia solicitud; admin siempre (nunca acá); si no, solo si es el
   * responsable del sitio del producto — replica `SolicitudesService`.
   */
  puedeGestionar(s: Solicitud): boolean {
    if (this.esSolicitantePropio(s)) return false;
    if (this.auth.isAdmin()) return true;
    const idSitio = s.producto?.id_sitio;
    const sitio = idSitio ? this.sitios.find((x) => x.id_sitio === idSitio) : undefined;
    return !!sitio?.id_responsable && sitio.id_responsable === this.auth.user()?.id;
  }

  /** ¿Se muestra el paso "Bodega"? Solo si tenemos el catálogo de sitios. */
  get pasoBodega(): boolean {
    return this.sitios.length > 0;
  }

  // ── Opciones de línea (productos devolutivos + lotes consumibles) ─────

  private productosDeBodega(): Producto[] {
    if (this.pasoBodega && this.idSitioSeleccionado) {
      return this.productos.filter((p) => p.id_sitio === this.idSitioSeleccionado);
    }
    return this.pasoBodega ? [] : this.productos;
  }

  private lotesDeBodega(): Lote[] {
    return this.lotes.filter(
      (l) =>
        l.estado === 'ACTIVO' &&
        l.cantidad_disponible > 0 &&
        (!this.pasoBodega || !this.idSitioSeleccionado || l.id_sitio === this.idSitioSeleccionado),
    );
  }

  /** Todas las opciones seleccionables en esta bodega (para saber si hay algo que pedir). */
  opciones(): { ref: string; label: string }[] {
    const prods = this.productosDeBodega().map((p) => ({
      ref: `p:${p.id_producto}`,
      label: `${p.nombre}${p.marca ? ' · ' + p.marca : ''}`,
    }));
    const lotes = this.lotesDeBodega().map((l) => ({
      ref: `l:${l.id_lote}`,
      label: `${l.producto?.nombre ?? 'Lote'}${l.codigo_lote ? ' · ' + l.codigo_lote : ''} (lote, ${l.cantidad_disponible})`,
    }));
    return [...prods, ...lotes];
  }

  /** Opciones que todavía no fueron elegidas en otra línea. */
  opcionesDisponibles(): { ref: string; label: string }[] {
    const usadas = new Set(this.lineas.map((l) => l.ref).filter(Boolean));
    return this.opciones().filter((o) => !usadas.has(o.ref));
  }

  /** Para el `<app-ss>` de una línea: las libres + la que ya tiene elegida. */
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
    if (tipo === 'l') {
      return this.lotes.find((l) => l.id_lote === id)?.cantidad_disponible ?? 0;
    }
    // Producto devolutivo — usamos el stock ya cargado en el mapa.
    return this.stockProd[id]?.disponibles ?? 0;
  }

  /** Stock de productos devolutivos, cacheado por id (se consulta al elegirlo). */
  stockProd: Record<string, { disponibles: number; total: number }> = {};

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

  puedeGuardar(): boolean {
    if (this.observacion.trim().length < 10) return false;
    const activas = this.lineas.filter((l) => l.ref && Number(l.cantidad) >= 1);
    if (activas.length === 0) return false;
    for (const l of activas) {
      if (Number(l.cantidad) > this.disponibleDe(l)) return false;
    }
    if (this.requiereFechaDevolucion() && !this.fechaDevolucion) return false;
    return true;
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const verSitios = this.auth.tieneServicio('materiales.sitios.ver');
      const [solicitudes, productos, lotes, sitios] = await Promise.all([
        this.api.listarSolicitudes(),
        this.api.listarProductos().catch(() => [] as Producto[]),
        this.api.listarLotes().catch(() => [] as Lote[]),
        verSitios ? this.api.listarSitios().catch(() => [] as Sitio[]) : Promise.resolve([] as Sitio[]),
      ]);
      this.solicitudes = solicitudes;
      this.productos = productos;
      this.lotes = lotes;
      this.sitios = sitios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las solicitudes.');
    } finally {
      this.loading = false;
    }
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

  async confirmarRecepcion(s: Solicitud): Promise<void> {
    try {
      await this.api.confirmarRecepcionSolicitud(s.id_solicitud);
      this.toast.ok('Recepción confirmada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo confirmar la recepción.');
    }
  }

  // ── Aprobar / rechazar / entregar / cancelar (encargado de bodega) ──────

  aprobar(s: Solicitud): void {
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
}
