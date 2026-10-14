import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ArrowRight, Boxes, ChevronDown, CircleCheck, Clock, Droplets, FileChartColumn, FileDown, Handshake, List,
  LucideAngularModule, LucideIconData, MapPin, Package, RefreshCw, Search, Sheet, TriangleAlert, UserX, Users, Wrench,
} from 'lucide-angular';
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
  GrupoProducto,
  GrupoResponsable,
  GrupoUbicacion,
  SIN_SITIO,
  agruparPorProducto,
  agruparPorResponsable,
  agruparPorUbicacion,
  cantidadConUnidad,
  describirFiltros,
  devolucionVencida,
  diasEntre,
  fechaCorta,
  filtrarReporte,
  fraseResumen,
  hoyIso,
  plural,
  resumir,
} from './reporte-materiales.util';

type Vista = 'productos' | 'ubicaciones' | 'responsables' | 'unidades' | 'consumibles';

const POR_PAGINA = 50;
/** Unidades que se listan dentro de una tarjeta expandida (el resto, en la lista de equipos). */
const MAX_EN_TARJETA = 12;

/** Orden fijo de los estados en barras y textos: lo bueno primero. */
const ORDEN_ESTADOS = ['DISPONIBLE', 'PRESTADO', 'RESERVADO', 'EN_MANTENIMIENTO', 'DAÑADO', 'PERDIDO'];

/** Cómo se dice cada estado contando ("1 prestado" / "3 prestados"). */
const ESTADO_CONTADO: Record<string, [string, string]> = {
  DISPONIBLE: ['disponible', 'disponibles'],
  PRESTADO: ['prestado', 'prestados'],
  RESERVADO: ['apartado para traslado', 'apartados para traslado'],
  EN_MANTENIMIENTO: ['en mantenimiento', 'en mantenimiento'],
  'DAÑADO': ['dañado', 'dañados'],
  PERDIDO: ['perdido', 'perdidos'],
};

const COLOR_BARRA: Record<string, string> = {
  DISPONIBLE: '#22c55e',
  PRESTADO: '#3b82f6',
  RESERVADO: '#a78bfa',
  EN_MANTENIMIENTO: '#f59e0b',
  'DAÑADO': '#ef4444',
  PERDIDO: '#991b1b',
};

const AYUDA_VISTA: Record<Vista, string> = {
  productos: 'Cada fila es un tipo de material: cuántos hay y cómo están. Toca una fila para ver cada uno.',
  ubicaciones: 'Cada tarjeta es un lugar (bodega, ambiente…): qué hay ahí y quién es el encargado.',
  responsables: 'Cada fila es una persona y lo que tiene a su cargo, ya sea prestado o porque es encargada del lugar.',
  unidades: 'Todos los equipos uno por uno, con su placa.',
  consumibles: 'Lo que se gasta al usarlo (cables, baterías, insumos): cuánto queda y cuándo vence.',
};

/**
 * Reporte general de materiales (2026-10-02; rehecho 2026-10-05 para que se
 * entienda sin explicación): arriba, el inventario contado en dos frases y una
 * barra de estados; abajo, pestañas que son preguntas — ¿Qué hay? (por
 * producto, la vista por defecto), ¿Dónde está?, ¿Quién responde?, la lista
 * de equipos y el material de consumo.
 * Responsable = quien lo tiene prestado (solicitud entregada), el instructor
 * líder de la ficha a la que se asignó, o si no el responsable del sitio donde
 * está. Ver `GET /api2/existencias/reporte` y `resolverResponsable` en el
 * backend. El alcance lo recorta el backend: admin ve todo el centro; un líder
 * de área, sus áreas; un encargado, sus bodegas y las públicas.
 */
@Component({
  selector: 'app-reporte-materiales',
  standalone: true,
  imports: [FormsModule, TableFilterComponent, LucideAngularModule],
  template: `
    <div class="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <!-- Encabezado -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex items-start gap-3 min-w-0">
          <span class="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#39A900]/10 text-[#2d8000] ring-1 ring-[#39A900]/20">
            <lucide-icon [img]="i.reporte" [size]="24"></lucide-icon>
          </span>
          <div class="min-w-0">
            <nav aria-label="Migas de pan" class="mb-0.5 text-xs" style="color: var(--text-muted)">Materiales / Inventario</nav>
            <h1 class="text-xl sm:text-2xl font-bold" style="color: var(--text)">Reporte General de Materiales</h1>
            <p class="text-sm mt-0.5" style="color: var(--text-muted)">Todo lo que hay en el centro: qué es, dónde está y quién lo cuida.</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          @if (datos(); as d) {
            <span class="text-xs mr-1" style="color: var(--text-faint)">Actualizado {{ horaGenerado(d.generado) }}</span>
          }
          <button type="button" (click)="cargar()" [disabled]="cargando()" class="btn-sec" aria-label="Actualizar" title="Actualizar">
            <lucide-icon [img]="i.recargar" [size]="16" [class.animate-spin]="cargando()"></lucide-icon>
          </button>
          <button type="button" (click)="exportar('excel')" [disabled]="!datos() || exportando()" class="btn-sec">
            <lucide-icon [img]="i.excel" [size]="16"></lucide-icon>
            {{ exportando() === 'excel' ? 'Generando…' : 'Excel' }}
          </button>
          <button type="button" (click)="exportar('pdf')" [disabled]="!datos() || exportando()" class="btn-pri">
            <lucide-icon [img]="i.pdf" [size]="16"></lucide-icon>
            {{ exportando() === 'pdf' ? 'Generando…' : 'Descargar PDF' }}
          </button>
        </div>
      </div>

      @if (cargando() && !datos()) {
        <div class="h-36 rounded-2xl animate-pulse" style="background: var(--surface2)"></div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          @for (k of [1, 2, 3, 4]; track k) { <div class="h-24 rounded-2xl animate-pulse" style="background: var(--surface2)"></div> }
        </div>
        <div class="h-64 rounded-2xl animate-pulse" style="background: var(--surface2)"></div>
      } @else if (error()) {
        <div class="card p-8 text-center">
          <p class="text-sm font-medium" style="color: var(--err-text)">{{ error() }}</p>
          <button type="button" (click)="cargar()" class="btn-sec mt-3 mx-auto">Reintentar</button>
        </div>
      } @else if (datos()) {
        <!-- En pocas palabras -->
        <section class="card p-5 sm:p-6">
          <div class="flex items-start gap-3">
            <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              [style.background]="frase().todoBien ? 'var(--ok-bg)' : 'var(--warn-bg)'"
              [style.color]="frase().todoBien ? 'var(--ok-text)' : 'var(--warn-text)'">
              <lucide-icon [img]="frase().todoBien ? i.ok : i.alerta" [size]="20"></lucide-icon>
            </span>
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-wide" style="color: var(--text-muted)">En pocas palabras{{ hayFiltros() ? ' (con los filtros elegidos)' : '' }}</p>
              <p class="mt-1 text-base sm:text-lg font-semibold leading-snug" style="color: var(--text)">{{ frase().titulo }}</p>
              <p class="mt-0.5 text-sm" style="color: var(--text-2)">{{ frase().detalle }}</p>
            </div>
          </div>
          @if (resumen().unidades) {
            <div class="mt-5">
              <div class="flex h-3 w-full overflow-hidden rounded-full" style="background: var(--surface2)" role="img"
                [attr.aria-label]="'Estado de los equipos: ' + textoEstados(porEstadoTotal(), resumen().unidades)">
                @for (b of barra(); track b.estado) {
                  <span class="h-full" [style.width.%]="b.pct" [style.background]="b.color" [title]="b.texto"></span>
                }
              </div>
              <div class="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
                @for (b of barra(); track b.estado) {
                  <span class="inline-flex items-center gap-1.5" style="color: var(--text-2)">
                    <span class="h-2.5 w-2.5 rounded-full" [style.background]="b.color"></span>{{ b.texto }}
                  </span>
                }
              </div>
            </div>
          }
        </section>

        <!-- Cifras -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button type="button" class="kpi" (click)="irA('productos', '')">
            <span class="kpi-icono" style="background: var(--accent-soft); color: var(--accent-text)"><lucide-icon [img]="i.equipo" [size]="20"></lucide-icon></span>
            <span class="min-w-0">
              <span class="kpi-label">Equipos y herramientas</span>
              <span class="kpi-valor">{{ n(resumen().unidades) }}</span>
              <span class="kpi-det">se prestan y se devuelven</span>
            </span>
          </button>
          <button type="button" class="kpi" (click)="irA('responsables', 'PRESTADO')">
            <span class="kpi-icono" style="background: var(--info-bg); color: var(--info-text)"><lucide-icon [img]="i.prestado" [size]="20"></lucide-icon></span>
            <span class="min-w-0">
              <span class="kpi-label">Prestados</span>
              <span class="kpi-valor" [style.color]="resumen().prestadas ? 'var(--info-text)' : null">{{ n(resumen().prestadas) }}</span>
              <span class="kpi-det" [style.color]="resumen().devolucionesVencidas ? 'var(--warn-text)' : null">
                {{ resumen().devolucionesVencidas ? plural(resumen().devolucionesVencidas, 'ya debía volver', 'ya debían volver') : resumen().prestadas ? 'todos a tiempo' : 'ninguno afuera' }}
              </span>
            </span>
          </button>
          <button type="button" class="kpi" (click)="irA('unidades', 'NOVEDAD')">
            <span class="kpi-icono" [style.background]="resumen().novedad ? 'var(--err-bg)' : 'var(--surface2)'" [style.color]="resumen().novedad ? 'var(--err-text)' : 'var(--text-muted)'"><lucide-icon [img]="i.arreglo" [size]="20"></lucide-icon></span>
            <span class="min-w-0">
              <span class="kpi-label">Con algún problema</span>
              <span class="kpi-valor" [style.color]="resumen().novedad ? 'var(--err-text)' : null">{{ n(resumen().novedad) }}</span>
              <span class="kpi-det">dañados, perdidos o en mantenimiento</span>
            </span>
          </button>
          <button type="button" class="kpi" (click)="irA('consumibles', '')">
            <span class="kpi-icono" style="background: var(--violet-bg); color: var(--violet-text)"><lucide-icon [img]="i.consumo" [size]="20"></lucide-icon></span>
            <span class="min-w-0">
              <span class="kpi-label">Material de consumo</span>
              <span class="kpi-valor">{{ n(resumen().productosConsumibles) }}</span>
              <span class="kpi-det">{{ resumen().productosConsumibles === 1 ? 'tipo' : 'tipos' }} que se gastan al usarlos</span>
            </span>
          </button>
        </div>

        <!-- Avisos -->
        @if (resumenTotal().sinResponsable) {
          <div class="aviso" style="background: var(--err-bg); border-color: var(--err-border); color: var(--err-text)">
            <lucide-icon [img]="i.sinResponsable" [size]="20" class="shrink-0"></lucide-icon>
            <p class="text-sm flex-1"><strong>{{ plural(resumenTotal().sinResponsable, 'material no tiene', 'materiales no tienen') }} a nadie a cargo.</strong> Están en lugares sin encargado: asígnelo en Sitios para que alguien responda por ellos.</p>
            <button type="button" class="aviso-btn" (click)="verSinResponsable()">Ver cuáles</button>
          </div>
        }
        @if (resumenTotal().devolucionesVencidas) {
          <div class="aviso" style="background: var(--warn-bg); border-color: var(--warn-border); color: var(--warn-text)">
            <lucide-icon [img]="i.reloj" [size]="20" class="shrink-0"></lucide-icon>
            <p class="text-sm flex-1"><strong>{{ plural(resumenTotal().devolucionesVencidas, 'equipo ya debía', 'equipos ya debían') }} haberse devuelto.</strong></p>
            <button type="button" class="aviso-btn" (click)="verVencidas()">Ver quién los tiene</button>
          </div>
        }

        <!-- Preguntas (vistas) -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" role="tablist" aria-label="Cómo ver el reporte">
          @for (v of vistas(); track v.id) {
            <button type="button" role="tab" [attr.aria-selected]="vista() === v.id" (click)="cambiarVista(v.id)"
              class="pestana" [class.pestana-activa]="vista() === v.id">
              <lucide-icon [img]="v.icono" [size]="18" class="shrink-0"></lucide-icon>
              <span class="min-w-0 text-left">
                <span class="block text-sm font-semibold truncate">{{ v.label }}</span>
                <span class="block text-[11px] truncate" style="color: var(--text-faint)">{{ v.n }}</span>
              </span>
            </button>
          }
        </div>

        <!-- Buscar y filtrar -->
        <div class="card p-3 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative flex-1 min-w-[220px]">
              <span class="absolute inset-y-0 left-3 flex items-center pointer-events-none" style="color: var(--text-faint)"><lucide-icon [img]="i.buscar" [size]="16"></lucide-icon></span>
              <input type="search" [ngModel]="filtros().q" (ngModelChange)="setFiltro('q', $event)"
                placeholder="Busca por nombre, placa o persona…" aria-label="Buscar"
                class="w-full pr-3 py-2 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-[#39A900]/30"
                style="background: var(--surface); border-color: var(--border); color: var(--text); padding-left: 2.6rem" />
            </div>
            <app-table-filter label="Lugar" [options]="opcionesSitio()" [value]="filtros().sitio" (valueChange)="setFiltro('sitio', $event)" />
            <app-table-filter label="Tipo de lugar" [options]="opcionesTipoSitio" [value]="filtros().tipoSitio" (valueChange)="setFiltro('tipoSitio', $event)" />
            <app-table-filter label="Estado" [options]="opcionesEstado" [value]="filtros().estado" (valueChange)="setFiltro('estado', $event)" />
            <app-table-filter label="Quién responde" [options]="opcionesOrigen" [value]="filtros().origen" (valueChange)="setOrigen($event)" />
          </div>
          @if (hayFiltros()) {
            <div class="flex flex-wrap items-center gap-2 text-xs" style="color: var(--text-muted)">
              <span>Mostrando: <strong style="color: var(--text)">{{ textoFiltros() }}</strong></span>
              <button type="button" (click)="limpiarFiltros()" class="font-semibold hover:underline" style="color: var(--accent-text)">Ver todo</button>
            </div>
          }
        </div>

        <p class="text-sm" style="color: var(--text-muted)">{{ ayudaVista() }}</p>

        @switch (vista()) {
          <!-- ── ¿Qué hay? (por producto) ── -->
          @case ('productos') {
            <div class="card overflow-hidden">
              <!-- relative: un <span class="sr-only"> (absolute) dentro de la tabla se escapa
                   del scroll si el contenedor no está posicionado, y ensancha la página en celular. -->
              <div class="relative overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs" style="background: var(--surface2); color: var(--text-muted)">
                      <th class="px-4 py-3 font-semibold">Material</th>
                      <th class="px-4 py-3 font-semibold text-right">Cuántos hay</th>
                      <th class="px-4 py-3 font-semibold min-w-[200px]">Cómo están</th>
                      <th class="px-4 py-3 font-semibold hidden md:table-cell">Dónde están</th>
                      <th class="w-8"><span class="sr-only">Ver</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (p of porProducto(); track p.clave) {
                      <tr class="fila border-t cursor-pointer" style="border-color: var(--border)" tabindex="0"
                        (click)="verProducto(p)" (keydown.enter)="verProducto(p)">
                        <td class="px-4 py-3">
                          <span class="flex items-center gap-2.5">
                            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                              [style.background]="p.tipo === 'CONSUMO' ? 'var(--violet-bg)' : 'var(--surface2)'"
                              [style.color]="p.tipo === 'CONSUMO' ? 'var(--violet-text)' : 'var(--text-muted)'">
                              <lucide-icon [img]="p.tipo === 'CONSUMO' ? i.consumo : i.equipo" [size]="16"></lucide-icon>
                            </span>
                            <span class="min-w-0">
                              <span class="block font-semibold" style="color: var(--text)">{{ p.producto }}</span>
                              <span class="block text-xs" style="color: var(--text-faint)">{{ p.tipo === 'CONSUMO' ? 'Material de consumo' : (p.categoria || 'Equipo o herramienta') }}</span>
                            </span>
                          </span>
                        </td>
                        <td class="px-4 py-3 text-right whitespace-nowrap">
                          @if (p.tipo === 'EQUIPO') {
                            <span class="text-base font-bold tabular-nums" style="color: var(--text)">{{ n(p.total) }}</span>
                          } @else {
                            <span class="font-bold tabular-nums" style="color: var(--text)">{{ cantidad(p.cantidad, p.unidad) }}</span>
                          }
                        </td>
                        <td class="px-4 py-3">
                          @if (p.tipo === 'EQUIPO') {
                            <div class="flex h-1.5 w-full max-w-[180px] overflow-hidden rounded-full" style="background: var(--surface2)">
                              @for (e of estadosOrdenados(p.porEstado); track e.estado) {
                                <span class="h-full" [style.width.%]="(e.n / p.total) * 100" [style.background]="colorBarra(e.estado)"></span>
                              }
                            </div>
                            <span class="mt-1 block text-xs" [style.color]="p.novedad ? 'var(--err-text)' : 'var(--text-2)'">{{ textoEstados(p.porEstado, p.total) }}</span>
                          } @else {
                            <span class="text-xs" [style.color]="p.porVencer ? 'var(--warn-text)' : 'var(--text-2)'">
                              {{ p.porVencer ? plural(p.porVencer, 'lote vence pronto o ya venció', 'lotes vencen pronto o ya vencieron') : 'Sin vencimientos cercanos' }}
                            </span>
                          }
                        </td>
                        <td class="px-4 py-3 hidden md:table-cell text-xs" style="color: var(--text-2)">{{ textoLugares(p.lugares) }}</td>
                        <td class="pr-3 text-right"><lucide-icon [img]="i.ir" [size]="16" class="flecha" style="color: var(--text-faint)"></lucide-icon></td>
                      </tr>
                    } @empty {
                      <tr><td colspan="5" class="px-4 py-10 text-center" style="color: var(--text-muted)">No hay materiales con estos filtros.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          <!-- ── ¿Dónde está? ── -->
          @case ('ubicaciones') {
            @if (!porUbicacion().length) { <div class="card p-10 text-center text-sm" style="color: var(--text-muted)">No hay materiales con estos filtros.</div> }
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              @for (g of porUbicacion(); track g.clave) {
                <div class="card p-4 flex flex-col gap-3" [style.border-color]="g.responsable ? null : 'var(--err-border)'">
                  <div class="flex items-start gap-3">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style="background: var(--surface2); color: var(--text-muted)">
                      <lucide-icon [img]="i.lugar" [size]="18"></lucide-icon>
                    </span>
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold truncate" style="color: var(--text)">{{ g.sitio }}
                        @if (g.tipo) { <span class="ml-1 text-xs font-normal" style="color: var(--text-faint)">· {{ tipoSitio(g.tipo) }}</span> }
                      </p>
                      <p class="text-xs mt-0.5" [style.color]="g.responsable ? 'var(--text-muted)' : 'var(--err-text)'">
                        {{ g.responsable ? 'Encargado: ' + g.responsable : 'Nadie está a cargo de este lugar' }}
                      </p>
                    </div>
                    <div class="text-right shrink-0">
                      <p class="text-lg font-bold tabular-nums leading-none" style="color: var(--text)">{{ n(g.unidades.length) }}</p>
                      <p class="text-[11px]" style="color: var(--text-faint)">{{ g.unidades.length === 1 ? 'equipo' : 'equipos' }}</p>
                    </div>
                  </div>
                  @if (g.unidades.length) {
                    <p class="text-xs" [style.color]="g.porEstado['DAÑADO'] || g.porEstado['PERDIDO'] ? 'var(--err-text)' : 'var(--text-2)'">{{ textoEstados(g.porEstado, g.unidades.length) }}</p>
                  }
                  @if (g.fueraDelSitio) {
                    <p class="text-xs rounded-lg px-2.5 py-1.5" style="background: var(--info-bg); color: var(--info-text)">{{ plural(g.fueraDelSitio, 'equipo de aquí está prestado', 'equipos de aquí están prestados') }} o en una ficha: responde quien los tiene.</p>
                  }
                  <ul class="text-xs divide-y divide-[color:var(--border)]">
                    @for (p of g.productos.slice(0, 6); track p.producto) {
                      <li class="flex items-center justify-between gap-3 py-1.5">
                        <span class="truncate" style="color: var(--text-2)">{{ p.producto }}</span>
                        <span class="shrink-0 tabular-nums" style="color: var(--text-muted)">
                          @if (p.unidades) { {{ textoDisponibles(p.disponibles, p.unidades) }} }
                          @if (p.cantidad) { {{ cantidad(p.cantidad, p.unidad) }} }
                        </span>
                      </li>
                    }
                    @if (g.productos.length > 6) { <li class="py-1.5" style="color: var(--text-faint)">y {{ plural(g.productos.length - 6, 'material más', 'materiales más') }}</li> }
                  </ul>
                  <button type="button" (click)="verSitio(g)" class="mt-auto self-start inline-flex items-center gap-1 text-xs font-semibold hover:underline" style="color: var(--accent-text)">
                    Ver todo lo de {{ g.sitio }} <lucide-icon [img]="i.ir" [size]="14"></lucide-icon>
                  </button>
                </div>
              }
            </div>
          }

          <!-- ── ¿Quién responde? ── -->
          @case ('responsables') {
            @if (!porResponsable().length) { <div class="card p-10 text-center text-sm" style="color: var(--text-muted)">No hay materiales con estos filtros.</div> }
            <div class="space-y-2">
              @for (g of porResponsable(); track g.clave) {
                <div class="card overflow-hidden" [style.border-color]="g.sinResponsable ? 'var(--err-border)' : null">
                  <button type="button" (click)="alternar(g.clave)" [attr.aria-expanded]="abierto(g.clave)"
                    class="w-full flex flex-wrap sm:flex-nowrap items-center gap-3 p-3.5 text-left hover:bg-black/[0.02]">
                    <span class="w-10 h-10 shrink-0 rounded-full grid place-items-center text-sm font-bold"
                      [style.background]="g.sinResponsable ? 'var(--err-bg)' : 'var(--accent-soft)'"
                      [style.color]="g.sinResponsable ? 'var(--err-text)' : 'var(--accent-text)'">
                      @if (g.sinResponsable) { <lucide-icon [img]="i.sinResponsable" [size]="18"></lucide-icon> } @else { {{ iniciales(g.nombre) }} }
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm font-semibold truncate" [style.color]="g.sinResponsable ? 'var(--err-text)' : 'var(--text)'">{{ g.sinResponsable ? 'Nadie a cargo' : g.nombre }}</span>
                      <span class="block text-xs truncate" style="color: var(--text-muted)">{{ textoResponsable(g) }}</span>
                    </span>
                    <span class="flex items-center gap-4 text-center ml-auto">
                      <span><span class="block text-base font-bold" style="color: var(--text)">{{ n(g.unidades.length) }}</span><span class="block text-[11px]" style="color: var(--text-faint)">{{ g.unidades.length === 1 ? 'equipo' : 'equipos' }}</span></span>
                      @if (g.enPrestamo) {
                        <span><span class="block text-base font-bold" [style.color]="g.devolucionesVencidas ? 'var(--warn-text)' : 'var(--info-text)'">{{ g.enPrestamo }}</span><span class="block text-[11px]" style="color: var(--text-faint)">{{ g.devolucionesVencidas ? g.devolucionesVencidas + ' atrasados' : 'prestados' }}</span></span>
                      }
                      @if (g.lotes.length) {
                        <span><span class="block text-base font-bold" style="color: var(--text)">{{ g.lotes.length }}</span><span class="block text-[11px]" style="color: var(--text-faint)">de consumo</span></span>
                      }
                      <lucide-icon [img]="i.abrir" [size]="16" class="transition-transform" [class.rotate-180]="abierto(g.clave)" style="color: var(--text-faint)"></lucide-icon>
                    </span>
                  </button>
                  @if (abierto(g.clave)) {
                    <div class="border-t px-3.5 py-3 space-y-2" style="border-color: var(--border); background: var(--surface2)">
                      @if (g.unidades.length) {
                        <p class="text-xs" style="color: var(--text-2)">{{ textoEstados(g.porEstado, g.unidades.length) }}</p>
                      }
                      <ul class="divide-y divide-[color:var(--border)]">
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
                            <span class="chip" style="background: var(--violet-bg); color: var(--violet-text)">Consumo</span>
                            <span class="font-medium" style="color: var(--text)">{{ l.producto }}</span>
                            <span class="text-xs" style="color: var(--text-muted)">{{ cantidad(l.cantidad_disponible, l.unidad_medida) }} · {{ l.sitio || 'Sin ubicación' }}</span>
                          </li>
                        }
                      </ul>
                      @if (g.unidades.length > maxTarjeta || g.lotes.length > maxTarjeta) {
                        <button type="button" (click)="verDe(g)" class="inline-flex items-center gap-1 text-xs font-semibold hover:underline" style="color: var(--accent-text)">Ver todo lo de {{ g.sinResponsable ? 'este grupo' : g.nombre }} <lucide-icon [img]="i.ir" [size]="14"></lucide-icon></button>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }

          <!-- ── Lista de equipos ── -->
          @case ('unidades') {
            <div class="card overflow-hidden">
              <!-- relative: un <span class="sr-only"> (absolute) dentro de la tabla se escapa
                   del scroll si el contenedor no está posicionado, y ensancha la página en celular. -->
              <div class="relative overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs" style="background: var(--surface2); color: var(--text-muted)">
                      <th class="px-3 py-3 font-semibold">Placa</th>
                      <th class="px-3 py-3 font-semibold">Qué es</th>
                      <th class="px-3 py-3 font-semibold">Estado</th>
                      <th class="px-3 py-3 font-semibold hidden md:table-cell">Dónde está</th>
                      <th class="px-3 py-3 font-semibold">Quién responde</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (u of paginaUnidades(); track u.id_item) {
                      <tr class="border-t align-top" style="border-color: var(--border)">
                        <td class="px-3 py-2.5 font-mono text-xs whitespace-nowrap" style="color: var(--text-2)">{{ u.placa_sena || u.codigo_sku || 'Sin placa' }}</td>
                        <td class="px-3 py-2.5">
                          <span class="font-medium" style="color: var(--text)">{{ u.producto }}</span>
                          @if (detalleProducto(u); as det) { <span class="block text-xs" style="color: var(--text-faint)">{{ det }}</span> }
                        </td>
                        <td class="px-3 py-2.5"><span class="chip" [style.background]="colorEstado(u.estado).bg" [style.color]="colorEstado(u.estado).tx">{{ etiquetaEstado(u.estado) }}</span></td>
                        <td class="px-3 py-2.5 hidden md:table-cell">
                          <span style="color: var(--text-2)">{{ u.sitio || 'Sin ubicación' }}</span>
                          @if (u.sitio_tipo) { <span class="block text-xs" style="color: var(--text-faint)">{{ tipoSitio(u.sitio_tipo) }}</span> }
                        </td>
                        <td class="px-3 py-2.5">
                          <span class="font-medium" [style.color]="u.responsable.origen === 'SIN_RESPONSABLE' ? 'var(--err-text)' : 'var(--text)'">{{ u.responsable.nombre || 'Nadie a cargo' }}</span>
                          <span class="block text-xs" [style.color]="vencida(u) ? 'var(--warn-text)' : 'var(--text-faint)'">{{ detalleResponsable(u) }}</span>
                        </td>
                      </tr>
                    } @empty {
                      <tr><td colspan="5" class="px-3 py-10 text-center" style="color: var(--text-muted)">No hay equipos con estos filtros.</td></tr>
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

          <!-- ── Material de consumo ── -->
          @case ('consumibles') {
            <div class="card overflow-hidden">
              <!-- relative: un <span class="sr-only"> (absolute) dentro de la tabla se escapa
                   del scroll si el contenedor no está posicionado, y ensancha la página en celular. -->
              <div class="relative overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="text-left text-xs" style="background: var(--surface2); color: var(--text-muted)">
                      <th class="px-3 py-3 font-semibold">Material</th>
                      <th class="px-3 py-3 font-semibold text-right">Queda</th>
                      <th class="px-3 py-3 font-semibold">Vence</th>
                      <th class="px-3 py-3 font-semibold hidden md:table-cell">Dónde está</th>
                      <th class="px-3 py-3 font-semibold">Quién responde</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (l of filtrado().lotes; track l.id_lote) {
                      <tr class="border-t align-top" style="border-color: var(--border)">
                        <td class="px-3 py-2.5">
                          <span class="font-medium" style="color: var(--text)">{{ l.producto }}</span>
                          @if (l.codigo_lote) { <span class="block text-xs" style="color: var(--text-faint)">Lote {{ l.codigo_lote }}</span> }
                        </td>
                        <td class="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                          <span class="font-semibold" style="color: var(--text)">{{ cantidad(l.cantidad_disponible, l.unidad_medida) }}</span>
                          @if (l.cantidad_reservada) { <span class="block text-xs" style="color: var(--warn-text)">{{ n(l.cantidad_reservada) }} apartado</span> }
                        </td>
                        <td class="px-3 py-2.5 whitespace-nowrap" [style.color]="colorVence(l.fecha_vencimiento)">{{ textoVence(l.fecha_vencimiento) }}</td>
                        <td class="px-3 py-2.5 hidden md:table-cell" style="color: var(--text-2)">{{ l.sitio || 'Sin ubicación' }}</td>
                        <td class="px-3 py-2.5">
                          <span class="font-medium" [style.color]="l.responsable.origen === 'SIN_RESPONSABLE' ? 'var(--err-text)' : 'var(--text)'">{{ l.responsable.nombre || 'Nadie a cargo' }}</span>
                        </td>
                      </tr>
                    } @empty {
                      <tr><td colspan="5" class="px-3 py-10 text-center" style="color: var(--text-muted)">No hay material de consumo con estos filtros.</td></tr>
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
    .kpi { display: flex; align-items: flex-start; gap: .75rem; text-align: left; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 1rem; transition: border-color .15s, box-shadow .15s; }
    .kpi:hover { border-color: var(--accent-brand); box-shadow: 0 4px 14px -6px rgba(0,0,0,.12); }
    .kpi-icono { display: flex; flex-shrink: 0; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; border-radius: .75rem; }
    .kpi-label { display: block; font-size: .78rem; font-weight: 600; color: var(--text-muted); }
    .kpi-valor { display: block; font-size: 1.6rem; font-weight: 700; line-height: 1.2; margin-top: .1rem; color: var(--text); font-variant-numeric: tabular-nums; }
    .kpi-det { display: block; font-size: .75rem; margin-top: .1rem; color: var(--text-faint); }
    @media (max-width: 639px) { .kpi { flex-direction: column; gap: .5rem; padding: .85rem; } .kpi-valor { font-size: 1.4rem; } }
    .pestana { display: flex; align-items: center; gap: .6rem; padding: .65rem .8rem; border-radius: .9rem; border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); transition: border-color .15s, background-color .15s; min-width: 0; }
    .pestana:hover { border-color: var(--text-faint); }
    .pestana-activa { border-color: var(--accent-brand); background: var(--accent-soft); color: var(--accent-text); box-shadow: inset 0 0 0 1px var(--accent-brand); }
    .fila:hover { background: var(--surface2); }
    .fila:hover .flecha { color: var(--accent-text) !important; transform: translateX(2px); }
    .flecha { display: inline-block; transition: transform .15s; }
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
  readonly plural = plural;
  readonly i = {
    reporte: FileChartColumn, recargar: RefreshCw, excel: Sheet, pdf: FileDown, ok: CircleCheck, alerta: TriangleAlert,
    equipo: Package, prestado: Handshake, arreglo: Wrench, consumo: Droplets, sinResponsable: UserX, reloj: Clock,
    buscar: Search, ir: ArrowRight, abrir: ChevronDown, lugar: MapPin,
  };

  datos = signal<ReporteMateriales | null>(null);
  cargando = signal(false);
  error = signal<string | null>(null);
  exportando = signal<'pdf' | 'excel' | null>(null);
  filtros = signal<FiltrosReporte>({ ...FILTROS_VACIOS });
  vista = signal<Vista>('productos');
  pagina = signal(1);
  private abiertos = signal<Set<string>>(new Set());

  readonly opcionesEstado: TableFilterOption[] = [
    { value: '', label: 'Todos' },
    ...ORDEN_ESTADOS.map((value) => ({ value, label: ETIQUETA_ESTADO[value] ?? value })),
    { value: 'NOVEDAD', label: 'Con algún problema' },
    { value: 'LOTE', label: 'Solo material de consumo' },
  ];
  readonly opcionesOrigen: TableFilterOption[] = [
    { value: '', label: 'Todos' },
    ...(Object.keys(ETIQUETA_ORIGEN) as OrigenResponsable[]).map((value) => ({ value, label: ETIQUETA_ORIGEN[value] })),
  ];
  readonly opcionesTipoSitio: TableFilterOption[] = [
    { value: '', label: 'Todos' },
    ...Object.entries(ETIQUETA_TIPO_SITIO).map(([value, label]) => ({ value, label })),
  ];

  /** Lugares presentes en el reporte completo (no en el filtrado, para poder cambiar de uno a otro). */
  opcionesSitio = computed<TableFilterOption[]>(() => {
    const d = this.datos();
    if (!d) return [{ value: '', label: 'Todos' }];
    const sitios = new Map<string, string>();
    let sinSitio = false;
    for (const x of [...d.unidades, ...d.lotes]) {
      if (x.id_sitio) sitios.set(x.id_sitio, x.sitio ?? 'Sin nombre');
      else sinSitio = true;
    }
    return [
      { value: '', label: 'Todos' },
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
  frase = computed(() => fraseResumen(this.resumen()));
  porEstadoTotal = computed(() => {
    const por: Record<string, number> = {};
    for (const u of this.filtrado().unidades) por[u.estado] = (por[u.estado] ?? 0) + 1;
    return por;
  });
  /** Barra de "cómo están los equipos", con su leyenda. */
  barra = computed(() => {
    const total = this.resumen().unidades || 1;
    return this.estadosOrdenados(this.porEstadoTotal()).map((e) => ({
      estado: e.estado,
      pct: (e.n / total) * 100,
      color: this.colorBarra(e.estado),
      texto: this.contarEstado(e.estado, e.n),
    }));
  });
  porProducto = computed(() => agruparPorProducto(this.filtrado().unidades, this.filtrado().lotes));
  porResponsable = computed(() => agruparPorResponsable(this.filtrado().unidades, this.filtrado().lotes));
  porUbicacion = computed(() => agruparPorUbicacion(this.filtrado().unidades, this.filtrado().lotes));
  totalPaginas = computed(() => Math.max(1, Math.ceil(this.filtrado().unidades.length / POR_PAGINA)));
  paginaUnidades = computed(() => {
    const p = Math.min(this.pagina(), this.totalPaginas());
    return this.filtrado().unidades.slice((p - 1) * POR_PAGINA, p * POR_PAGINA);
  });
  vistas = computed<{ id: Vista; label: string; n: string; icono: LucideIconData }[]>(() => [
    { id: 'productos', label: '¿Qué hay?', n: plural(this.porProducto().length, 'material', 'materiales'), icono: Boxes },
    { id: 'ubicaciones', label: '¿Dónde está?', n: plural(this.porUbicacion().length, 'lugar', 'lugares'), icono: MapPin },
    { id: 'responsables', label: '¿Quién responde?', n: plural(this.porResponsable().length, 'persona', 'personas'), icono: Users },
    { id: 'unidades', label: 'Lista de equipos', n: plural(this.filtrado().unidades.length, 'equipo', 'equipos'), icono: List },
    { id: 'consumibles', label: 'Material de consumo', n: plural(this.filtrado().lotes.length, 'lote', 'lotes'), icono: Droplets },
  ]);
  ayudaVista = computed(() => AYUDA_VISTA[this.vista()]);
  hayFiltros = computed(() => {
    const f = this.filtros();
    return !!(f.q.trim() || f.sitio || f.estado || f.origen || f.tipoSitio);
  });
  textoFiltros = computed(() => describirFiltros(this.filtros(), (id) => this.nombreSitio(id)));

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

  /** Desde una cifra: abre la vista que la explica, con el estado correspondiente (el resto de filtros se conserva). */
  irA(v: Vista, estado: string): void {
    this.setFiltro('estado', estado);
    this.cambiarVista(v);
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
  verProducto(p: GrupoProducto): void {
    this.filtros.update((f) => ({ ...f, q: p.producto }));
    this.cambiarVista(p.tipo === 'CONSUMO' ? 'consumibles' : 'unidades');
  }

  // ── Presentación ──
  n(v: number): string {
    return v.toLocaleString('es-CO');
  }
  cantidad(n: number, unidad: string | null): string {
    return cantidadConUnidad(n, unidad);
  }
  etiquetaEstado(e: string): string {
    return ETIQUETA_ESTADO[e] ?? e;
  }
  tipoSitio(t: string | null): string {
    return t ? ETIQUETA_TIPO_SITIO[t] ?? t : 'Sin tipo';
  }
  nombreSitio(id: string): string {
    return this.opcionesSitio().find((o) => o.value === id)?.label ?? id;
  }
  colorEstado(e: string): { bg: string; tx: string } {
    if (e === 'DISPONIBLE') return { bg: 'var(--ok-bg)', tx: 'var(--ok-text)' };
    if (e === 'PRESTADO') return { bg: 'var(--info-bg)', tx: 'var(--info-text)' };
    if (ESTADOS_NOVEDAD.includes(e) && e !== 'EN_MANTENIMIENTO') return { bg: 'var(--err-bg)', tx: 'var(--err-text)' };
    return { bg: 'var(--warn-bg)', tx: 'var(--warn-text)' };
  }
  colorBarra(e: string): string {
    return COLOR_BARRA[e] ?? '#9ca3af';
  }
  estadosOrdenados(por: Record<string, number>): { estado: string; n: number }[] {
    const pos = (e: string) => (ORDEN_ESTADOS.indexOf(e) + 1 || 99);
    return Object.entries(por).filter(([, n]) => n > 0).sort((a, b) => pos(a[0]) - pos(b[0])).map(([estado, n]) => ({ estado, n }));
  }
  /** "3 prestados", "1 dañado". */
  contarEstado(estado: string, n: number): string {
    const [uno, varios] = ESTADO_CONTADO[estado] ?? [this.etiquetaEstado(estado).toLowerCase(), this.etiquetaEstado(estado).toLowerCase()];
    return plural(n, uno, varios);
  }
  /** "Todos disponibles" o "20 disponibles, 3 prestados y 1 dañado". */
  textoEstados(por: Record<string, number>, total: number): string {
    if ((por['DISPONIBLE'] ?? 0) === total) return total === 1 ? 'Disponible' : 'Todos disponibles';
    const partes = this.estadosOrdenados(por).map((e) => this.contarEstado(e.estado, e.n));
    return partes.length < 2 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
  }
  textoDisponibles(disponibles: number, total: number): string {
    if (disponibles === total) return total === 1 ? '1 disponible' : `los ${this.n(total)} disponibles`;
    return `${this.n(disponibles)} de ${this.n(total)} disponibles`;
  }
  /** "Bodega BIO-TIC", "Y-13 y Y-15" o "Y-13, Y-15 y 3 lugares más". */
  textoLugares(lugares: string[]): string {
    if (!lugares.length) return '—';
    if (lugares.length <= 2) return lugares.join(' y ');
    return `${lugares[0]}, ${lugares[1]} y ${plural(lugares.length - 2, 'lugar más', 'lugares más')}`;
  }
  textoResponsable(g: GrupoResponsable): string {
    const motivos = g.motivos.join(' · ');
    return g.documento && !g.sinResponsable ? `C.C. ${g.documento} · ${motivos}` : motivos;
  }
  detalleProducto(u: ReporteUnidad): string {
    return [u.marca, u.modelo].filter(Boolean).join(' ') || u.categoria || '';
  }
  iniciales(nombre: string): string {
    return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
  }
  vencida(u: ReporteUnidad): boolean {
    return devolucionVencida(u.responsable);
  }
  /** "Prestado · debe volver el 15/10/2026" / "Ficha 2875 · desde …" / "Encargado de COCINA". */
  detalleResponsable(u: ReporteUnidad | ReporteLote): string {
    const r = u.responsable;
    if (r.origen === 'PRESTAMO' || r.origen === 'ASIGNACION') {
      const base = r.origen === 'PRESTAMO' ? 'Prestado' : r.referencia ?? 'Entregado a una ficha';
      if (r.hasta) {
        const dias = diasEntre(hoyIso(), r.hasta);
        return dias < 0
          ? `${base} · debía volver hace ${plural(-dias, 'día', 'días')}`
          : `${base} · debe volver el ${fechaCorta(r.hasta)}`;
      }
      return r.desde ? `${base} · desde el ${fechaCorta(r.desde)}` : base;
    }
    if (r.origen === 'SITIO') return `Encargado de ${r.referencia ?? 'el lugar'}`;
    return r.referencia ? `${r.referencia} no tiene encargado` : 'Sin lugar asignado';
  }
  textoVence(f: string | null): string {
    if (!f) return 'No vence';
    const dias = diasEntre(hoyIso(), f);
    if (dias < 0) return `Ya venció (${fechaCorta(f)})`;
    if (dias <= 30) return `${fechaCorta(f)} · en ${plural(dias, 'día', 'días')}`;
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
      const datos = {
        unidades: this.filtrado().unidades,
        lotes: this.filtrado().lotes,
        resumen: this.resumen(),
        porProducto: this.porProducto(),
        porResponsable: this.porResponsable(),
        porUbicacion: this.porUbicacion(),
        filtros: this.textoFiltros(),
      };
      if (tipo === 'pdf') await exportarReporteMaterialesPdf(datos);
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
