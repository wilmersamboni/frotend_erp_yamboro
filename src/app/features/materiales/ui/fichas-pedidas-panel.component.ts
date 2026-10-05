import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MaterialesApiService, SolicitudFicha } from '../data-access/materiales-api.service';
import { ToastService } from '../../../core/services/toast.service';

/**
 * <app-fichas-pedidas-panel> — "Pedir ficha al líder" del lado del líder de
 * área / administrador (catálogo único, 2026-10-02): lista los pedidos
 * PENDIENTES de los encargados. "Crear ficha" lo resuelve el padre (abre SU
 * formulario de ficha con los datos precargados y, al guardar, llama a
 * `atenderSolicitudFicha`); "Rechazar" se resuelve acá, con motivo.
 * Va en Productos y en Mi Bodega: a un líder que también gestiona bodegas el
 * menú le oculta Productos y lo lleva a Mi Bodega.
 */
@Component({
  selector: 'app-fichas-pedidas-panel',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (pedidos.length) {
      <div class="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
        <p class="text-sm font-semibold text-amber-900 mb-3">Fichas pedidas por los encargados ({{ pedidos.length }})</p>
        <ul class="space-y-2">
          @for (pf of pedidos; track pf.id_solicitud_ficha) {
            <li class="rounded-xl bg-white border border-amber-100 px-3 py-2.5">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-gray-800">
                    {{ pf.nombre }}@if (pf.marca) {<span class="font-normal text-gray-500"> · {{ pf.marca }}</span>}
                    @if (pf.tipo_material) {<span class="ml-1 text-[11px] font-medium text-gray-400">{{ pf.tipo_material }}{{ pf.unidad_medida ? ' · ' + pf.unidad_medida : '' }}</span>}
                  </p>
                  <p class="text-xs text-gray-500 mt-0.5">
                    Pidió {{ pf.solicitante_nombre || 'un encargado' }}{{ pf.sitio_nombre ? ' (' + pf.sitio_nombre + ')' : '' }} · {{ fecha(pf.fecha) }}
                  </p>
                  @if (pf.nota) { <p class="text-xs text-gray-600 mt-1 italic">“{{ pf.nota }}”</p> }
                </div>
                <div class="flex gap-2 shrink-0">
                  <button type="button" (click)="crear.emit(pf)"
                    class="px-3 py-1.5 rounded-full text-xs font-semibold text-white" style="background-color: var(--accent-brand)">Crear ficha</button>
                  <button type="button" (click)="alternarRechazo(pf)"
                    class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-red-300 hover:text-red-600">Rechazar</button>
                </div>
              </div>
              @if (rechazandoId === pf.id_solicitud_ficha) {
                <div class="mt-2 flex gap-2">
                  <input type="text" [(ngModel)]="motivo" placeholder="Motivo (ej. ya existe como «Multímetro Fluke 117»)"
                    class="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-200" />
                  <button type="button" (click)="rechazar(pf)" [disabled]="motivo.trim().length < 5 || enviando"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 disabled:opacity-50">Rechazar pedido</button>
                </div>
              }
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class FichasPedidasPanelComponent {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);

  /** Pedidos PENDIENTES (el padre los carga solo si el usuario gestiona el catálogo). */
  @Input() pedidos: SolicitudFicha[] = [];
  @Output() crear = new EventEmitter<SolicitudFicha>();
  /** Se rechazó uno: el padre recarga. */
  @Output() cambiado = new EventEmitter<void>();

  rechazandoId: string | null = null;
  motivo = '';
  enviando = false;

  alternarRechazo(pf: SolicitudFicha): void {
    this.rechazandoId = this.rechazandoId === pf.id_solicitud_ficha ? null : pf.id_solicitud_ficha;
    this.motivo = '';
  }

  async rechazar(pf: SolicitudFicha): Promise<void> {
    this.enviando = true;
    try {
      await this.api.rechazarSolicitudFicha(pf.id_solicitud_ficha, this.motivo.trim());
      this.toast.ok('Pedido rechazado', 'Se le avisó a quien lo pidió, con el motivo.');
      this.rechazandoId = null;
      this.cambiado.emit();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo rechazar el pedido.');
    } finally {
      this.enviando = false;
    }
  }

  fecha(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }
}

/** Datos del pedido con los que arranca el formulario de ficha nueva. */
export function prefillDesdePedido(pf: SolicitudFicha): Record<string, string> {
  const datos: Record<string, string> = {};
  for (const k of ['nombre', 'marca', 'modelo', 'tipo_material', 'unidad_medida', 'codigo_unspsc'] as const) {
    const v = pf[k];
    if (v) datos[k] = v;
  }
  if (pf.nota) datos['descripcion'] = pf.nota;
  return datos;
}
