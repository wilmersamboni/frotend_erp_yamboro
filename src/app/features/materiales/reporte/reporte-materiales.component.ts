import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TableFilterComponent, TableFilterOption } from '../../../shared/components/table-filter.component';
import { ToastService } from '../../../core/services/toast.service';
import { ExportService } from '../../../core/services/export.service';
import {
  MaterialesApiService,
  OrigenResponsable,
  ReporteLote,
  ReporteMateriales,
  ReporteUnidad,
} from '../data-access/materiales-api.service';
import {
  ESTADOS_NOVEDAD,
  ETIQUETA_ESTADO,
  ETIQUETA_ORIGEN,
  ETIQUETA_TIPO_SITIO,
  FILTROS_VACIOS,
  FiltrosReporte,
  GrupoResponsable,
  GrupoUbicacion,
  SIN_SITIO,
  agruparPorResponsable,
  agruparPorUbicacion,
  describirFiltros,
  devolucionVencida,
  diasEntre,
  fechaCorta,
  filtrarReporte,
  hoyIso,
  resumir,
} from './reporte-materiales.util';

type Vista = 'responsables' | 'ubicaciones' | 'unidades' | 'consumibles';

const POR_PAGINA = 50;
/** Unidades que se listan dentro de una tarjeta expandida (el resto, en la vista Unidades). */
const MAX_EN_TARJETA = 12;

/**
 * Reporte de materiales (2026-10-02): cuántos hay, dónde están, en qué estado
 * y quién responde por cada uno. Responsable = quien lo tiene prestado (solicitud
 * entregada), el instructor líder de la ficha a la que se asignó, o si no el
 * responsable del sitio donde está (bodega o ambiente). Ver
 * `GET /api2/existencias/reporte` y `resolverResponsable` en el backend.
 * El alcance lo recorta el backend: admin ve todo el centro; un líder de área,
 * sus áreas; un encargado, sus bodegas y las públicas.
 */
@Component({
  selector: 'app-reporte-materiales',
  standalone: true,
  imports: [FormsModule, TableFilterComponent],
  template: `
    <div class="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <!-- Encabezado -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <nav aria-label="Migas de pan" class="mb-1 text-xs" style="color: var(--text-muted)">Materiales / Inventario</nav>
          <h1 class="text-xl font-bold" style="color: var(--text)">Reporte de materiales</h1>
          <p class="text-sm mt-0.5" style="color: var(--text-muted)">Qué hay, dónde está, en qué estado y quién responde por cada material.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          @if (datos(); as d) {
            <span class="text-xs mr-1" style="color: var(--text-faint)">Actualizado {{ horaGenerado(d.generado) }}</span>
          }
          <button type="button" (click)="cargar()" [disabled]="cargando()" class="btn-sec" aria-label="Actualizar">
            <svg class="w-4 h-4" [class.animate-spin]="cargando()" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          </button>
          <button type="button" (click)="exportar('excel')" [disabled]="!datos() || exportando()" class="btn-sec">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18M10 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
            {{ exportando() === 'excel' ? 'Generando…' : 'Excel' }}
          </button>
          <button type="button" (click)="exportar('pdf')" [disabled]="!datos() || exportando()" class="btn-pri">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V8l-6-6H6a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            {{ exportando() === 'pdf' ? 'Generando…' : 'PDF' }}
          </button>
        </div>
      </div>

      @if (cargando() && !datos()) {
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
          @for (i of [1, 2, 3, 4, 5]; track i) { <div class="h-24 rounded-2xl animate-pulse" style="background: var(--surface2)"></div> }
        </div>
        <div class="h-64 rounded-2xl animate-pulse" style="background: var(--surface2)"></div>
      } @else if (error()) {
        <div class="card p-8 text-center">
          <p class="text-sm font-medium" style="color: var(--err-text)">{{ error() }}</p>
          <button type="button" (click)="cargar()" class="btn-sec mt-3 mx-auto">Reintentar</button>
        </div>
      } @else if (datos()) {
        <!-- Cifras -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div class="card p-4">
            <p class="kpi-label">Unidades</p>
            <p class="kpi-valor">{{ n(resumen().unidades) }}</p>
            <p class="kpi-det">{{ n(resumen().disponibles) }} disponibles</p>
          </div>
          <div class="card p-4">
            <p class="kpi-label">Prestadas o en ficha</p>
            <p class="kpi-valor" style="color: var(--info-text)">{{ n(resumen().prestadas) }}</p>
            <p class="kpi-det" [style.color]="resumen().devolucionesVencidas ? 'var(--warn-text)' : null">
              {{ resumen().devolucionesVencidas ? resumen().devolucionesVencidas + ' con devolución vencida' : 'al día' }}
            </p>
          </div>
          <div class="card p-4">
            <p class="kpi-label">Con novedad</p>
            <p class="kpi-valor" [style.color]="resumen().novedad ? 'var(--err-text)' : null">{{ n(resumen().novedad) }}</p>
            <p class="kpi-det">dañadas, perdidas o en mantenimiento</p>
          </div>
          <div class="card p-4">
            <p class="kpi-label">Consumibles</p>
            <p class="kpi-valor">{{ n(resumen().lotes) }}</p>
            <p class="kpi-det">lotes de {{ n(resumen().productosConsumibles) }} productos</p>
          </div>
          <div class="card p-4 col-span-2 lg:col-span-1">
            <p class="kpi-label">Responsables</p>
            <p class="kpi-valor">{{ n(resumen().responsables) }}</p>
            <p class="kpi-det">en {{ n(resumen().ubicaciones) }} ubicaciones</p>
          </div>
        </div>

        <!-- Avisos -->
        @if (resumenTotal().sinResponsable) {
          <div class="aviso" style="background: var(--err-bg); border-color: var(--err-border); color: var(--err-text)">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"/></svg>
            <p class="text-sm flex-1"><strong>{{ resumenTotal().sinResponsable }} materiales no tienen responsable</strong>: están en sitios sin responsable asignado. Asígnelo en Sitios para que alguien responda por ellos.</p>
            <button type="button" class="aviso-btn" (click)="verSinResponsable()">Ver cuáles</button>
          </div>
        }
        @if (resumenTotal().devolucionesVencidas) {
          <div class="aviso" style="background: var(--warn-bg); border-color: var(--warn-border); color: var(--warn-text)">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <p class="text-sm flex-1"><strong>{{ resumenTotal().devolucionesVencidas }} unidades</strong> debían haberse devuelto ya.</p>
            <button type="button" class="aviso-btn" (click)="verVencidas()">Ver cuáles</button>
          </div>
        }

        <!-- Filtros -->
        <div class="card p-3 flex flex-wrap items-center gap-2">
          <div class="relative flex-1 min-w-[220px]">
            <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style="color: var(--text-faint)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
            <input type="search" [ngModel]="filtros().q" (ngModelChange)="setFiltro('q', $event)"
              placeholder="Buscar producto, placa, responsable, cédula, UNSPSC…"
              class="w-full pl-9 pr-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-[#39A900]/30"
              style="background: var(--surface); border-color: var(--border); color: var(--text)" />
          </div>
          <app-table-filter label="Ubicación" [options]="opcionesSitio()" [value]="filtros().sitio" (valueChange)="setFiltro('sitio', $event)" />
          <app-table-filter label="Tipo" [options]="opcionesTipoSitio" [value]="filtros().tipoSitio" (valueChange)="setFiltro('tipoSitio', $event)" />
          <app-table-filter label="Estado" [options]="opcionesEstado" [value]="filtros().estado" (valueChange)="setFiltro('estado', $event)" />
          <app-table-filter label="Responde por" [options]="opcionesOrigen" [value]="filtros().origen" (valueChange)="setOrigen($event)" />
          @if (hayFiltros()) {
            <button type="button" (click)="limpiarFiltros()" class="text-xs font-semibold px-2 py-1 rounded-lg hover:underline" style="color: var(--accent-text)">Limpiar filtros</button>
          }
        </div>

        <!-- Vistas -->
        <div class="flex gap-1 p-1 rounded-xl w-full sm:w-fit overflow-x-auto" style="background: var(--surface2)" role="tablist">
          @for (v of vistas(); track v.id) {
            <button type="button" role="tab" [attr.aria-selected]="vista() === v.id" (click)="cambiarVista(v.id)"
              class="px-3.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
              [style.background]="vista() === v.id ? 'var(--surface)' : 'transparent'"
              [style.color]="vista() === v.id ? 'var(--text)' : 'var(--text-muted)'"
              [class.shadow-sm]="vista() === v.id">
              {{ v.label }} <span class="ml-1 text-xs" style="color: var(--text-faint)">{{ v.n }}</span>
            </button>
          }
        </div>

        @switch (vista()) {
          <!-- ── Por responsable ── -->
          @case ('responsables') {
            @if (!porResponsable().length) { <div class="card p-10 text-center text-sm" style="color: var(--text-muted)">No hay materiales con estos filtros.</div> }
            <div class="space-y-2">
              @for (g of porResponsable(); track g.clave) {
                <div class="card overflow-hidden" [style.border-color]="g.sinResponsable ? 'var(--err-border)' : null">
                  <button type="button" (click)="alternar(g.clave)" [attr.aria-expanded]="abierto(g.clave)"
                    class="w-full flex flex-wrap sm:flex-nowrap items-center gap-3 p-3.5 text-left hover:bg-black/[0.02]">
                    <span class="w-10 h-10 shrink-0 rounded-full grid place-items-center text-sm font-bold"
                      [style.background]="g.sinResponsable ? 'var(--err-bg)' : 'var(--accent-soft)'"
                      [style.color]="g.sinResponsable ? 'var(--err-text)' : 'var(--accent-text)'">{{ g.sinResponsable ? '!' : iniciales(g.nombre) }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm font-semibold truncate" [style.color]="g.sinResponsable ? 'var(--err-text)' : 'var(--text)'">{{ g.nombre }}</span>
                      <span class="block text-xs truncate" style="color: var(--text-muted)">
                        @if (g.documento) { C.C. {{ g.documento }} · }{{ g.motivos.join(' · ') }}
                      </span>
                    </span>
                    <span class="flex items-center gap-4 text-center ml-auto">
                      <span><span class="block text-base font-bold" style="color: var(--text)">{{ g.unidades.length }}</span><span class="block text-[11px]" style="color: var(--text-faint)">unidades</span></span>
                      @if (g.enPrestamo) {
                        <span><span class="block text-base font-bold" [style.color]="g.devolucionesVencidas ? 'var(--warn-text)' : 'var(--info-text)'">{{ g.enPrestamo }}</span><span class="block text-[11px]" style="color: var(--text-faint)">{{ g.devolucionesVencidas ? g.devolucionesVencidas + ' vencidas' : 'prestadas' }}</span></span>
                      }
                      @if (g.lotes.length) {
                        <span><span class="block text-base font-bold" style="color: var(--text)">{{ g.lotes.length }}</span><span class="block text-[11px]" style="color: var(--text-faint)">lotes</span></span>
                      }
                      <svg class="w-4 h-4 transition-transform" [class.rotate-180]="abierto(g.clave)" style="color: var(--text-faint)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </span>
                  </button>
                  @if (abierto(g.clave)) {
                    <div class="border-t px-3.5 py-3 space-y-2" style="border-color: var(--border); background: var(--surface2)">
                      <div class="flex flex-wrap gap-1.5">
                        @for (e of estadosDe(g.porEstado); track e.estado) {
                          <span class="chip" [style.background]="colorEstado(e.estado).bg" [style.color]="colorEstado(e.estado).tx">{{ e.n }} {{ etiquetaEstado(e.estado).toLowerCase() }}</span>
                        }
                      </div>
                      <ul class="divide-y" style="border-color: var(--border)">
                        @for (u of g.unidades.slice(0, maxTarjeta); track u.id_item) {
                          <li class="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm">
                            <span class="font-mono text-xs px-1.5 py-0.5 rounded" style="background: var(--surface); color: var(--text-2)">{{ u.placa_sena || u.codigo_sku || 'Sin placa' }}</span>
                            <span class="font-medium" style="color: var(--text)">{{ u.producto }}</span>
                            <span class="chip" [style.background]="colorEstado(u.estado).bg" [style.color]="colorEstado(u.estado).tx">{{ etiquetaEstado(u.estado) }}</span>
                            <span class="text-xs ml-auto" [style.color]="vencida(u) ? 'var(--warn-text)' : 'var(--text-muted)'">{{ detalleResponsable(u) }}</span>
                          </li>
                        }
                        @for (l of g.lotes.slice(0, maxTarjeta); track l.id_lote) {
                          <li class="flex flex-wrap items-center gap-x-3 py-2 text-sm">
                            <span class="chip" style="background: var(--violet-bg); color: var(--violet-text)">Lote</span>
                            <span class="font-medium" style="color: var(--text)">{{ l.producto }}</span>
                            <span class="text-xs" style="color: var(--text-muted)">{{ n(l.cantidad_disponible) }} {{ l.unidad_medida.toLowerCase() }} · {{ l.sitio || 'Sin ubicación' }}</span>
                          </li>
                        }
                      </ul>
                      @if (g.unidades.length > maxTarjeta || g.lotes.length > maxTarjeta) {
                        <button type="button" (click)="verDe(g)" class="text-xs font-semibold hover:underline" style="color: var(--accent-text)">Ver todo lo de {{ g.sinResponsable ? 'este grupo' : g.nombre }} →</button>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }

          <!-- ── Por ubicación ── -->
          @case ('ubicaciones') {
            @if (!porUbicacion().length) { <div class="card p-10 text-center text-sm" style="color: var(--text-muted)">No hay materiales con estos filtros.</div> }
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              @for (g of porUbicacion(); track g.clave) {
                <div class="card p-4 flex flex-col gap-3">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold truncate" style="color: var(--text)">{{ g.sitio }}</p>
                      <p class="text-xs mt-0.5" [style.color]="g.responsable ? 'var(--text-muted)' : 'var(--err-text)'">
                        {{ g.responsable ? 'Responsable: ' + g.responsable : 'Sin responsable asignado' }}
                      </p>
                    </div>
                    @if (g.tipo) { <span class="chip shrink-0" style="background: var(--surface2); color: var(--text-2)">{{ tipoSitio(g.tipo) }}</span> }
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <span class="chip" style="background: var(--surface2); color: var(--text)"><strong>{{ g.unidades.length }}</strong>&nbsp;unidades</span>
                    @for (e of estadosDe(g.porEstado); track e.estado) {
                      <span class="chip" [style.background]="colorEstado(e.estado).bg" [style.color]="colorEstado(e.estado).tx">{{ e.n }} {{ etiquetaEstado(e.estado).toLowerCase() }}</span>
                    }
                    @if (g.lotes.length) { <span class="chip" style="background: var(--violet-bg); color: var(--violet-text)">{{ g.lotes.length }} lotes</span> }
                  </div>
                  @if (g.fueraDelSitio) {
                    <p class="text-xs" style="color: var(--info-text)">{{ g.fueraDelSitio }} unidad(es) de aquí están prestadas o asignadas: responde quien las tiene.</p>
                  }
                  <ul class="text-xs space-y-1">
                    @for (p of g.productos.slice(0, 6); track p.producto) {
                      <li class="flex justify-between gap-2">
                        <span class="truncate" style="color: var(--text-2)">{{ p.producto }}</span>
                        <span class="shrink-0 tabular-nums" style="color: var(--text-muted)">
                          @if (p.unidades) { {{ p.disponibles }}/{{ p.unidades }} disp. }
                          @if (p.cantidad) { {{ n(p.cantidad) }} {{ (p.unidad || '').toLowerCase() }} }
                        </span>
                      </li>
                    }
                    @if (g.productos.length > 6) { <li style="color: var(--text-faint)">y {{ g.productos.length - 6 }} productos más</li> }
                  </ul>
                  <button type="button" (click)="verSitio(g)" class="mt-auto self-start text-xs font-semibold hover:underline" style="color: var(--accent-text)">Ver unidades de este sitio →</button>
                </div>
              }
            </div>
          }

          <!-- ── Unidades ── -->
          @case ('unidades') {
            <div class="card overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-[11px] uppercase tracking-wide" style="background: var(--surface2); color: var(--text-muted)">
                      <th class="px-3 py-2.5 font-semibold">Placa / SKU</th>
                      <th class="px-3 py-2.5 font-semibold">Producto</th>
                      <th class="px-3 py-2.5 font-semibold">Estado</th>
                      <th class="px-3 py-2.5 font-semibold hidden md:table-cell">Ubicación</th>
                      <th class="px-3 py-2.5 font-semibold">Responsable</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (u of paginaUnidades(); track u.id_item) {
                      <tr class="border-t align-top" style="border-color: var(--border)">
                        <td class="px-3 py-2.5 font-mono text-xs whitespace-nowrap" style="color: var(--text-2)">{{ u.placa_sena || u.codigo_sku || 'Sin placa' }}</td>
                        <td class="px-3 py-2.5">
                          <span class="font-medium" style="color: var(--text)">{{ u.producto }}</span>
                          <span class="block text-xs" style="color: var(--text-faint)">{{ u.codigo_unspsc || 'Sin UNSPSC' }}{{ u.categoria ? ' · ' + u.categoria : '' }}</span>
                        </td>
                        <td class="px-3 py-2.5"><span class="chip" [style.background]="colorEstado(u.estado).bg" [style.color]="colorEstado(u.estado).tx">{{ etiquetaEstado(u.estado) }}</span></td>
                        <td class="px-3 py-2.5 hidden md:table-cell">
                          <span style="color: var(--text-2)">{{ u.sitio || 'Sin ubicación' }}</span>
                          <span class="block text-xs" style="color: var(--text-faint)">{{ tipoSitio(u.sitio_tipo) }}</span>
                        </td>
                        <td class="px-3 py-2.5">
                          <span class="font-medium" [style.color]="u.responsable.origen === 'SIN_RESPONSABLE' ? 'var(--err-text)' : 'var(--text)'">{{ u.responsable.nombre || 'Sin responsable' }}</span>
                          <span class="block text-xs" [style.color]="vencida(u) ? 'var(--warn-text)' : 'var(--text-faint)'">
                            @if (u.responsable.documento) { C.C. {{ u.responsable.documento }} · }{{ detalleResponsable(u) }}
                          </span>
                        </td>
                      </tr>
                    } @empty {
                      <tr><td colspan="5" class="px-3 py-10 text-center" style="color: var(--text-muted)">No hay unidades con estos filtros.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (totalPaginas() > 1) {
                <div class="flex items-center justify-between gap-2 px-3 py-2.5 border-t text-xs" style="border-color: var(--border); color: var(--text-muted)">
                  <span>{{ (pagina() - 1) * porPagina + 1 }}–{{ min(pagina() * porPagina, filtrado().unidades.length) }} de {{ n(filtrado().unidades.length) }}</span>
                  <div class="flex gap-1">
                    <button type="button" class="btn-sec !py-1" [disabled]="pagina() === 1" (click)="pagina.set(pagina() - 1)">Anterior</button>
                    <button type="button" class="btn-sec !py-1" [disabled]="pagina() === totalPaginas()" (click)="pagina.set(pagina() + 1)">Siguiente</button>
                  </div>
                </div>
              }
            </div>
          }

          <!-- ── Consumibles ── -->
          @case ('consumibles') {
            <div class="card overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-[11px] uppercase tracking-wide" style="background: var(--surface2); color: var(--text-muted)">
                      <th class="px-3 py-2.5 font-semibold">Producto</th>
                      <th class="px-3 py-2.5 font-semibold text-right">Disponible</th>
                      <th class="px-3 py-2.5 font-semibold">Vence</th>
                      <th class="px-3 py-2.5 font-semibold hidden md:table-cell">Ubicación</th>
                      <th class="px-3 py-2.5 font-semibold">Responsable</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (l of filtrado().lotes; track l.id_lote) {
                      <tr class="border-t align-top" style="border-color: var(--border)">
                        <td class="px-3 py-2.5">
                          <span class="font-medium" style="color: var(--text)">{{ l.producto }}</span>
                          <span class="block text-xs" style="color: var(--text-faint)">Lote {{ l.codigo_lote || 'sin código' }} · {{ l.codigo_unspsc || 'Sin UNSPSC' }}</span>
                        </td>
                        <td class="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                          <span class="font-semibold" style="color: var(--text)">{{ n(l.cantidad_disponible) }}</span>
                          <span class="text-xs" style="color: var(--text-muted)"> {{ l.unidad_medida.toLowerCase() }}</span>
                          @if (l.cantidad_reservada) { <span class="block text-xs" style="color: var(--warn-text)">{{ n(l.cantidad_reservada) }} reservado</span> }
                        </td>
                        <td class="px-3 py-2.5 whitespace-nowrap" [style.color]="colorVence(l.fecha_vencimiento)">{{ textoVence(l.fecha_vencimiento) }}</td>
                        <td class="px-3 py-2.5 hidden md:table-cell" style="color: var(--text-2)">{{ l.sitio || 'Sin ubicación' }}</td>
                        <td class="px-3 py-2.5">
                          <span class="font-medium" [style.color]="l.responsable.origen === 'SIN_RESPONSABLE' ? 'var(--err-text)' : 'var(--text)'">{{ l.responsable.nombre || 'Sin responsable' }}</span>
                          @if (l.responsable.documento) { <span class="block text-xs" style="color: var(--text-faint)">C.C. {{ l.responsable.documento }}</span> }
                        </td>
                      </tr>
                    } @empty {
                      <tr><td colspan="5" class="px-3 py-10 text-center" style="color: var(--text-muted)">No hay lotes de consumibles con estos filtros.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [`
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 1rem; }
    .kpi-label { font-size: .72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); }
    .kpi-valor { font-size: 1.6rem; font-weight: 700; line-height: 1.2; margin-top: .25rem; color: var(--text); font-variant-numeric: tabular-nums; }
    .kpi-det { font-size: .75rem; margin-top: .15rem; color: var(--text-faint); }
    .chip { display: inline-flex; align-items: center; font-size: .72rem; font-weight: 600; padding: .15rem .55rem; border-radius: 999px; white-space: nowrap; }
    .aviso { display: flex; align-items: center; gap: .75rem; padding: .75rem 1rem; border: 1px solid; border-radius: 1rem; flex-wrap: wrap; }
    .aviso-btn { font-size: .75rem; font-weight: 700; text-decoration: underline; }
    .btn-sec, .btn-pri { display: inline-flex; align-items: center; gap: .4rem; font-size: .8rem; font-weight: 600; padding: .5rem .85rem; border-radius: .75rem; transition: opacity .15s, background-color .15s; }
    .btn-sec { background: var(--surface); border: 1px solid var(--border); color: var(--text-2); }
    .btn-sec:hover:not(:disabled) { background: var(--surface2); }
    .btn-pri { background: var(--accent-brand); color: #fff; }
    .btn-pri:hover:not(:disabled) { opacity: .9; }
    .btn-sec:disabled, .btn-pri:disabled { opacity: .5; cursor: not-allowed; }
  `],
})
export class ReporteMaterialesComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);
  private readonly exportService = inject(ExportService);

  readonly porPagina = POR_PAGINA;
  readonly maxTarjeta = MAX_EN_TARJETA;
  readonly min = Math.min;

  datos = signal<ReporteMateriales | null>(null);
  cargando = signal(false);
  error = signal<string | null>(null);
  exportando = signal<'pdf' | 'excel' | null>(null);
  filtros = signal<FiltrosReporte>({ ...FILTROS_VACIOS });
  vista = signal<Vista>('responsables');
  pagina = signal(1);
  private abiertos = signal<Set<string>>(new Set());

  readonly opcionesEstado: TableFilterOption[] = [
    { value: '', label: 'Todos' },
    ...Object.entries(ETIQUETA_ESTADO).map(([value, label]) => ({ value, label })),
    { value: 'LOTE', label: 'Solo consumibles (lotes)' },
  ];
  readonly opcionesOrigen: TableFilterOption[] = [
    { value: '', label: 'Todos' },
    ...(Object.keys(ETIQUETA_ORIGEN) as OrigenResponsable[]).map((value) => ({ value, label: ETIQUETA_ORIGEN[value] })),
  ];
  readonly opcionesTipoSitio: TableFilterOption[] = [
    { value: '', label: 'Todos' },
    ...Object.entries(ETIQUETA_TIPO_SITIO).map(([value, label]) => ({ value, label })),
  ];

  /** Ubicaciones presentes en el reporte completo (no en el filtrado, para poder cambiar de una a otra). */
  opcionesSitio = computed<TableFilterOption[]>(() => {
    const d = this.datos();
    if (!d) return [{ value: '', label: 'Todas' }];
    const sitios = new Map<string, string>();
    let sinSitio = false;
    for (const x of [...d.unidades, ...d.lotes]) {
      if (x.id_sitio) sitios.set(x.id_sitio, x.sitio ?? 'Sin nombre');
      else sinSitio = true;
    }
    return [
      { value: '', label: 'Todas' },
      ...[...sitios.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
      ...(sinSitio ? [{ value: SIN_SITIO, label: 'Sin ubicación' }] : []),
    ];
  });

  filtrado = computed(() => {
    const d = this.datos();
    return d ? filtrarReporte(d, this.filtros()) : { unidades: [], lotes: [] };
  });
  resumen = computed(() => resumir(this.filtrado().unidades, this.filtrado().lotes));
  /** Para los avisos: sobre todo el reporte, no solo lo filtrado. */
  resumenTotal = computed(() => {
    const d = this.datos();
    return d ? resumir(d.unidades, d.lotes) : resumir([], []);
  });
  porResponsable = computed(() => agruparPorResponsable(this.filtrado().unidades, this.filtrado().lotes));
  porUbicacion = computed(() => agruparPorUbicacion(this.filtrado().unidades, this.filtrado().lotes));
  totalPaginas = computed(() => Math.max(1, Math.ceil(this.filtrado().unidades.length / POR_PAGINA)));
  paginaUnidades = computed(() => {
    const p = Math.min(this.pagina(), this.totalPaginas());
    return this.filtrado().unidades.slice((p - 1) * POR_PAGINA, p * POR_PAGINA);
  });
  vistas = computed(() => [
    { id: 'responsables' as Vista, label: 'Por responsable', n: this.porResponsable().length },
    { id: 'ubicaciones' as Vista, label: 'Por ubicación', n: this.porUbicacion().length },
    { id: 'unidades' as Vista, label: 'Unidades', n: this.filtrado().unidades.length },
    { id: 'consumibles' as Vista, label: 'Consumibles', n: this.filtrado().lotes.length },
  ]);
  hayFiltros = computed(() => {
    const f = this.filtros();
    return !!(f.q.trim() || f.sitio || f.estado || f.origen || f.tipoSitio);
  });

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.datos.set(await this.api.reporteMateriales());
    } catch (e) {
      this.error.set('No se pudo generar el reporte de materiales.');
      this.toast.httpError(e, 'No se pudo generar el reporte de materiales.');
    } finally {
      this.cargando.set(false);
    }
  }

  setFiltro<K extends keyof FiltrosReporte>(clave: K, valor: FiltrosReporte[K]): void {
    this.filtros.update((f) => ({ ...f, [clave]: valor }));
    this.pagina.set(1);
  }

  setOrigen(v: string): void {
    this.setFiltro('origen', v in ETIQUETA_ORIGEN ? (v as OrigenResponsable) : '');
  }

  limpiarFiltros(): void {
    this.filtros.set({ ...FILTROS_VACIOS });
    this.pagina.set(1);
  }

  cambiarVista(v: Vista): void {
    this.vista.set(v);
    this.pagina.set(1);
  }

  alternar(clave: string): void {
    this.abiertos.update((s) => {
      const n = new Set(s);
      if (n.has(clave)) n.delete(clave); else n.add(clave);
      return n;
    });
  }
  abierto(clave: string): boolean {
    return this.abiertos().has(clave);
  }

  verSinResponsable(): void {
    this.filtros.set({ ...FILTROS_VACIOS, origen: 'SIN_RESPONSABLE' });
    this.cambiarVista('ubicaciones');
  }
  verVencidas(): void {
    this.filtros.set({ ...FILTROS_VACIOS, estado: 'PRESTADO' });
    this.cambiarVista('responsables');
    // Abre a quienes tienen devoluciones vencidas.
    this.abiertos.set(new Set(this.porResponsable().filter((g) => g.devolucionesVencidas).map((g) => g.clave)));
  }
  verDe(g: GrupoResponsable): void {
    this.filtros.set({
      ...FILTROS_VACIOS,
      q: g.sinResponsable ? '' : g.documento ?? g.nombre,
      origen: g.sinResponsable ? 'SIN_RESPONSABLE' : '',
    });
    this.cambiarVista(g.unidades.length ? 'unidades' : 'consumibles');
  }
  verSitio(g: GrupoUbicacion): void {
    this.filtros.update((f) => ({ ...f, sitio: g.clave }));
    this.cambiarVista(g.unidades.length ? 'unidades' : 'consumibles');
  }

  // ── Presentación ──
  n(v: number): string {
    return v.toLocaleString('es-CO');
  }
  etiquetaEstado(e: string): string {
    return ETIQUETA_ESTADO[e] ?? e;
  }
  tipoSitio(t: string | null): string {
    return t ? ETIQUETA_TIPO_SITIO[t] ?? t : 'Sin tipo';
  }
  colorEstado(e: string): { bg: string; tx: string } {
    if (e === 'DISPONIBLE') return { bg: 'var(--ok-bg)', tx: 'var(--ok-text)' };
    if (e === 'PRESTADO') return { bg: 'var(--info-bg)', tx: 'var(--info-text)' };
    if (ESTADOS_NOVEDAD.includes(e) && e !== 'EN_MANTENIMIENTO') return { bg: 'var(--err-bg)', tx: 'var(--err-text)' };
    return { bg: 'var(--warn-bg)', tx: 'var(--warn-text)' };
  }
  estadosDe(por: Record<string, number>): { estado: string; n: number }[] {
    return Object.entries(por).sort((a, b) => b[1] - a[1]).map(([estado, n]) => ({ estado, n }));
  }
  iniciales(nombre: string): string {
    return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  }
  vencida(u: ReporteUnidad): boolean {
    return devolucionVencida(u.responsable);
  }
  /** "Préstamo · devolver 15/10/2026" / "Ficha 2875 · desde …" / "Responsable de COCINA". */
  detalleResponsable(u: ReporteUnidad | ReporteLote): string {
    const r = u.responsable;
    if (r.origen === 'PRESTAMO' || r.origen === 'ASIGNACION') {
      const base = r.origen === 'PRESTAMO' ? 'Préstamo' : r.referencia ?? 'Asignado a ficha';
      if (r.hasta) {
        const dias = diasEntre(hoyIso(), r.hasta);
        return dias < 0 ? `${base} · vencido hace ${-dias} día${dias === -1 ? '' : 's'}` : `${base} · devolver ${fechaCorta(r.hasta)}`;
      }
      return r.desde ? `${base} · desde ${fechaCorta(r.desde)}` : base;
    }
    if (r.origen === 'SITIO') return `Responsable de ${r.referencia ?? 'el sitio'}`;
    return r.referencia ? `${r.referencia} no tiene responsable` : 'Sin sitio asignado';
  }
  textoVence(f: string | null): string {
    if (!f) return 'No vence';
    const dias = diasEntre(hoyIso(), f);
    if (dias < 0) return `Vencido (${fechaCorta(f)})`;
    if (dias <= 30) return `${fechaCorta(f)} · ${dias} días`;
    return fechaCorta(f);
  }
  colorVence(f: string | null): string {
    if (!f) return 'var(--text-faint)';
    const dias = diasEntre(hoyIso(), f);
    return dias < 0 ? 'var(--err-text)' : dias <= 30 ? 'var(--warn-text)' : 'var(--text-2)';
  }
  horaGenerado(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  }

  async exportar(tipo: 'pdf' | 'excel'): Promise<void> {
    if (this.exportando() || !this.datos()) return;
    this.exportando.set(tipo);
    try {
      const { exportarReporteMaterialesPdf, exportarReporteMaterialesExcel } = await import('./reporte-materiales.export');
      const nombreSitio = (id: string) => this.opcionesSitio().find((o) => o.value === id)?.label ?? id;
      const datos = {
        unidades: this.filtrado().unidades,
        lotes: this.filtrado().lotes,
        resumen: this.resumen(),
        porResponsable: this.porResponsable(),
        porUbicacion: this.porUbicacion(),
        filtros: describirFiltros(this.filtros(), nombreSitio),
      };
      if (tipo === 'pdf') exportarReporteMaterialesPdf(datos);
      else await exportarReporteMaterialesExcel(datos, this.exportService);
      this.toast.ok(tipo === 'pdf' ? 'PDF generado' : 'Excel generado', 'El reporte se descargó con los filtros actuales.');
    } catch (e) {
      console.error('[reporte-materiales] exportar falló', e);
      this.toast.error('Error', `No se pudo generar el ${tipo === 'pdf' ? 'PDF' : 'Excel'}.`);
    } finally {
      this.exportando.set(null);
    }
  }
}
