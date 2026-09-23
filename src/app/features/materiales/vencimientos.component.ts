import { Component, ElementRef, HostListener, Injector, OnInit, WritableSignal, afterNextRender, effect, signal, viewChild, viewChildren } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { TableFilterComponent, TableFilterOption } from '../../shared/components/table-filter.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton.component';
import { FilaVencimiento, Lote, MaterialesApiService, Sitio } from './data-access/materiales-api.service';

const VENTANAS = [7, 15, 30] as const;

/**
 * #3 — Seguimiento de préstamos vencidos / por vencer.
 *
 * Lista las solicitudes ENTREGADA cuya `fecha_devolucion` ya pasó (vencidas) o
 * vence dentro de la ventana elegida (por vencer). El backend
 * (`GET /api2/solicitudes/vencimientos`) ya recorta por bodega/rol. Cuando el
 * material vuelve, la solicitud pasa a DEVUELTA y desaparece de acá sola.
 *
 * El aviso automático (notificación al solicitante y al responsable) lo manda
 * `VencimientosScheduler` en el backend, 1×/día — esta pantalla es la vista.
 *
 * Componente único para admin/instructor/aprendiz: la ruta se gatea con
 * `materiales.solicitudes.ver` (vía `serviciosRequeridos`). Única diferencia
 * de comportamiento por rol (2026-09-16, pedido explícito — "un instructor
 * normal no debería tener acceso a vencimientos de productos perecederos,
 * solo a los vencimientos de sus préstamos; igual con el aprendiz"): la
 * pestaña "Perecederos" (`listarLotes()`, sin scope de bodega/área — muestra
 * TODOS los lotes perecederos del tenant) solo se ofrece a quien tiene
 * `materiales.lotes.ver` (admin, encargado de bodega, líder de área). Un
 * instructor/aprendiz común ya no lo tiene por defecto desde el recorte de
 * esta misma sesión, así que directo no ve la pestaña ni se pide `/lotes` —
 * solo ve "Préstamos", scopeado en el backend (`obtenerVencimientos`) a:
 * propias + bodegas a cargo puntuales + TODAS las bodegas de su área si
 * pertenece a una (2026-09-18, pedido explícito — "solo visibilidad no
 * gestión": un líder de área ve acá los préstamos de toda su área, pero
 * aprobar/rechazar/entregar/cancelar sigue atado solo a `id_responsable`
 * puntual de la bodega, no al área).
 *
 * Remaster visual (2026-09-15, GSAP): este módulo concentra "cosas que se
 * vencen" de dos mundos distintos (lotes perecederos + préstamos), así que se
 * le dio tratamiento propio en vez de reusar `app-stat-card` genérico —
 * banner de alerta consolidado arriba de todo, tarjetas KPI con conteo
 * animado, control segmentado con indicador deslizante, y una barra de
 * urgencia (más llena cuanto más cerca está el vencimiento) tanto en las
 * tarjetas de lote como en las tablas de préstamos. Las animaciones de fila
 * usan `viewChildren` + `effect()` (signal queries de Angular 21): no hay que
 * orquestar el timing a mano, el efecto se re-dispara solo cuando el `@for`
 * agrega/saca elementos reales del DOM (filtro, cambio de ventana, carga
 * inicial). Los contadores (`cVencidosLotes`, etc.) son signals aparte de los
 * getters "de verdad" (`lotesVencidos.length`...) — se tween-ean con GSAP
 * sobre un proxy estable (`contadorProxy`) para que un segundo cambio de
 * filtro cancele limpio la cuenta anterior en vez de pisarla a los saltos.
 */
@Component({
  selector: 'app-materiales-vencimientos',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, TableFilterComponent, LoadingSkeletonComponent],
  styles: [
    `
      .urg-fill { transform-origin: left center; }
      .pill-indicator { will-change: transform, width; }
      @keyframes pulseDot { 0%, 100% { opacity: .85; transform: scale(1); } 50% { opacity: .25; transform: scale(1.6); } }
      .pulse-dot { animation: pulseDot 1.8s ease-in-out infinite; }
    `,
  ],
  template: `
    <div class="p-6">
      <div class="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-[#2d8000]">Control de inventario</p>
          <h1 class="text-2xl font-bold text-gray-900 mt-0.5">Vencimientos</h1>
          <p class="text-sm text-gray-400 mt-0.5">
            {{ vista() === 'perecederos' ? 'Lotes perecederos con fecha de vencimiento próxima o pasada.' : 'Préstamos entregados que deben devolverse.' }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-400">Ventana</span>
          <div class="pill-track relative inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5">
            <div #pill class="pill-indicator absolute top-0.5 bottom-0.5 left-0 rounded-full bg-white shadow-sm"></div>
            @for (v of ventanas; track v) {
              <button #ventanaBtn type="button" (click)="cambiarVentana(v)"
                class="relative z-10 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                [class.text-gray-800]="ventana() === v" [class.text-gray-400]="ventana() !== v">
                {{ v }} días
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Dos mundos distintos (lotes perecederos vs. préstamos) — separados en pestañas
           para no mezclarlos en una sola pantalla larga; "Ventana" arriba aplica a las dos.
           El toggle solo se ofrece a quien puede ver Perecederos (sin ese servicio, la
           pantalla entera es directo la vista de Préstamos, sin pestañas que elegir). -->
      @if (puedeVerPerecederos) {
        <div class="relative inline-flex rounded-2xl border border-gray-200 bg-gray-50 p-1 mb-6">
          <div #vistaPill class="pill-indicator absolute top-1 bottom-1 left-0 rounded-xl bg-white shadow-sm"></div>
          <button #vistaBtn type="button" (click)="cambiarVista('perecederos')"
            class="relative z-10 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            [class.text-gray-800]="vista() === 'perecederos'" [class.text-gray-400]="vista() !== 'perecederos'">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M8 5l8 4"/></svg>
            Perecederos
            @if (totalPerecederos > 0) {
              <span class="inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold"
                [class.bg-red-100]="lotesVencidos.length > 0" [class.text-red-700]="lotesVencidos.length > 0"
                [class.bg-amber-100]="lotesVencidos.length === 0" [class.text-amber-700]="lotesVencidos.length === 0">{{ totalPerecederos }}</span>
            }
          </button>
          <button #vistaBtn type="button" (click)="cambiarVista('prestamos')"
            class="relative z-10 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            [class.text-gray-800]="vista() === 'prestamos'" [class.text-gray-400]="vista() !== 'prestamos'">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Préstamos
            @if (totalPrestamos > 0) {
              <span class="inline-flex min-w-5 h-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold"
                [class.bg-red-100]="vencidas.length > 0" [class.text-red-700]="vencidas.length > 0"
                [class.bg-amber-100]="vencidas.length === 0" [class.text-amber-700]="vencidas.length === 0">{{ totalPrestamos }}</span>
            }
          </button>
        </div>
      }

      @if (!loading && totalUrgentes > 0) {
        <div class="relative overflow-hidden rounded-2xl mb-6 px-5 py-4 text-white shadow-sm"
             style="background: linear-gradient(135deg, #7f1d1d 0%, #b91c1c 55%, #dc2626 100%)">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="relative flex h-3 w-3 shrink-0">
                <span class="pulse-dot absolute inline-flex h-full w-full rounded-full bg-white"></span>
                <span class="relative inline-flex h-3 w-3 rounded-full bg-white"></span>
              </span>
              <div>
                <p class="text-sm font-bold leading-tight">
                  {{ totalUrgentes }} vencimiento{{ totalUrgentes === 1 ? '' : 's' }} {{ totalUrgentes === 1 ? 'necesita' : 'necesitan' }} atención hoy
                </p>
                <p class="text-xs text-white/80 mt-0.5">
                  @if (puedeVerPerecederos) {
                    {{ lotesVencidos.length }} lote{{ lotesVencidos.length === 1 ? '' : 's' }} perecedero{{ lotesVencidos.length === 1 ? '' : 's' }} vencido{{ lotesVencidos.length === 1 ? '' : 's' }}
                    ·
                  }
                  {{ vencidas.length }} préstamo{{ vencidas.length === 1 ? '' : 's' }} atrasado{{ vencidas.length === 1 ? '' : 's' }}
                </p>
              </div>
            </div>
            <div class="flex gap-2">
              @if (lotesVencidos.length > 0) {
                <button type="button" (click)="cambiarVista('perecederos')"
                  class="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/15 hover:bg-white/25 transition-colors whitespace-nowrap">
                  Ver perecederos
                </button>
              }
              @if (vencidas.length > 0) {
                <button type="button" (click)="cambiarVista('prestamos')"
                  class="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/15 hover:bg-white/25 transition-colors whitespace-nowrap">
                  Ver préstamos
                </button>
              }
            </div>
          </div>
        </div>
      }

      @if (loading) {
        <app-loading-skeleton variant="table" [rows]="6" [columns]="5" [showToolbar]="false" label="Cargando vencimientos" />
      } @else if (vista() === 'perecederos') {
        <!-- Productos perecederos: fecha real de vencimiento de cada lote. -->
        <section #seccionVista class="mb-9">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 class="text-sm font-bold text-gray-700">Productos perecederos</h2>
              <p class="text-xs text-gray-400 mt-0.5">Lotes activos con fecha de vencimiento registrada.</p>
            </div>
            <a routerLink="/materiales/lotes" class="text-xs font-semibold text-[#2d8000] hover:underline">Ver todos los lotes</a>
          </div>

          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div class="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div class="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-red-400 to-red-600"></div>
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400">Productos vencidos</p>
                  <p class="mt-1.5 text-3xl font-bold text-gray-900 tabular-nums">{{ cVencidosLotes() }}</p>
                  <p class="mt-1 text-xs text-gray-400">Lotes que requieren revisión</p>
                </div>
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.22-1.333-2.99 0L3.34 16c-.77 1.333.192 3 1.73 3z"/></svg>
                </div>
              </div>
            </div>
            <div class="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div class="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-300 to-amber-500"></div>
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400">Próximos a vencer</p>
                  <p class="mt-1.5 text-3xl font-bold text-gray-900 tabular-nums">{{ cPorVencerLotes() }}</p>
                  <p class="mt-1 text-xs text-gray-400">En los próximos {{ ventana() }} días</p>
                </div>
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
              </div>
            </div>
            <div class="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div class="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-sky-300 to-sky-500"></div>
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400">Productos afectados</p>
                  <p class="mt-1.5 text-3xl font-bold text-gray-900 tabular-nums">{{ cProductosRiesgo() }}</p>
                  <p class="mt-1 text-xs text-gray-400">Catálogos con al menos un lote</p>
                </div>
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M8 5l8 4"/></svg>
                </div>
              </div>
            </div>
            <div class="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div class="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-gray-300 to-gray-400"></div>
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400">Unidades en riesgo</p>
                  <p class="mt-1.5 text-3xl font-bold text-gray-900 tabular-nums">{{ cUnidadesRiesgo() }}</p>
                  <p class="mt-1 text-xs text-gray-400">Cantidad disponible por revisar</p>
                </div>
                <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
                  <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V7a2 2 0 00-2-2H6a2 2 0 00-2 2v6m16 0v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4m16 0H4m4 0h8"/></svg>
                </div>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 mb-4">
            <label class="relative flex-1 min-w-[220px]">
              <span class="sr-only">Buscar lote o producto</span>
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input [ngModel]="filtro" (ngModelChange)="onFiltro($event)" type="search" placeholder="Buscar por producto, SKU o código de lote"
                class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
            </label>
            <app-table-filter label="Bodega" [options]="opcionesSitioFiltro" [value]="sitioFiltro" (valueChange)="onSitio($event)" />
          </div>

          @if (lotesVencidos.length === 0 && lotesPorVencer.length === 0) {
            <div class="flex items-center gap-2.5 text-sm text-gray-400 bg-green-50/50 border border-green-100 rounded-xl px-4 py-3">
              <svg class="w-[18px] h-[18px] text-[#39A900] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              No hay lotes perecederos vencidos ni próximos a vencer en los próximos {{ ventana() }} días.
            </div>
          } @else {
            <div class="grid xl:grid-cols-2 gap-4">
              <div class="rounded-2xl border border-red-100 bg-red-50/30 overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 border-b border-red-100">
                  <span class="text-sm font-bold text-red-800">Vencidos</span>
                  <span class="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-100 px-1.5 text-[11px] font-bold text-red-700">{{ lotesVencidos.length }}</span>
                </div>
                @if (lotesVencidos.length === 0) {
                  <p class="px-4 py-5 text-sm text-gray-400">No hay lotes vencidos.</p>
                } @else {
                  <div class="divide-y divide-red-100">
                    @for (lote of lotesVencidos; track lote.id_lote) {
                      <a #filaLoteVencido routerLink="/materiales/lotes" [queryParams]="{ id_producto: lote.id_producto }" class="block px-4 py-3 hover:bg-white/70 transition-colors">
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0"><p class="font-semibold text-gray-800 truncate">{{ lote.producto?.nombre ?? 'Producto sin nombre' }}</p><p class="text-xs text-gray-500 mt-0.5">SKU: {{ lote.producto?.SKU || 'Sin SKU' }} · {{ lote.codigo_lote || 'Sin código de lote' }}</p></div>
                          <span class="shrink-0 rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">{{ diasTexto(lote) }}</span>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500"><span>Bodega: <b class="font-semibold text-gray-700">{{ nombreSitio(lote) }}</b></span><span>Stock: <b class="font-semibold text-gray-700">{{ lote.cantidad_disponible }} / {{ lote.cantidad_inicial }} {{ lote.producto?.unidad_medida || lote.unidad_medida || '' }}</b></span><span>Venció: <b class="font-semibold text-red-700">{{ lote.fecha_vencimiento | date: 'longDate' }}</b></span></div>
                        <div class="mt-2 h-1 rounded-full bg-red-100 overflow-hidden"><div class="urg-fill h-full rounded-full bg-red-500" style="width:100%"></div></div>
                      </a>
                    }
                  </div>
                }
              </div>

              <div class="rounded-2xl border border-amber-100 bg-amber-50/30 overflow-hidden">
                <div class="flex items-center justify-between px-4 py-3 border-b border-amber-100">
                  <span class="text-sm font-bold text-amber-800">Próximos a vencer</span>
                  <span class="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700">{{ lotesPorVencer.length }}</span>
                </div>
                @if (lotesPorVencer.length === 0) {
                  <p class="px-4 py-5 text-sm text-gray-400">No hay lotes próximos a vencer.</p>
                } @else {
                  <div class="divide-y divide-amber-100">
                    @for (lote of lotesPorVencer; track lote.id_lote) {
                      <a #filaLotePorVencer routerLink="/materiales/lotes" [queryParams]="{ id_producto: lote.id_producto }" class="block px-4 py-3 hover:bg-white/70 transition-colors">
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0"><p class="font-semibold text-gray-800 truncate">{{ lote.producto?.nombre ?? 'Producto sin nombre' }}</p><p class="text-xs text-gray-500 mt-0.5">SKU: {{ lote.producto?.SKU || 'Sin SKU' }} · {{ lote.codigo_lote || 'Sin código de lote' }}</p></div>
                          <span class="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">{{ diasTexto(lote) }}</span>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500"><span>Bodega: <b class="font-semibold text-gray-700">{{ nombreSitio(lote) }}</b></span><span>Stock: <b class="font-semibold text-gray-700">{{ lote.cantidad_disponible }} / {{ lote.cantidad_inicial }} {{ lote.producto?.unidad_medida || lote.unidad_medida || '' }}</b></span><span>Vence: <b class="font-semibold text-amber-700">{{ lote.fecha_vencimiento | date: 'longDate' }}</b></span></div>
                        <div class="mt-2 h-1 rounded-full bg-amber-100 overflow-hidden"><div class="urg-fill h-full rounded-full bg-amber-500" [style.width.%]="pctRestante(diasHastaVencimiento(lote))"></div></div>
                      </a>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </section>
      } @else {
        <!-- Préstamos por devolver: seguimiento de material entregado. -->
        <div #seccionVista>
        <div class="flex items-center gap-2 mb-3 pt-1">
          <h2 class="text-sm font-bold text-gray-700">Préstamos por devolver</h2>
          <span class="text-xs text-gray-400">Seguimiento de material entregado</span>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-7 max-w-lg">
          <div class="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <div class="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-red-400 to-red-600"></div>
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400">Vencidas</p>
                <p class="mt-1.5 text-3xl font-bold text-gray-900 tabular-nums">{{ cVencidasPrestamo() }}</p>
                <p class="mt-1 text-xs text-gray-400">Ya pasó la fecha de devolución</p>
              </div>
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              </div>
            </div>
          </div>
          <div class="relative overflow-hidden rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <div class="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-300 to-amber-500"></div>
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400">Por vencer</p>
                <p class="mt-1.5 text-3xl font-bold text-gray-900 tabular-nums">{{ cPorVencerPrestamo() }}</p>
                <p class="mt-1 text-xs text-gray-400">En los próximos {{ ventana() }} días</p>
              </div>
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
            </div>
          </div>
        </div>

        <!-- Vencidas -->
        <div class="flex items-center gap-2 mb-3">
          <h2 class="text-sm font-bold text-gray-700">Vencidas</h2>
          @if (vencidas.length > 0) {
            <span class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">{{ vencidas.length }}</span>
          }
        </div>

        @if (vencidas.length === 0) {
          <div class="flex items-center gap-2.5 text-sm text-gray-400 bg-gray-50/60 border border-gray-100 rounded-xl px-4 py-3 mb-8">
            <svg class="w-[18px] h-[18px] text-[#39A900] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Nada vencido por ahora.
          </div>
        } @else {
          <div class="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden mb-8">
            <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50/80 text-gray-500 text-[11px] uppercase tracking-wide">
                <tr>
                  <th class="px-4 py-3 text-left font-semibold">Producto</th>
                  <th class="px-4 py-3 text-left font-semibold">Solicitante</th>
                  <th class="px-4 py-3 text-left font-semibold">Bodega</th>
                  <th class="px-4 py-3 text-left font-semibold">Entregado</th>
                  <th class="px-4 py-3 text-left font-semibold">Vencía</th>
                  <th class="px-3 py-3 text-right font-semibold">Atraso</th>
                  <th class="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (f of vencidas; track f.id_solicitud) {
                  <tr #filaVencida class="hover:bg-gray-50/80 transition-colors">
                    <td class="px-4 py-3">
                      <div class="text-gray-800 font-medium">{{ f.producto_nombre }}</div>
                      <div class="text-[11px] text-gray-400">× {{ f.cantidad }}</div>
                    </td>
                    <td class="px-4 py-3 text-gray-600">{{ f.solicitante_nombre || '—' }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ f.bodega_nombre || '—' }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ f.fecha_entrega ? (f.fecha_entrega | date: 'shortDate') : '—' }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ f.fecha_devolucion | date: 'shortDate' }}</td>
                    <td class="px-3 py-3 text-right">
                      <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">{{ f.dias }} día{{ f.dias === 1 ? '' : 's' }}</span>
                      <div class="mt-1 h-1 w-14 rounded-full bg-red-100 overflow-hidden ml-auto"><div class="urg-fill h-full rounded-full bg-red-500" style="width:100%"></div></div>
                    </td>
                    <td class="px-4 py-3 text-right">
                      @if (puedeRegistrarDevolucion(f)) {
                        <a [routerLink]="rutaDevoluciones()" [queryParams]="{ id_solicitud: f.id_solicitud }"
                          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white transition-colors whitespace-nowrap hover:brightness-110"
                          style="background-color: #39A900">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                          Registrar devolución
                        </a>
                      } @else {
                        <span class="text-[11px] text-gray-400" [title]="'Solo ' + (f.responsable_nombre || 'el encargado de esa bodega') + ' puede registrar esta devolución'">
                          Fuera de tu bodega
                        </span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            </div>
          </div>
        }

        <!-- Por vencer -->
        <div class="flex items-center gap-2 mb-3">
          <h2 class="text-sm font-bold text-gray-700">Por vencer</h2>
          @if (porVencer.length > 0) {
            <span class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">{{ porVencer.length }}</span>
          }
        </div>

        @if (porVencer.length === 0) {
          <div class="flex items-center gap-2.5 text-sm text-gray-400 bg-gray-50/60 border border-gray-100 rounded-xl px-4 py-3">
            <svg class="w-[18px] h-[18px] text-[#39A900] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            Nada por vencer en los próximos {{ ventana() }} días.
          </div>
        } @else {
          <div class="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50/80 text-gray-500 text-[11px] uppercase tracking-wide">
                <tr>
                  <th class="px-4 py-3 text-left font-semibold">Producto</th>
                  <th class="px-4 py-3 text-left font-semibold">Solicitante</th>
                  <th class="px-4 py-3 text-left font-semibold">Bodega</th>
                  <th class="px-4 py-3 text-left font-semibold">Entregado</th>
                  <th class="px-4 py-3 text-left font-semibold">Vence</th>
                  <th class="px-3 py-3 text-right font-semibold">Faltan</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (f of porVencer; track f.id_solicitud) {
                  <tr #filaPorVencer class="hover:bg-gray-50/80 transition-colors">
                    <td class="px-4 py-3">
                      <div class="text-gray-800 font-medium">{{ f.producto_nombre }}</div>
                      <div class="text-[11px] text-gray-400">× {{ f.cantidad }}</div>
                    </td>
                    <td class="px-4 py-3 text-gray-600">{{ f.solicitante_nombre || '—' }}</td>
                    <td class="px-4 py-3 text-gray-600">{{ f.bodega_nombre || '—' }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ f.fecha_entrega ? (f.fecha_entrega | date: 'shortDate') : '—' }}</td>
                    <td class="px-4 py-3 text-gray-500">{{ f.fecha_devolucion | date: 'shortDate' }}</td>
                    <td class="px-3 py-3 text-right">
                      <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{{ f.dias }} día{{ f.dias === 1 ? '' : 's' }}</span>
                      <div class="mt-1 h-1 w-14 rounded-full bg-amber-100 overflow-hidden ml-auto"><div class="urg-fill h-full rounded-full bg-amber-500" [style.width.%]="pctRestante(f.dias)"></div></div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            </div>
          </div>
        }
        </div>
      }
    </div>
  `,
})
export class MaterialesVencimientosComponent implements OnInit {
  readonly ventanas = VENTANAS;
  ventana = signal<(typeof VENTANAS)[number]>(7);
  /** Admin, encargado de bodega o líder de área — los únicos con visibilidad
   *  real (sin scope de bodega/área) sobre TODOS los lotes perecederos.
   *  Asignado en el constructor, no como inicializador de campo: depende de
   *  `this.auth`, que recién existe una vez asignada la propiedad de
   *  parámetro del constructor. */
  puedeVerPerecederos = false;
  /** Perecederos y préstamos son dos mundos de datos distintos — separados en pestañas para no mezclarlos. */
  vista = signal<'perecederos' | 'prestamos'>('prestamos');
  loading = false;
  vencidas: FilaVencimiento[] = [];
  porVencer: FilaVencimiento[] = [];
  lotes: Lote[] = [];
  sitios: Sitio[] = [];
  filtro = '';
  sitioFiltro = '';

  /** Contadores animados (count-up con GSAP) de las tarjetas KPI. */
  cVencidosLotes = signal(0);
  cPorVencerLotes = signal(0);
  cProductosRiesgo = signal(0);
  cUnidadesRiesgo = signal(0);
  cVencidasPrestamo = signal(0);
  cPorVencerPrestamo = signal(0);

  /**
   * Un solo objeto estable por contador — GSAP necesita tweenear siempre la
   * MISMA referencia para que su `overwrite` automático cancele limpio el
   * tween anterior cuando el usuario cambia el filtro dos veces seguido en
   * menos de medio segundo. Si se creara un objeto nuevo en cada llamada,
   * los tweens viejo y nuevo correrían en paralelo y el número final
   * "temblaría" en vez de converger derecho al valor correcto.
   */
  private readonly contadorProxy = {
    vencidosLotes: 0,
    porVencerLotes: 0,
    productosRiesgo: 0,
    unidadesRiesgo: 0,
    vencidasPrestamo: 0,
    porVencerPrestamo: 0,
  };

  private readonly pill = viewChild<ElementRef<HTMLDivElement>>('pill');
  private readonly ventanaBtns = viewChildren<ElementRef<HTMLButtonElement>>('ventanaBtn');
  private readonly vistaPill = viewChild<ElementRef<HTMLDivElement>>('vistaPill');
  private readonly vistaBtns = viewChildren<ElementRef<HTMLButtonElement>>('vistaBtn');
  private readonly seccionVista = viewChild<ElementRef<HTMLElement>>('seccionVista');
  private readonly filasLoteVencido = viewChildren<ElementRef<HTMLElement>>('filaLoteVencido');
  private readonly filasLotePorVencer = viewChildren<ElementRef<HTMLElement>>('filaLotePorVencer');
  private readonly filasVencida = viewChildren<ElementRef<HTMLElement>>('filaVencida');
  private readonly filasPorVencer = viewChildren<ElementRef<HTMLElement>>('filaPorVencer');
  private pillListo = false;
  private vistaPillListo = false;
  private seccionListo = false;

  /**
   * "Registrar devolución" es un link fijo — pero la pantalla de destino está
   * triplicada por cargo (`/materiales/devoluciones` es admin-only vía
   * `roleGuard`, ver materiales.routes.ts). Antes apuntaba siempre a la ruta
   * de admin: un instructor/aprendiz que la clickeaba pasaba el guard con
   * `roles` rechazado → `roleGuard` redirige a `/`, que en la app de tenant
   * ES el login (no un home) — parecía un logout aunque la sesión seguía
   * viva. Bug reportado 2026-09-21.
   */
  rutaDevoluciones(): string {
    if (this.auth.isAdmin()) return '/materiales/devoluciones';
    if (this.auth.cargo() === 'instructor') return '/instructor/materiales/devoluciones';
    return '/aprendiz/materiales/devoluciones';
  }

  /**
   * Vencimientos ensancha la VISIBILIDAD a toda el área del líder, pero no
   * todas esas filas se pueden gestionar desde acá — antes el botón se
   * ofrecía siempre, y quien no podía gestionar esa bodega llegaba a
   * Devoluciones sin poder hacer nada con esa solicitud (bug relacionado,
   * reportado 2026-09-21). `puede_gestionar_devolucion` ya viene resuelto
   * por el backend (responsable puntual, líder del área de esa bodega, o
   * admin — `SitiosACargoService`), no se replica la regla acá.
   */
  puedeRegistrarDevolucion(f: FilaVencimiento): boolean {
    return f.puede_gestionar_devolucion;
  }

  constructor(
    private api: MaterialesApiService,
    private auth: AuthService,
    private toast: ToastService,
    private injector: Injector,
  ) {
    this.puedeVerPerecederos = this.auth.tieneServicio('materiales.lotes.ver');
    this.vista.set(this.puedeVerPerecederos ? 'perecederos' : 'prestamos');

    // El indicador deslizante del segmentado "Ventana" sigue al botón activo.
    // Sin animar en el primer render (pillListo=false): que aparezca ya en su
    // sitio, no deslizando desde la esquina.
    effect(() => {
      const btns = this.ventanaBtns();
      const idx = this.ventanas.indexOf(this.ventana());
      if (btns.length) {
        this.moverPill(this.pill()?.nativeElement, btns[idx]?.nativeElement, this.pillListo);
        this.pillListo = true;
      }
    });

    // Mismo mecanismo para el toggle "Perecederos / Préstamos".
    effect(() => {
      const btns = this.vistaBtns();
      const idx = this.vista() === 'perecederos' ? 0 : 1;
      if (btns.length) {
        this.moverPill(this.vistaPill()?.nativeElement, btns[idx]?.nativeElement, this.vistaPillListo);
        this.vistaPillListo = true;
      }
    });

    // Al cambiar de pestaña, la sección que entra hace un fade+slide corto
    // (no en el primer render — ahí ya la maneja la entrada escalonada de
    // sus propias filas).
    effect(() => {
      const el = this.seccionVista()?.nativeElement;
      this.vista();
      if (el) {
        if (this.seccionListo) gsap.fromTo(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
        this.seccionListo = true;
      }
    });

    // Entrada escalonada de filas — cada efecto se re-dispara solo cuando el
    // `@for` correspondiente cambia de verdad (carga inicial, cambio de
    // ventana, o un filtro que agrega/saca elementos), no en cada tecla.
    effect(() => this.animarGrupo(this.filasLoteVencido()));
    effect(() => this.animarGrupo(this.filasLotePorVencer()));
    effect(() => this.animarGrupo(this.filasVencida()));
    effect(() => this.animarGrupo(this.filasPorVencer()));
  }

  @HostListener('window:resize')
  onResize(): void {
    const idxVentana = this.ventanas.indexOf(this.ventana());
    this.moverPill(this.pill()?.nativeElement, this.ventanaBtns()[idxVentana]?.nativeElement, false);
    const idxVista = this.vista() === 'perecederos' ? 0 : 1;
    this.moverPill(this.vistaPill()?.nativeElement, this.vistaBtns()[idxVista]?.nativeElement, false);
  }

  ngOnInit(): void {
    this.cargar();
  }

  cambiarVentana(v: (typeof VENTANAS)[number]): void {
    if (v === this.ventana()) return;
    this.ventana.set(v);
    this.cargar();
  }

  cambiarVista(v: 'perecederos' | 'prestamos'): void {
    this.vista.set(v);
  }

  onFiltro(v: string): void {
    this.filtro = v;
    this.recalcularContadores();
  }

  onSitio(v: string): void {
    this.sitioFiltro = v;
    this.recalcularContadores();
  }

  get totalUrgentes(): number {
    return this.lotesVencidos.length + this.vencidas.length;
  }

  get totalPerecederos(): number {
    return this.lotesVencidos.length + this.lotesPorVencer.length;
  }

  get totalPrestamos(): number {
    return this.vencidas.length + this.porVencer.length;
  }

  get lotesVencidos(): Lote[] {
    return this.lotesFiltrados
      .filter((l) => this.diasHastaVencimiento(l) < 0)
      .sort((a, b) => this.diasHastaVencimiento(a) - this.diasHastaVencimiento(b));
  }

  get lotesPorVencer(): Lote[] {
    return this.lotesFiltrados
      .filter((l) => {
        const dias = this.diasHastaVencimiento(l);
        return dias >= 0 && dias <= this.ventana();
      })
      .sort((a, b) => this.diasHastaVencimiento(a) - this.diasHastaVencimiento(b));
  }

  get productosEnRiesgo(): number {
    return new Set([...this.lotesVencidos, ...this.lotesPorVencer].map((l) => l.id_producto)).size;
  }

  get unidadesEnRiesgo(): number {
    return [...this.lotesVencidos, ...this.lotesPorVencer]
      .reduce((total, lote) => total + Math.max(0, Number(lote.cantidad_disponible) || 0), 0);
  }

  get sitiosConLotes(): Sitio[] {
    const ids = new Set(this.lotes.map((l) => l.id_sitio).filter((id): id is string => !!id));
    return this.sitios.filter((s) => ids.has(s.id_sitio));
  }

  get opcionesSitioFiltro(): TableFilterOption[] {
    return [
      { value: '', label: 'Todas las bodegas' },
      ...this.sitiosConLotes.map((s) => ({ value: s.id_sitio, label: s.nombre })),
    ];
  }

  private get lotesFiltrados(): Lote[] {
    const texto = this.filtro.trim().toLocaleLowerCase();
    return this.lotes.filter((lote) => {
      if (this.sitioFiltro && lote.id_sitio !== this.sitioFiltro) return false;
      if (!texto) return true;
      const contenido = [
        lote.producto?.nombre,
        lote.producto?.SKU,
        lote.codigo_lote,
        this.nombreSitio(lote),
      ].filter(Boolean).join(' ').toLocaleLowerCase();
      return contenido.includes(texto);
    });
  }

  nombreSitio(lote: Lote): string {
    return this.sitios.find((s) => s.id_sitio === lote.id_sitio)?.nombre ?? 'Sin bodega';
  }

  diasTexto(lote: Lote): string {
    const dias = this.diasHastaVencimiento(lote);
    const cantidad = Math.abs(dias);
    const unidad = cantidad === 1 ? 'día' : 'días';
    return dias < 0 ? `Hace ${cantidad} ${unidad}` : dias === 0 ? 'Vence hoy' : `${cantidad} ${unidad}`;
  }

  diasHastaVencimiento(lote: Lote): number {
    const valor = lote.fecha_vencimiento?.slice(0, 10);
    if (!valor) return Number.POSITIVE_INFINITY;
    const [anio, mes, dia] = valor.split('-').map(Number);
    const vencimiento = new Date(anio, mes - 1, dia);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.round((vencimiento.getTime() - hoy.getTime()) / 86_400_000);
  }

  /** % de llenado de la barra de urgencia para algo que vence en `dias` días (más cerca = más lleno). */
  pctRestante(dias: number): number {
    const v = this.ventana();
    if (v <= 0) return 100;
    return Math.max(6, Math.min(100, Math.round(((v - dias) / v) * 100)));
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [r, lotes, sitios] = await Promise.all([
        this.api.vencimientosSolicitudes(this.ventana()),
        this.puedeVerPerecederos
          ? this.api.listarLotes().catch(() => [] as Lote[])
          : Promise.resolve([] as Lote[]),
        this.puedeVerPerecederos
          ? this.api.listarSitios().catch(() => [] as Sitio[])
          : Promise.resolve([] as Sitio[]),
      ]);
      this.vencidas = r.vencidas;
      this.porVencer = r.por_vencer;
      // Solo los lotes perecederos activos son inventario que puede vencer.
      this.lotes = lotes.filter(
        (l) => l.estado === 'ACTIVO' && l.producto?.tipo_material === 'PERECEDERO' && !!l.fecha_vencimiento,
      );
      this.sitios = sitios;
      this.recalcularContadores(true);
      // El badge del toggle "Perecederos/Préstamos" puede cambiar recién acá
      // (los contadores son getters planos, no señales, así que el `effect()`
      // que posiciona el indicador no tiene forma de saber que debe
      // remedirse). `afterNextRender` espera a que Angular termine de pintar
      // el badge en el DOM antes de remedir — un `effect()` disparado por una
      // señal auxiliar corre en paralelo a esa pintura y a veces medía el
      // ancho viejo (carrera real, confirmada con logging).
      afterNextRender(() => this.reposicionarVistaPill(), { injector: this.injector });
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el seguimiento de vencimientos.');
    } finally {
      this.loading = false;
    }
  }

  private recalcularContadores(animar = true): void {
    this.tweenContador('vencidosLotes', this.cVencidosLotes, this.lotesVencidos.length, animar);
    this.tweenContador('porVencerLotes', this.cPorVencerLotes, this.lotesPorVencer.length, animar);
    this.tweenContador('productosRiesgo', this.cProductosRiesgo, this.productosEnRiesgo, animar);
    this.tweenContador('unidadesRiesgo', this.cUnidadesRiesgo, this.unidadesEnRiesgo, animar);
    this.tweenContador('vencidasPrestamo', this.cVencidasPrestamo, this.vencidas.length, animar);
    this.tweenContador('porVencerPrestamo', this.cPorVencerPrestamo, this.porVencer.length, animar);
  }

  private tweenContador(
    prop: keyof typeof this.contadorProxy,
    sig: WritableSignal<number>,
    target: number,
    animar: boolean,
  ): void {
    if (!animar) {
      this.contadorProxy[prop] = target;
      sig.set(target);
      return;
    }
    const vars: Record<string, unknown> = {
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => sig.set(Math.round(this.contadorProxy[prop])),
    };
    vars[prop] = target;
    gsap.to(this.contadorProxy, vars);
  }

  /** Posiciona (o desliza) el indicador de un segmentado sobre su botón activo — reusado por "Ventana" y "Vista". */
  private moverPill(pillEl: HTMLElement | undefined, btn: HTMLElement | undefined, animar: boolean): void {
    if (!pillEl || !btn) return;
    const vars = { x: btn.offsetLeft, width: btn.offsetWidth };
    if (animar) gsap.to(pillEl, { ...vars, duration: 0.35, ease: 'power3.out' });
    else gsap.set(pillEl, vars);
  }

  /** Remide el indicador del toggle "Perecederos/Préstamos" contra el ancho
   *  ACTUAL del botón activo — se llama después de que `cargar()` termina
   *  (vía `afterNextRender`, ya con el badge pintado en el DOM) para que el
   *  indicador cubra el badge de contador recién aparecido. Sin animación:
   *  es una corrección de medición, no un cambio de pestaña real. */
  private reposicionarVistaPill(): void {
    const btns = this.vistaBtns();
    if (!btns.length) return;
    const idx = this.vista() === 'perecederos' ? 0 : 1;
    this.moverPill(this.vistaPill()?.nativeElement, btns[idx]?.nativeElement, false);
  }

  /** Entrada escalonada (fade + slide) de un grupo de filas, más el crecimiento de su barra de urgencia. */
  private animarGrupo(refs: readonly ElementRef<HTMLElement>[]): void {
    if (!refs.length) return;
    const rows = refs.map((r) => r.nativeElement);
    const bars = rows.flatMap((r) => Array.from(r.querySelectorAll<HTMLElement>('.urg-fill')));
    const tl = gsap.timeline();
    tl.fromTo(rows, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.045, overwrite: true });
    if (bars.length) {
      tl.fromTo(bars, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power2.out', stagger: 0.045 }, '<0.1');
    }
  }
}
