import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { MaterialesApiService, ResumenInventario } from '../../../core/services/materiales/materiales-api.service';

/**
 * Panel de existencias — SOLO LECTURA (Tier SigMat M6). Reemplaza el CRUD que
 * escribía a mano en la tabla `inventario` (vestigial: ningún flujo la
 * sincronizaba, el stock real vive en `item.estado` + `lote`). Los datos
 * salen de `GET /api2/inventario/resumen`, ya recortado por programa/bodega.
 *
 * Para mover stock se usan los flujos reales (solicitudes, traslados,
 * novedades, devoluciones) — acá no se crea/edita/elimina nada.
 */
@Component({
  selector: 'app-materiales-inventario',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="p-6">
      <div class="mb-5">
        <h1 class="text-xl font-bold text-gray-800">Existencias</h1>
        <p class="text-sm text-gray-400">Vista de solo lectura. El stock se mueve con solicitudes, traslados, novedades y devoluciones.</p>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else {
        <!-- Tarjetas resumen -->
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          <div class="rounded-xl border border-gray-100 p-3">
            <div class="text-[11px] uppercase tracking-wide text-gray-400">Unidades</div>
            <div class="text-lg font-bold text-gray-800">{{ tot().total }}</div>
          </div>
          <div class="rounded-xl border border-green-100 bg-green-50/50 p-3">
            <div class="text-[11px] uppercase tracking-wide text-green-600">Disponibles</div>
            <div class="text-lg font-bold text-green-700">{{ tot().disponibles }}</div>
          </div>
          <div class="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <div class="text-[11px] uppercase tracking-wide text-blue-600">Prestadas</div>
            <div class="text-lg font-bold text-blue-700">{{ tot().prestados }}</div>
          </div>
          <div class="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
            <div class="text-[11px] uppercase tracking-wide text-amber-600">En mantenimiento</div>
            <div class="text-lg font-bold text-amber-700">{{ tot().mantenimiento }}</div>
          </div>
          <div class="rounded-xl border border-red-100 bg-red-50/50 p-3">
            <div class="text-[11px] uppercase tracking-wide text-red-600">Dañadas / perdidas</div>
            <div class="text-lg font-bold text-red-700">{{ tot().danados + tot().perdidos }}</div>
          </div>
          <div class="rounded-xl border p-3"
            [class.border-gray-100]="tot().lotes_por_vencer === 0"
            [class.border-orange-200]="tot().lotes_por_vencer > 0"
            [class.bg-orange-50]="tot().lotes_por_vencer > 0">
            <div class="text-[11px] uppercase tracking-wide"
              [class.text-gray-400]="tot().lotes_por_vencer === 0" [class.text-orange-600]="tot().lotes_por_vencer > 0">
              Lotes por vencer
            </div>
            <div class="text-lg font-bold"
              [class.text-gray-800]="tot().lotes_por_vencer === 0" [class.text-orange-700]="tot().lotes_por_vencer > 0">
              {{ tot().lotes_por_vencer }}
            </div>
          </div>
        </div>

        <input type="text" [(ngModel)]="q" (ngModelChange)="filtro.set($event)"
          placeholder="Buscar por producto, SKU o bodega…"
          class="w-full md:w-96 mb-3 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />

        @if (filtradas().length === 0) {
          <p class="text-center text-gray-400 text-sm py-10">Sin existencias para mostrar</p>
        } @else {
          <div class="overflow-x-auto rounded-xl border border-gray-100">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th class="px-4 py-3 text-left font-medium">Producto</th>
                  <th class="px-4 py-3 text-left font-medium">Bodega</th>
                  <th class="px-3 py-3 text-right font-medium">Disp.</th>
                  <th class="px-3 py-3 text-right font-medium">Prest.</th>
                  <th class="px-3 py-3 text-right font-medium">Mant.</th>
                  <th class="px-3 py-3 text-right font-medium">Dañ./Perd.</th>
                  <th class="px-3 py-3 text-right font-medium">Total</th>
                  <th class="px-3 py-3 text-right font-medium">Lote disp.</th>
                  <th class="px-3 py-3 text-right font-medium">Por vencer</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                @for (r of filtradas(); track r.id_producto) {
                  <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3">
                      <div class="text-gray-800 font-medium">{{ r.nombre }}</div>
                      <div class="text-[11px] text-gray-400">
                        {{ r.sku || '—' }}
                        @if (r.marca || r.modelo) { · {{ marcaModelo(r) }} }
                        · {{ r.tipo_material }}
                      </div>
                    </td>
                    <td class="px-4 py-3 text-gray-600">{{ r.sitio_nombre || '— sin bodega —' }}</td>
                    <td class="px-3 py-3 text-right font-medium" [class.text-green-700]="r.disponibles > 0" [class.text-gray-300]="r.disponibles === 0">{{ r.disponibles }}</td>
                    <td class="px-3 py-3 text-right" [class.text-blue-700]="r.prestados > 0" [class.text-gray-300]="r.prestados === 0">{{ r.prestados }}</td>
                    <td class="px-3 py-3 text-right" [class.text-amber-700]="r.mantenimiento > 0" [class.text-gray-300]="r.mantenimiento === 0">{{ r.mantenimiento }}</td>
                    <td class="px-3 py-3 text-right" [class.text-red-700]="(r.danados + r.perdidos) > 0" [class.text-gray-300]="(r.danados + r.perdidos) === 0">{{ r.danados + r.perdidos }}</td>
                    <td class="px-3 py-3 text-right text-gray-700">{{ r.total }}</td>
                    <td class="px-3 py-3 text-right" [class.text-gray-700]="r.lote_disponible > 0" [class.text-gray-300]="r.lote_disponible === 0">{{ r.lote_disponible || '—' }}</td>
                    <td class="px-3 py-3 text-right">
                      @if (r.lotes_por_vencer > 0) {
                        <span class="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">{{ r.lotes_por_vencer }}</span>
                      } @else {
                        <span class="text-gray-300">—</span>
                      }
                    </td>
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
export class MaterialesInventarioComponent implements OnInit {
  filas = signal<ResumenInventario[]>([]);
  loading = false;
  q = '';
  filtro = signal('');

  filtradas = computed(() => {
    const t = this.filtro().trim().toLowerCase();
    const rows = this.filas();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.nombre, r.sku, r.sitio_nombre, r.marca, r.modelo]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(t)),
    );
  });

  tot = computed(() =>
    this.filas().reduce(
      (a, r) => ({
        total: a.total + r.total,
        disponibles: a.disponibles + r.disponibles,
        prestados: a.prestados + r.prestados,
        mantenimiento: a.mantenimiento + r.mantenimiento,
        danados: a.danados + r.danados,
        perdidos: a.perdidos + r.perdidos,
        lotes_por_vencer: a.lotes_por_vencer + r.lotes_por_vencer,
      }),
      { total: 0, disponibles: 0, prestados: 0, mantenimiento: 0, danados: 0, perdidos: 0, lotes_por_vencer: 0 },
    ),
  );

  marcaModelo(r: ResumenInventario): string {
    return [r.marca, r.modelo].filter((v) => !!v).join(' ');
  }

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  ngOnInit(): void {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.filas.set(await this.api.resumenInventario());
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el panel de existencias.');
    } finally {
      this.loading = false;
    }
  }
}
