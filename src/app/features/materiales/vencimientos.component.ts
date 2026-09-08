import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { FilaVencimiento, MaterialesApiService } from '../../core/services/materiales/materiales-api.service';

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
  imports: [DatePipe, RouterLink, StatCardComponent],
  template: `
    <div class="p-6">
      <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Vencimientos de préstamos</h1>
          <p class="text-sm text-gray-400 mt-0.5">Préstamos entregados sin devolver. El estado se cierra solo al registrar la devolución.</p>
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

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.cargar();
  }

  cambiarVentana(v: (typeof VENTANAS)[number]): void {
    if (v === this.ventana) return;
    this.ventana = v;
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      const r = await this.api.vencimientosSolicitudes(this.ventana);
      this.vencidas = r.vencidas;
      this.porVencer = r.por_vencer;
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el seguimiento de vencimientos.');
    } finally {
      this.loading = false;
    }
  }
}
