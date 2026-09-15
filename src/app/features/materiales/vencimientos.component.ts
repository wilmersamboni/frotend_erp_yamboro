import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { FilaVencimiento, Lote, MaterialesApiService, Sitio } from '../../core/services/materiales/materiales-api.service';

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
 * `materiales.solicitudes.ver` (vía `serviciosRequeridos`), sin diferencias de
 * comportamiento por rol.
 *
 * Rediseño visual (2026-09-08): mismo lenguaje que Existencias — tarjetas de
 * resumen (`app-stat-card`), tablas en tarjeta blanca con borde suave, y un
 * segmentado de pastillas para la ventana en vez de un `<select>` nativo (son
 * solo 3 valores fijos, un toggle se escanea y se toca más rápido).
 */
@Component({
  selector: 'app-materiales-vencimientos',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, StatCardComponent],
  template: `
    <div class="p-6">
      <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Vencimientos</h1>
          <p class="text-sm text-gray-400 mt-0.5">Controlá primero los lotes perecederos y después los préstamos que deben devolverse.</p>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold uppercase tracking-wide text-gray-400">Ventana</span>
          <div class="inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5">
            @for (v of ventanas; track v) {
              <button type="button" (click)="cambiarVentana(v)"
                class="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                [class.bg-white]="ventana === v" [class.shadow-sm]="ventana === v"
                [class.text-gray-800]="ventana === v" [class.text-gray-400]="ventana !== v">
                {{ v }} días
              </button>
            }
          </div>
        </div>
      </div>

      @if (loading) {
        <div class="flex justify-center py-16">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else {
        <!-- Productos perecederos: fecha real de vencimiento de cada lote. -->
        <section class="mb-9">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 class="text-sm font-bold text-gray-700">Productos perecederos</h2>
              <p class="text-xs text-gray-400 mt-0.5">Lotes activos con fecha de vencimiento registrada.</p>
            </div>
            <a routerLink="/materiales/lotes" class="text-xs font-semibold text-[#2d8000] hover:underline">Ver todos los lotes</a>
          </div>

          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <app-stat-card label="Productos vencidos" [value]="lotesVencidos.length" hint="Lotes que requieren revisión" tono="danger">
              <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.22-1.333-2.99 0L3.34 16c-.77 1.333.192 3 1.73 3z"/></svg>
            </app-stat-card>
            <app-stat-card label="Próximos a vencer" [value]="lotesPorVencer.length" [hint]="'En los próximos ' + ventana + ' días'" tono="warning">
              <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </app-stat-card>
            <app-stat-card label="Productos afectados" [value]="productosEnRiesgo" hint="Catálogos con al menos un lote" tono="info">
              <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M8 5l8 4"/></svg>
            </app-stat-card>
            <app-stat-card label="Unidades en riesgo" [value]="unidadesEnRiesgo" hint="Cantidad disponible por revisar" tono="neutral">
              <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V7a2 2 0 00-2-2H6a2 2 0 00-2 2v6m16 0v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4m16 0H4m4 0h8"/></svg>
            </app-stat-card>
          </div>

          <div class="flex flex-col sm:flex-row gap-3 rounded-xl border border-gray-100 bg-gray-50/70 p-3 mb-4">
            <label class="relative flex-1">
              <span class="sr-only">Buscar lote o producto</span>
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              <input [(ngModel)]="filtro" type="search" placeholder="Buscar por producto, SKU o código de lote"
                class="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
            </label>
            <select [(ngModel)]="sitioFiltro" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
              <option value="">Todas las bodegas</option>
              @for (sitio of sitiosConLotes; track sitio.id_sitio) {
                <option [value]="sitio.id_sitio">{{ sitio.nombre }}</option>
              }
            </select>
          </div>

          @if (lotesVencidos.length === 0 && lotesPorVencer.length === 0) {
            <div class="flex items-center gap-2.5 text-sm text-gray-400 bg-green-50/50 border border-green-100 rounded-xl px-4 py-3">
              <svg class="w-[18px] h-[18px] text-[#39A900] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              No hay lotes perecederos vencidos ni próximos a vencer en los próximos {{ ventana }} días.
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
                      <a routerLink="/materiales/lotes" [queryParams]="{ id_producto: lote.id_producto }" class="block px-4 py-3 hover:bg-white/70 transition-colors">
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0"><p class="font-semibold text-gray-800 truncate">{{ lote.producto?.nombre ?? 'Producto sin nombre' }}</p><p class="text-xs text-gray-500 mt-0.5">SKU: {{ lote.producto?.SKU || 'Sin SKU' }} · {{ lote.codigo_lote || 'Sin código de lote' }}</p></div>
                          <span class="shrink-0 rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">{{ diasTexto(lote) }}</span>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500"><span>Bodega: <b class="font-semibold text-gray-700">{{ nombreSitio(lote) }}</b></span><span>Stock: <b class="font-semibold text-gray-700">{{ lote.cantidad_disponible }} / {{ lote.cantidad_inicial }} {{ lote.producto?.unidad_medida || lote.unidad_medida || '' }}</b></span><span>Venció: <b class="font-semibold text-red-700">{{ lote.fecha_vencimiento | date: 'longDate' }}</b></span></div>
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
                      <a routerLink="/materiales/lotes" [queryParams]="{ id_producto: lote.id_producto }" class="block px-4 py-3 hover:bg-white/70 transition-colors">
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0"><p class="font-semibold text-gray-800 truncate">{{ lote.producto?.nombre ?? 'Producto sin nombre' }}</p><p class="text-xs text-gray-500 mt-0.5">SKU: {{ lote.producto?.SKU || 'Sin SKU' }} · {{ lote.codigo_lote || 'Sin código de lote' }}</p></div>
                          <span class="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">{{ diasTexto(lote) }}</span>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500"><span>Bodega: <b class="font-semibold text-gray-700">{{ nombreSitio(lote) }}</b></span><span>Stock: <b class="font-semibold text-gray-700">{{ lote.cantidad_disponible }} / {{ lote.cantidad_inicial }} {{ lote.producto?.unidad_medida || lote.unidad_medida || '' }}</b></span><span>Vence: <b class="font-semibold text-amber-700">{{ lote.fecha_vencimiento | date: 'longDate' }}</b></span></div>
                      </a>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </section>

        <div class="flex items-center gap-2 mb-3 pt-1">
          <h2 class="text-sm font-bold text-gray-700">Préstamos por devolver</h2>
          <span class="text-xs text-gray-400">Seguimiento de material entregado</span>
        </div>
        <div class="grid grid-cols-2 gap-3 mb-7 max-w-lg">
          <app-stat-card label="Vencidas" [value]="vencidas.length" hint="Ya pasó la fecha de devolución" tono="danger">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          </app-stat-card>
          <app-stat-card label="Por vencer" [value]="porVencer.length" [hint]="'En los próximos ' + ventana + ' días'" tono="warning">
            <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </app-stat-card>
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
                  <tr class="hover:bg-gray-50/80 transition-colors">
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
                    </td>
                    <td class="px-4 py-3 text-right">
                      <a routerLink="/materiales/devoluciones" [queryParams]="{ id_solicitud: f.id_solicitud }"
                        class="inline-block px-3 py-1.5 rounded-full text-xs font-semibold border border-[#39A900]/30 text-[#2d8000] hover:bg-[#39A900]/10 transition-colors whitespace-nowrap">
                        Registrar devolución
                      </a>
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
            Nada por vencer en los próximos {{ ventana }} días.
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
                  <tr class="hover:bg-gray-50/80 transition-colors">
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
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class MaterialesVencimientosComponent implements OnInit {
  readonly ventanas = VENTANAS;
  ventana: (typeof VENTANAS)[number] = 7;
  loading = false;
  vencidas: FilaVencimiento[] = [];
  porVencer: FilaVencimiento[] = [];
  lotes: Lote[] = [];
  sitios: Sitio[] = [];
  filtro = '';
  sitioFiltro = '';

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.cargar();
  }

  cambiarVentana(v: (typeof VENTANAS)[number]): void {
    if (v === this.ventana) return;
    this.ventana = v;
    this.cargar();
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
        return dias >= 0 && dias <= this.ventana;
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

  private diasHastaVencimiento(lote: Lote): number {
    const valor = lote.fecha_vencimiento?.slice(0, 10);
    if (!valor) return Number.POSITIVE_INFINITY;
    const [anio, mes, dia] = valor.split('-').map(Number);
    const vencimiento = new Date(anio, mes - 1, dia);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.round((vencimiento.getTime() - hoy.getTime()) / 86_400_000);
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [r, lotes, sitios] = await Promise.all([
        this.api.vencimientosSolicitudes(this.ventana),
        this.api.listarLotes().catch(() => [] as Lote[]),
        this.api.listarSitios().catch(() => [] as Sitio[]),
      ]);
      this.vencidas = r.vencidas;
      this.porVencer = r.por_vencer;
      // Solo los lotes perecederos activos son inventario que puede vencer.
      this.lotes = lotes.filter(
        (l) => l.estado === 'ACTIVO' && l.producto?.tipo_material === 'PERECEDERO' && !!l.fecha_vencimiento,
      );
      this.sitios = sitios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el seguimiento de vencimientos.');
    } finally {
      this.loading = false;
    }
  }
}
