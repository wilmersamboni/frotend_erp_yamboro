import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MaterialesLiveService } from '../data-access/materiales-live.service';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService, mensajeDeError } from '../../../core/services/toast.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { TableFilterComponent } from '../../../shared/components/table-filter.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton.component';
import { Item, ItemDetalleBusqueda, Lote, MaterialesApiService, Sitio, Traslado } from '../data-access/materiales-api.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { EsperaDirective } from '../../../shared/directives/espera.directive';
import { CargasSecundarias } from '../data-access/cargas-secundarias';
import { AvisoCargasComponent } from '../ui/aviso-cargas.component';
import { MaterialesScreenPolicy } from '../ui/materiales-screen-policy';

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
  imports: [AvisoCargasComponent, EsperaDirective, DialogDirective, AlertComponent, EmptyStateComponent, FormsModule, DatePipe, StatusBadgeComponent, SearchableSelectComponent, TableFilterComponent, LoadingSkeletonComponent],
  template: `
    <div class="p-4 sm:p-6">
      <nav aria-label="Migas de pan" class="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <span>Materiales</span><span aria-hidden="true">/</span><span>Operación</span><span aria-hidden="true">/</span><span aria-current="page" class="font-semibold text-gray-800">Traslados</span>
      </nav>
      <div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Traslados</h1>
        <button (click)="abrirCrear()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: var(--accent-brand)">
          + Nuevo traslado
        </button>
      </div>

      <app-aviso-cargas [cargas]="secundarias" (reintentar)="recargar()" />

      @if (bodegasInactivas().length > 0) {
        <app-alert class="mb-4" variante="advertencia" [titulo]="bodegasInactivas().length === 1 ? 'Bodega inactiva' : 'Bodegas inactivas'">
          <strong>{{ bodegasInactivas().map(s => s.nombre).join(', ') }}</strong>
          — no se pueden gestionar sus productos, ítems, lotes, solicitudes ni traslados mientras estén así.
        </app-alert>
      }

      <div class="flex flex-wrap gap-2 mb-5">
        <app-table-filter label="Estado" [options]="opcionesEstadoFiltro" [value]="estadoFiltro" (valueChange)="estadoFiltro = $event" />
        <app-table-filter label="Origen" [options]="opcionesOrigenFiltro" [value]="origenFiltro" (valueChange)="origenFiltro = $event" />
        <app-table-filter label="Destino" [options]="opcionesDestinoFiltro" [value]="destinoFiltro" (valueChange)="destinoFiltro = $event" />
        <input appEspera [(ngModel)]="busquedaFiltro" type="search" placeholder="Buscar ítem o justificación?" class="min-w-0 flex-1 basis-48 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
      </div>

      @if (loading) {
        <app-loading-skeleton variant="table" [rows]="6" [columns]="6" [showToolbar]="false" label="Cargando traslados" />
      } @else if (trasladosFiltrados.length === 0) {
        <app-empty-state titulo="No hay traslados que cumplan los filtros seleccionados." variante="busqueda" />
      } @else {
        <div class="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div class="space-y-3 p-3 md:hidden">
            @for (t of trasladosFiltrados; track t.id_traslado) {
              <article class="rounded-xl border border-gray-200 p-3 text-sm">
                <div class="flex items-start justify-between gap-3">
                  <strong class="text-gray-800">{{ descripcionTraslado(t) }}</strong>
                  <app-status-badge [value]="t.estado" />
                </div>
                <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt class="text-gray-500">Origen</dt><dd class="text-right text-gray-700">{{ nombreSitioTraslado(t.sitio_origen, t.id_sitio_origen) }}</dd>
                  <dt class="text-gray-500">Destino</dt><dd class="text-right text-gray-700">{{ nombreSitioTraslado(t.sitio_destino, t.id_sitio_destino) }}</dd>
                  <dt class="text-gray-500">Fecha</dt><dd class="text-right text-gray-700">{{ t.fecha_solicitud | date: 'short' }}</dd>
                </dl>
                <p class="mt-2 text-xs text-gray-500">{{ t.justificacion || 'Sin justificacion' }}</p>
                <div class="mt-3 flex flex-wrap justify-end gap-2">
                  <button (click)="verDetalle(t)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600">Ver</button>
                  @if (t.estado === 'PENDIENTE' && puedeAprobar && !esSolicitantePropio(t) && esResponsableDelSitio(t)) {
                    <button (click)="aprobar(t)" [disabled]="bodegaInactiva(t)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-green-200 text-green-700 disabled:opacity-40">Aprobar</button>
                  }
                  @if (t.estado === 'PENDIENTE' && puedeRechazar && !esSolicitantePropio(t) && esResponsableDelSitio(t)) {
                    <button (click)="abrirRechazar(t)" class="px-3 py-1.5 rounded-full text-xs font-semibold border border-red-200 text-red-600">Rechazar</button>
                  }
                </div>
              </article>
            }
          </div>
          <div class="hidden overflow-x-auto md:block">
          <table class="w-full text-sm">
            <thead class="bg-gray-50/80 text-gray-500 text-xs uppercase tracking-wide">
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
              @for (t of trasladosFiltrados; track t.id_traslado) {
                <tr class="hover:bg-gray-50/80 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ descripcionTraslado(t) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreSitioTraslado(t.sitio_origen, t.id_sitio_origen) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreSitioTraslado(t.sitio_destino, t.id_sitio_destino) }}</td>
                  <td class="px-4 py-3 text-gray-500 max-w-[200px] truncate">{{ t.justificacion ?? '—' }}</td>
                  <td class="px-4 py-3"><app-status-badge [value]="t.estado" /></td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ t.fecha_solicitud | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    @if (bodegaInactiva(t) && t.estado === 'PENDIENTE') {
                      <div class="mb-1.5 flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                        ⚠️ Origen o destino inactivo — no se puede aprobar
                      </div>
                    }
                    <div class="flex justify-end gap-2">
                      <button (click)="verDetalle(t)"
                        class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400 transition-colors">
                        Ver
                      </button>
                      @if (t.estado === 'PENDIENTE' && (puedeAprobar || puedeRechazar) && !esSolicitantePropio(t) && esResponsableDelSitio(t)) {
                        @if (puedeAprobar) {
                          <button (click)="aprobar(t)" [disabled]="bodegaInactiva(t)"
                            [title]="bodegaInactiva(t) ? 'Origen o destino inactivo — no se puede aprobar. Rechazá el traslado en su lugar.' : ''"
                            [style.opacity]="bodegaInactiva(t) ? 0.45 : 1" [style.cursor]="bodegaInactiva(t) ? 'not-allowed' : 'pointer'"
                            [style.backgroundColor]="bodegaInactiva(t) ? 'var(--surface3)' : 'var(--surface)'" [style.color]="bodegaInactiva(t) ? 'var(--text-faint)' : 'var(--ok-text)'" [style.borderColor]="bodegaInactiva(t) ? 'var(--border)' : 'var(--ok-border)'"
                            class="px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors">
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
      <div appDialog class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="detalleAbierto = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Detalle del traslado</h2>
            <button aria-label="Cerrar" (click)="detalleAbierto = false" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <dl class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Contenido</dt><dd class="text-gray-800 font-medium text-right">{{ descripcionTraslado(detalle) }}</dd></div>
            @if (detalle.lineas?.length) {
              <div class="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                @for (linea of detalle.lineas; track linea.id_traslado_linea) {
                  <div>{{ linea.tipo === 'LOTE' ? (linea.cantidad + ' × ' + (linea.lote?.producto?.nombre ?? linea.lote?.codigo_lote ?? 'Lote')) : (linea.item?.placa_sena || linea.item?.codigo_sku || 'Ítem') }}</div>
                }
              </div>
            } @else {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">SKU / Placa</dt><dd class="text-gray-800 font-mono text-right">{{ detalle.item?.placa_sena || detalle.item?.codigo_sku || '—' }}</dd></div>
            }
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Origen</dt><dd class="text-gray-800 text-right">{{ nombreSitioTraslado(detalle.sitio_origen, detalle.id_sitio_origen) }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Encargado del origen</dt><dd class="text-gray-800 text-right">{{ detalle.origen_responsable_nombre ?? (detalle.sitio_origen?.id_responsable ? 'No disponible' : 'sin responsable') }}</dd></div>
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
      <div appDialog class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="rechazarOpen = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-800">Rechazar traslado</h2>
            <button aria-label="Cerrar" (click)="rechazarOpen = false" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
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
      <div appDialog class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarCrear()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <nav aria-label="Migas de pan" class="mb-3 flex items-center gap-1.5 text-xs text-gray-500">
            <span>Materiales</span><span aria-hidden="true">/</span><span>Operación</span><span aria-hidden="true">/</span><span>Traslados</span><span aria-hidden="true">/</span><span aria-current="page" class="font-medium text-gray-700">Nuevo traslado</span>
          </nav>
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Nuevo traslado</h2>
            <button aria-label="Cerrar" (click)="cerrarCrear()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Agregar ítems al traslado</label>
              @if (opcionesItems().length) {
                <app-ss [options]="opcionesItems()" placeholder="Buscá por placa SENA, SKU o producto..."
                  [(ngModel)]="itemSeleccionadoId" (ngModelChange)="onItemSeleccionado($event)"></app-ss>
                <p class="text-xs text-gray-400 mt-1">Elegí uno o varios ítems devolutivos con placa SENA. Todos van a la misma bodega de destino.</p>
              } @else {
                <p class="text-xs text-gray-400">No hay ítems devolutivos con placa SENA. Asigná las placas desde el módulo de Ítems.</p>
              }
              @if (buscando) { <p class="text-gray-400 text-xs mt-1.5">Buscando...</p> }
              @if (errorBusqueda) { <p class="text-red-500 text-xs mt-1.5">{{ errorBusqueda }}</p> }
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Agregar lote de consumo o perecedero</label>
              <div class="flex gap-2">
                <app-ss class="min-w-0 flex-1" [options]="opcionesLotes()" placeholder="Seleccioná un lote..."
                  [(ngModel)]="loteSeleccionadoId" (ngModelChange)="onLoteSeleccionado()"></app-ss>
                <input type="number" min="1" [max]="cantidadMaximaLote()" [(ngModel)]="cantidadLote"
                  aria-label="Cantidad del lote"
                  class="w-20 rounded-lg border border-gray-200 px-2 text-sm" />
                <button type="button" (click)="agregarLote()"
                  [disabled]="!loteSeleccionadoId || cantidadLote < 1 || cantidadLote > cantidadMaximaLote()"
                  class="rounded-lg border border-green-600 px-3 text-sm font-medium text-green-700 disabled:opacity-40">Agregar</button>
              </div>
              <p class="mt-1 text-xs text-gray-400">Solo se pueden combinar líneas que salgan de la misma bodega.</p>
              @if (loteSeleccionadoId && cantidadLote > cantidadMaximaLote()) {
                <p class="mt-1 text-xs text-red-600">Máximo disponible para este lote: {{ cantidadMaximaLote() }}.</p>
              }
            </div>

            @if (itemsSeleccionados.length || lotesSeleccionados.length) {
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
                        <span class="block text-gray-500">Encargado: <span class="text-gray-800">{{ it.ubicacion?.responsable_nombre ?? (it.ubicacion?.id_responsable ? 'No disponible' : 'sin responsable') }}</span></span>
                        @if (it.novedad_activa) {
                          <span class="block text-amber-600">Tiene una novedad activa ({{ it.novedad_activa.tipo }})</span>
                        }
                        @if (fallidos[it.item.id_item]) {
                          <span class="block text-red-600 font-medium">⚠ {{ fallidos[it.item.id_item] }}</span>
                        }
                      </div>
                      <button aria-label="Quitar" type="button" data-dirty (click)="quitarItem(it.item.id_item)"
                        class="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 text-base leading-none">×</button>
                    </div>
                  </li>
                }
                @for (seleccion of lotesSeleccionados; track seleccion.lote.id_lote) {
                  <li class="px-3 py-2">
                    <div class="flex items-start justify-between gap-2">
                      <div>
                        <span class="font-semibold text-gray-800">{{ seleccion.lote.producto?.nombre ?? 'Lote' }}</span>
                        <span class="font-mono text-gray-500"> · {{ seleccion.lote.codigo_lote || 'Sin código' }}</span>
                        <span class="block text-gray-500">{{ seleccion.cantidad }} {{ seleccion.lote.unidad_medida || 'unidades' }} · sale de {{ nombreSitioTraslado(undefined, seleccion.lote.id_sitio || '') }}</span>
                      </div>
                      <button aria-label="Quitar lote" type="button" data-dirty (click)="quitarLote(seleccion.lote.id_lote)" class="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 text-base leading-none">×</button>
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
                  <p class="text-xs text-amber-600 mt-0.5">Faltan {{ 10 - justificacion.trim().length }} caracteres.</p>
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
              [disabled]="saving || (itemsSeleccionados.length + lotesSeleccionados.length) === 0 || !idSitioDestino || justificacion.trim().length < 10"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: var(--accent-brand)">
              {{ saving ? 'Guardando...' : 'Solicitar traslado' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MaterialesTrasladosComponent implements OnInit {
  /** Catálogos auxiliares de la pantalla: si uno falla se avisa, no se muestra vacío. */
  readonly secundarias = new CargasSecundarias();
  readonly recargar = (): void => void this.cargar();
  private readonly acceso = inject(MaterialesScreenPolicy);
  traslados: Traslado[] = [];
  estadoFiltro = '';
  origenFiltro = '';
  destinoFiltro = '';
  busquedaFiltro = '';
  readonly opcionesEstadoFiltro = [{ label: 'Todos los estados', value: '' }, { label: 'Pendiente', value: 'PENDIENTE' }, { label: 'Aprobado', value: 'APROBADO' }, { label: 'Rechazado', value: 'RECHAZADO' }];
  items: Item[] = [];
  lotes: Lote[] = [];
  sitios: Sitio[] = [];
  /** Sitios donde el usuario es responsable o líder de área; permite que la
   * misma UI sirva a administradores e instructores responsables. */
  misSitiosACargoIds = new Set<string>();
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
  /** Ítems agregados al traslado (masivo). */
  itemsSeleccionados: ItemDetalleBusqueda[] = [];
  lotesSeleccionados: { lote: Lote; cantidad: number }[] = [];
  loteSeleccionadoId: string | null = null;
  cantidadLote = 1;
  /** `id_item → motivo` de los que el backend rechazó. */
  fallidos: Record<string, string> = {};
  /** Ítem elegido en el selector con búsqueda (por placa/SKU). */
  itemSeleccionadoId: string | null = null;
  idSitioDestino: string | null = null;
  justificacion = '';

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
    private live: MaterialesLiveService,
    private destroyRef: DestroyRef,
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
      if (respOrigen === uid || (origenEsSolicitante && respDestino === uid)) return true;
      return this.misSitiosACargoIds.has(t.id_sitio_origen);
    }
    if (!respDestino || respDestino === uid) return true;
    return this.misSitiosACargoIds.has(t.id_sitio_destino);
  }

  /** Origen o destino ya no acepta aprobar (ver plan 2026-09-18) — deshabilita
   *  el botón con aviso, sin esperar el error del backend. Rechazar sigue
   *  funcionando siempre. */
  bodegaInactiva(t: Traslado): boolean {
    return t.sitio_origen?.estado === false || t.sitio_destino?.estado === false;
  }

  /** Banner general de la pantalla — lista todas las bodegas inactivas del
   *  tenant, no solo la de un traslado puntual (ver plan 2026-09-18). */
  bodegasInactivas(): Sitio[] {
    return this.sitios.filter((s) => !s.estado);
  }

  ngOnInit(): void {
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

  descripcionTraslado(traslado: Traslado): string {
    if (traslado.lineas?.length) {
      return traslado.lineas.map((linea) => linea.tipo === 'LOTE'
        ? `${linea.cantidad} × ${linea.lote?.producto?.nombre ?? linea.lote?.codigo_lote ?? 'Lote'}`
        : linea.item?.producto?.nombre ?? linea.item?.placa_sena ?? linea.item?.codigo_sku ?? 'Ítem',
      ).join(', ');
    }
    return traslado.item?.producto?.nombre ?? traslado.item?.placa_sena ?? traslado.item?.codigo_sku ?? '—';
  }

  get trasladosFiltrados(): Traslado[] {
    const texto = this.busquedaFiltro.trim().toLocaleLowerCase();
    return this.traslados.filter((traslado) => {
      if (this.estadoFiltro && traslado.estado !== this.estadoFiltro) return false;
      if (this.origenFiltro && traslado.id_sitio_origen !== this.origenFiltro) return false;
      if (this.destinoFiltro && traslado.id_sitio_destino !== this.destinoFiltro) return false;
      if (!texto) return true;
      return [
        traslado.item?.producto?.nombre,
        traslado.item?.placa_sena,
        traslado.item?.codigo_sku,
        traslado.justificacion,
        this.nombreSitioTraslado(traslado.sitio_origen, traslado.id_sitio_origen),
        this.nombreSitioTraslado(traslado.sitio_destino, traslado.id_sitio_destino),
      ].some((valor) => valor?.toLocaleLowerCase().includes(texto));
    });
  }

  get opcionesOrigenFiltro(): { label: string; value: string }[] {
    return [{ label: 'Todos los orígenes', value: '' }, ...this.sitiosOrigenFiltro.map((sitio) => ({ label: sitio.nombre, value: sitio.id }))];
  }

  get opcionesDestinoFiltro(): { label: string; value: string }[] {
    return [{ label: 'Todos los destinos', value: '' }, ...this.sitiosDestinoFiltro.map((sitio) => ({ label: sitio.nombre, value: sitio.id }))];
  }

  get sitiosOrigenFiltro(): { id: string; nombre: string }[] {
    return this.opcionesSitiosFiltro(this.traslados.map((traslado) => [traslado.id_sitio_origen, traslado.sitio_origen] as const));
  }

  get sitiosDestinoFiltro(): { id: string; nombre: string }[] {
    return this.opcionesSitiosFiltro(this.traslados.map((traslado) => [traslado.id_sitio_destino, traslado.sitio_destino] as const));
  }

  private opcionesSitiosFiltro(sitios: readonly (readonly [string, Sitio | undefined])[]): { id: string; nombre: string }[] {
    return [...new Map(sitios.map(([id, sitio]) => [id, this.nombreSitioTraslado(sitio, id)])).entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  verDetalle(t: Traslado): void {
    this.detalle = t;
    this.detalleAbierto = true;
  }

  /**
   * Opciones del selector: SOLO ítems devolutivos CON placa SENA — un traslado
   * cambia la ubicación física de una unidad identificable. Un consumible
   * (lote, ej. "pollo") se solicita para consumo, no se traslada; y un
   * devolutivo sin placa todavía no es rastreable como unidad. También se
   * descartan los ítems de un producto desactivado (soft-delete B1) — igual
   * que "Desactivar" ya los saca de las demás listas/selects, el backend
   * también los rechaza en `TrasladosService.validarItemTraslado` como
   * defensa en profundidad (por si se busca por placa a mano).
   */
  opcionesItems(): { value: string; label: string }[] {
    return this.items
      .filter((i) => !!i.placa_sena && i.producto?.tipo_material !== 'CONSUMO' && i.producto?.tipo_material !== 'PERECEDERO' && i.producto?.activo !== false && i.activo !== false)
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

  opcionesLotes(): { value: string; label: string }[] {
    const origenes = this.idsSitioOrigen;
    return this.lotes
      .filter((lote) => lote.estado === 'ACTIVO' && !!lote.id_sitio
        && lote.cantidad_disponible - (lote.cantidad_reservada ?? 0) > 0
        && !this.lotesSeleccionados.some((seleccion) => seleccion.lote.id_lote === lote.id_lote)
        && (origenes.size === 0 || origenes.has(lote.id_sitio!)))
      .map((lote) => ({
        value: lote.id_lote,
        label: `${lote.producto?.nombre ?? 'Lote'}${lote.codigo_lote ? ` · ${lote.codigo_lote}` : ''} (${lote.cantidad_disponible - (lote.cantidad_reservada ?? 0)} disponibles)`,
      }));
  }

  /** Saldo real: existencias del lote menos lo reservado en otros traslados pendientes. */
  cantidadMaximaLote(): number {
    const lote = this.lotes.find((actual) => actual.id_lote === this.loteSeleccionadoId);
    return lote ? Math.max(0, lote.cantidad_disponible - (lote.cantidad_reservada ?? 0)) : 0;
  }

  /** Un cambio de lote comienza en una unidad; no conserva un valor del lote anterior. */
  onLoteSeleccionado(): void {
    this.cantidadLote = 1;
  }

  agregarLote(): void {
    const lote = this.lotes.find((actual) => actual.id_lote === this.loteSeleccionadoId);
    const disponible = lote ? lote.cantidad_disponible - (lote.cantidad_reservada ?? 0) : 0;
    if (!lote || !Number.isInteger(this.cantidadLote) || this.cantidadLote < 1 || this.cantidadLote > disponible) {
      this.errorBusqueda = 'Indicá una cantidad válida dentro del saldo disponible del lote.';
      return;
    }
    this.lotesSeleccionados = [...this.lotesSeleccionados, { lote, cantidad: this.cantidadLote }];
    this.loteSeleccionadoId = null;
    this.cantidadLote = 1;
    this.errorBusqueda = null;
  }

  quitarLote(idLote: string): void {
    this.lotesSeleccionados = this.lotesSeleccionados.filter((seleccion) => seleccion.lote.id_lote !== idLote);
  }

  /** Bodegas de origen de los ítems agregados (el destino no puede ser una de ellas). */
  private get idsSitioOrigen(): Set<string> {
    return new Set(
      [
        ...this.itemsSeleccionados.map((i) => i.ubicacion?.id_sitio),
        ...this.lotesSeleccionados.map((seleccion) => seleccion.lote.id_sitio),
      ].filter((x): x is string => !!x),
    );
  }

  destinosDisponibles(): Sitio[] {
    return this.sitios.filter((s) => !this.idsSitioOrigen.has(s.id_sitio) && s.estado);
  }

  opcionesDestino(): { value: string; label: string }[] {
    return this.destinosDisponibles().map((s) => ({ value: s.id_sitio, label: `${s.nombre} (${s.tipo})` }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    this.secundarias.reiniciar();
    try {
      // M9 — solo `listarTraslados()` es crítico; una secundaria que falle no
      // debe tumbar la tabla entera (pero tampoco pasar por "no hay datos").
      const [traslados, items, lotes, sitios, sitiosACargo] = await Promise.all([
        this.api.listarTraslados(),
        this.secundarias.cargar('ítems', () => this.api.listarItems(), this.acceso.puedeListar('items')),
        this.secundarias.cargar('lotes', () => this.api.listarLotes(), this.acceso.puedeListar('lotes')),
        this.secundarias.cargar('bodegas', () => this.api.listarSitios(), this.acceso.puedeListar('sitios')),
        this.secundarias.cargar('bodegas a tu cargo', () => this.api.sitiosACargo()),
      ]);
      this.traslados = traslados;
      this.items = items;
      this.lotes = lotes;
      this.sitios = sitios;
      this.misSitiosACargoIds = new Set(sitiosACargo.map((s) => s.id_sitio));
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
    this.lotesSeleccionados = [];
    this.loteSeleccionadoId = null;
    this.cantidadLote = 1;
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
      this.errorBusqueda = mensajeDeError(e, `No se encontró ningún ítem con la placa "${placa}".`);
    } finally {
      this.buscando = false;
    }
  }

  async guardarTraslado(): Promise<void> {
    if ((this.itemsSeleccionados.length + this.lotesSeleccionados.length) === 0 || !this.idSitioDestino) return;
    if (this.justificacion.trim().length < 10) {
      this.error = 'La justificación es obligatoria (mín. 10 caracteres).';
      return;
    }
    this.saving = true;
    this.error = null;
    this.fallidos = {};
    try {
      await this.api.crearTraslado({
        lineas: [
          ...this.itemsSeleccionados.map((i) => ({ id_item: i.item.id_item })),
          ...this.lotesSeleccionados.map(({ lote, cantidad }) => ({ id_lote: lote.id_lote, cantidad })),
        ],
        id_sitio_destino: this.idSitioDestino,
        justificacion: this.justificacion.trim(),
      });
      this.toast.ok((this.itemsSeleccionados.length + this.lotesSeleccionados.length) > 1 ? 'Traslado solicitado' : 'Traslado solicitado');
      this.crearOpen = false;
      await this.cargar();
    } catch (e: any) {
      const fallidos = e?.error?.data?.fallidos as { id_item: string; motivo: string }[] | undefined;
      if (fallidos?.length) {
        this.fallidos = Object.fromEntries(fallidos.map((f) => [f.id_item, f.motivo]));
        this.error = mensajeDeError(e, 'Algunos ítems no se pueden trasladar. Revisá los marcados en rojo y quitalos.');
      } else {
        this.error = mensajeDeError(e, 'No se pudo crear el traslado.');
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
