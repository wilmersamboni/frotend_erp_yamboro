import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';
import { FilaVencimiento, MaterialesApiService } from '../../core/services/materiales/materiales-api.service';

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
 */
@Component({
  selector: 'app-materiales-vencimientos',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  template: `
    <div class="p-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Vencimientos de préstamos</h1>
          <p class="text-sm text-gray-400">Préstamos entregados sin devolver. El estado se cierra solo al registrar la devolución.</p>
        </div>
        <label class="text-sm text-gray-500 flex items-center gap-2">
          Ventana
          <select [(ngModel)]="ventana" (ngModelChange)="cargar()"
            class="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30">
            <option [ngValue]="7">7 días</option>
            <option [ngValue]="15">15 días</option>
            <option [ngValue]="30">30 días</option>
          </select>
        </label>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else {
        <div class="grid grid-cols-2 gap-3 mb-6 max-w-md">
          <div class="rounded-xl border border-red-100 bg-red-50 p-3">
            <div class="text-2xl font-bold text-red-600">{{ vencidas.length }}</div>
            <div class="text-xs text-red-500 font-medium">Vencidas</div>
          </div>
          <div class="rounded-xl border border-amber-100 bg-amber-50 p-3">
            <div class="text-2xl font-bold text-amber-600">{{ porVencer.length }}</div>
            <div class="text-xs text-amber-500 font-medium">Por vencer (≤ {{ ventana }} días)</div>
          </div>
        </div>

        <!-- Vencidas -->
        <h2 class="text-sm font-semibold text-gray-700 mb-2">Vencidas</h2>
        @if (vencidas.length === 0) {
          <p class="text-sm text-gray-400 mb-8">Nada vencido. 👍</p>
        } @else {
          <div class="overflow-x-auto mb-8 rounded-xl border border-gray-100">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th class="px-3 py-2 font-medium">Producto</th>
                  <th class="px-3 py-2 font-medium">Solicitante</th>
                  <th class="px-3 py-2 font-medium">Bodega</th>
                  <th class="px-3 py-2 font-medium">Entregado</th>
                  <th class="px-3 py-2 font-medium">Vencía</th>
                  <th class="px-3 py-2 font-medium text-right">Atraso</th>
                  <th class="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (f of vencidas; track f.id_solicitud) {
                  <tr class="hover:bg-gray-50">
                    <td class="px-3 py-2 text-gray-800">{{ f.producto_nombre }} <span class="text-gray-400">× {{ f.cantidad }}</span></td>
                    <td class="px-3 py-2 text-gray-600">{{ f.solicitante_nombre || '—' }}</td>
                    <td class="px-3 py-2 text-gray-600">{{ f.bodega_nombre || '—' }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ f.fecha_entrega ? (f.fecha_entrega | date: 'shortDate') : '—' }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ f.fecha_devolucion | date: 'shortDate' }}</td>
                    <td class="px-3 py-2 text-right"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">{{ f.dias }} día(s)</span></td>
                    <td class="px-3 py-2 text-right">
                      <a routerLink="/materiales/devoluciones" [queryParams]="{ id_solicitud: f.id_solicitud }"
                        class="text-xs font-semibold text-[#2d8000] hover:underline">Registrar devolución</a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <!-- Por vencer -->
        <h2 class="text-sm font-semibold text-gray-700 mb-2">Por vencer</h2>
        @if (porVencer.length === 0) {
          <p class="text-sm text-gray-400">Nada por vencer en los próximos {{ ventana }} días.</p>
        } @else {
          <div class="overflow-x-auto rounded-xl border border-gray-100">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th class="px-3 py-2 font-medium">Producto</th>
                  <th class="px-3 py-2 font-medium">Solicitante</th>
                  <th class="px-3 py-2 font-medium">Bodega</th>
                  <th class="px-3 py-2 font-medium">Entregado</th>
                  <th class="px-3 py-2 font-medium">Vence</th>
                  <th class="px-3 py-2 font-medium text-right">Faltan</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (f of porVencer; track f.id_solicitud) {
                  <tr class="hover:bg-gray-50">
                    <td class="px-3 py-2 text-gray-800">{{ f.producto_nombre }} <span class="text-gray-400">× {{ f.cantidad }}</span></td>
                    <td class="px-3 py-2 text-gray-600">{{ f.solicitante_nombre || '—' }}</td>
                    <td class="px-3 py-2 text-gray-600">{{ f.bodega_nombre || '—' }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ f.fecha_entrega ? (f.fecha_entrega | date: 'shortDate') : '—' }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ f.fecha_devolucion | date: 'shortDate' }}</td>
                    <td class="px-3 py-2 text-right"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{{ f.dias }} día(s)</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>
  `,
})
export class MaterialesVencimientosComponent implements OnInit {
  ventana = 7;
  loading = false;
  vencidas: FilaVencimiento[] = [];
  porVencer: FilaVencimiento[] = [];

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  ngOnInit(): void {
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
