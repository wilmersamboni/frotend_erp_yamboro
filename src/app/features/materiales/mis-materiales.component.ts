import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { EntregaAInstructor, MaterialesApiService } from './data-access/materiales-api.service';
import { ESTADO_LEGIBLE } from './cuentadante-formato';
import { log } from '../../core/utils/log';

/**
 * "Mis materiales a cargo" (2026-11-18): lo que el administrador, el líder de área o un encargado le
 * entregó al usuario como instructor desde "Entregas a fichas". Solo lectura: devolver o reintegrar
 * lo hace quien entregó. No necesita permiso propio — el backend (`GET materiales/asignaciones/mias`)
 * solo devuelve filas del usuario que pregunta.
 */
@Component({
  selector: 'app-mis-materiales',
  standalone: true,
  imports: [EmptyStateComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-4 md:p-6 space-y-4">
      <div>
        <h1 class="text-xl font-bold text-gray-900">Mis Materiales a Cargo</h1>
        <p class="text-sm text-gray-500">Lo que se te entregó como instructor y todavía está a tu nombre.</p>
      </div>

      @if (cargando()) {
        <p class="text-sm text-gray-500">Cargando…</p>
      } @else if (error()) {
        <app-empty-state variante="error" titulo="No se pudieron cargar tus materiales">
          <button type="button" (click)="cargar()" class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Reintentar</button>
        </app-empty-state>
      } @else if (entregas().length === 0) {
        <p class="text-sm text-gray-500 py-8 text-center">No tienes materiales a tu cargo por ahora.</p>
      } @else {
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div class="rounded-xl border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Entregas</p>
            <p class="text-2xl font-bold text-gray-900">{{ entregas().length }}</p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Equipos</p>
            <p class="text-2xl font-bold text-gray-900">{{ totalUnidades() }}</p>
          </div>
          <div class="rounded-xl border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Consumibles</p>
            <p class="text-2xl font-bold text-gray-900">{{ totalConsumos() }}</p>
          </div>
        </div>

        @for (e of entregas(); track e.id_asignacion) {
          <section class="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <header class="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-gray-800">Entrega del {{ e.fecha_asignacion | date: 'dd/MM/yyyy' }}</p>
                <p class="text-xs text-gray-500">
                  @if (e.bodega_nombre) { Bodega: {{ e.bodega_nombre }} · }
                  @if (e.entregado_por) { Entregó: {{ e.entregado_por }} }
                </p>
              </div>
              @if (e.fecha_devolucion) {
                <span class="text-xs font-semibold rounded-full bg-amber-50 text-amber-700 px-2.5 py-1">Devolver antes del {{ e.fecha_devolucion | date: 'dd/MM/yyyy' }}</span>
              }
            </header>

            <div class="p-4 space-y-4">
              @if (e.observacion) { <p class="text-xs text-gray-500 italic">{{ e.observacion }}</p> }

              @if (e.unidades.length) {
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Equipos (por unidad)</p>
                  <ul class="divide-y divide-gray-100 text-sm">
                    @for (u of e.unidades; track u.id_item) {
                      <li class="py-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span class="text-gray-800">{{ u.producto_nombre ?? 'Sin nombre' }}
                          <span class="text-gray-500">· {{ u.placa_sena ? 'Placa ' + u.placa_sena : (u.codigo_sku ?? 'SIN PLACA') }}</span>
                        </span>
                        <span class="text-xs text-gray-500">{{ estado(u.estado) }}</span>
                      </li>
                    }
                  </ul>
                </div>
              }

              @if (e.consumos.length) {
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Consumibles</p>
                  <ul class="divide-y divide-gray-100 text-sm">
                    @for (c of e.consumos; track $index) {
                      <li class="py-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span class="text-gray-800">{{ c.producto_nombre ?? 'Sin nombre' }}
                          @if (c.codigo_lote) { <span class="text-gray-500">· Lote {{ c.codigo_lote }}</span> }
                        </span>
                        <span class="text-xs text-gray-600">
                          {{ c.cantidad - c.cantidad_reintegrada }} {{ c.unidad_medida ?? '' }}
                          @if (c.cantidad_reintegrada > 0) { <span class="text-gray-400">(entregados {{ c.cantidad }}, devueltos {{ c.cantidad_reintegrada }})</span> }
                        </span>
                      </li>
                    }
                  </ul>
                </div>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
})
export class MisMaterialesComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);

  readonly entregas = signal<EntregaAInstructor[]>([]);
  readonly cargando = signal(true);
  readonly error = signal(false);

  readonly totalUnidades = computed(() => this.entregas().reduce((n, e) => n + e.unidades.length, 0));
  readonly totalConsumos = computed(() => this.entregas().reduce((n, e) => n + e.consumos.length, 0));

  ngOnInit(): void {
    void this.cargar();
  }

  estado(e: string | null): string {
    return e ? (ESTADO_LEGIBLE[e] ?? e) : '';
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(false);
    try {
      this.entregas.set(await this.api.misEntregas());
    } catch (e) {
      log.error('mis-materiales: no se pudo cargar', e);
      this.error.set(true);
    } finally {
      this.cargando.set(false);
    }
  }
}
