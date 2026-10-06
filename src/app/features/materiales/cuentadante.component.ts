import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BienACargo,
  HistorialCuentadante,
  IngresoDevolutivo,
  MaterialesApiService,
} from './data-access/materiales-api.service';
import { PersonaService } from '../../core/services/persona.service';
import { ToastService } from '../../core/services/toast.service';
import { SearchableSelectComponent, SSOption } from '../../shared/components/searchable-select.component';
import { log } from '../../core/utils/log';

type Pestana = 'mis-bienes' | 'ingresos';

/**
 * Cuentadante de devolutivos (2026-10-05). Dos pestañas:
 *  - "Mis bienes a cargo": los ítems de los que soy cuentadante, estén donde
 *    estén (cualquiera que llegue a la pantalla).
 *  - "Asignar por ingreso": cada ingreso a bodega (unidades que entraron
 *    juntas) con su cuentadante; solo administrador_erp y líderes de área
 *    (`puedeGestionarCatalogo`, el mismo criterio del backend).
 * El cuentadante responde por el ítem sin importar el sitio; el encargado de
 * bodega sigue gestionando solo lo que está en su sitio.
 */
@Component({
  selector: 'app-materiales-cuentadante',
  standalone: true,
  imports: [FormsModule, SearchableSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-4 md:p-6 space-y-4">
      <div>
        <h1 class="text-xl font-bold text-gray-900">Cuentadante</h1>
        <p class="text-sm text-gray-500">Quién responde por cada devolutivo, esté donde esté.</p>
      </div>

      <div class="flex gap-2 border-b border-gray-200">
        <button type="button" (click)="pestana.set('mis-bienes')"
          class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px"
          [class]="pestana() === 'mis-bienes' ? 'border-[var(--accent-brand)] text-gray-900' : 'border-transparent text-gray-500'">
          Mis bienes a cargo ({{ bienes().length }})
        </button>
        @if (puedeAsignar()) {
          <button type="button" (click)="pestana.set('ingresos')"
            class="px-4 py-2 text-sm font-semibold border-b-2 -mb-px"
            [class]="pestana() === 'ingresos' ? 'border-[var(--accent-brand)] text-gray-900' : 'border-transparent text-gray-500'">
            Asignar por ingreso ({{ ingresos().length }})
          </button>
        }
      </div>

      @if (cargando()) {
        <p class="text-sm text-gray-500">Cargando…</p>
      } @else if (error()) {
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{{ error() }}</span>
          <button type="button" (click)="cargar()" class="font-semibold underline">Reintentar</button>
        </div>
      } @else if (pestana() === 'mis-bienes') {
        @if (bienes().length === 0) {
          <p class="text-sm text-gray-500 py-8 text-center">No tenés bienes a tu cargo todavía.</p>
        } @else {
          <div class="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th class="text-left px-3 py-2">Producto</th>
                  <th class="text-left px-3 py-2">Placa SENA</th>
                  <th class="text-left px-3 py-2">Estado</th>
                  <th class="text-left px-3 py-2">Dónde está</th>
                  <th class="text-left px-3 py-2">Ingresó</th>
                </tr>
              </thead>
              <tbody>
                @for (b of bienes(); track b.id_item) {
                  <tr class="border-t border-gray-100">
                    <td class="px-3 py-2 font-medium text-gray-800">{{ b.producto_nombre }}</td>
                    <td class="px-3 py-2 text-gray-600">{{ b.placa_sena || '—' }}</td>
                    <td class="px-3 py-2 text-gray-600">{{ b.estado }}</td>
                    <td class="px-3 py-2 text-gray-600">{{ b.sitio_nombre || '—' }}</td>
                    <td class="px-3 py-2 text-gray-500">{{ fecha(b.fecha_ingreso) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        @if (ingresos().length === 0) {
          <p class="text-sm text-gray-500 py-8 text-center">
            No hay ingresos de devolutivos todavía. Aparecen cuando una bodega agrega existencias de un devolutivo.
          </p>
        } @else {
          <ul class="space-y-2">
            @for (i of ingresos(); track i.id_ingreso) {
              <li class="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-gray-800">
                      {{ i.producto_nombre }}
                      <span class="font-normal text-gray-500">· {{ i.unidades }} unidad(es)</span>
                    </p>
                    <p class="text-xs text-gray-500 mt-0.5">
                      @if (i.numero_ingreso) { <strong>{{ i.numero_ingreso }}</strong> · }
                      Ingresó el {{ fecha(i.fecha_ingreso) }}{{ i.sitio_nombre ? ' a ' + i.sitio_nombre : '' }}{{ i.proveedor_nombre ? ' · ' + i.proveedor_nombre : '' }}
                    </p>
                    <p class="text-xs mt-1" [class]="i.sin_asignar ? 'text-amber-700' : 'text-gray-600'">
                      @if (i.sin_asignar === i.unidades) { Sin cuentadante }
                      @else if (i.sin_asignar > 0) { Cuentadante: {{ i.cuentadante_nombre || '—' }} · {{ i.sin_asignar }} unidad(es) sin asignar }
                      @else { Cuentadante: {{ i.cuentadante_nombre || '—' }} }
                    </p>
                  </div>
                  <div class="flex gap-2 shrink-0">
                    <button type="button" (click)="abrirAsignar(i)"
                      class="px-3 py-1.5 rounded-full text-xs font-semibold text-white" style="background-color: var(--accent-brand)">
                      {{ i.id_cuentadante ? 'Cambiar' : 'Asignar' }}
                    </button>
                    <button type="button" (click)="verHistorial(i)"
                      class="px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400">
                      Historial
                    </button>
                  </div>
                </div>

                @if (asignando()?.id_ingreso === i.id_ingreso) {
                  <div class="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto] items-end">
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Cuentadante</label>
                      <app-ss [options]="candidatos()" placeholder="Elegí una persona" [(ngModel)]="nuevoCuentadante"></app-ss>
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Motivo (opcional)</label>
                      <input type="text" [(ngModel)]="motivo" maxlength="500" placeholder="Ej. entrega del contrato 2026"
                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
                    </div>
                    <div class="flex gap-2">
                      <button type="button" (click)="guardar(i)" [disabled]="!nuevoCuentadante || enviando()"
                        class="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style="background-color: var(--accent-brand)">Guardar</button>
                      <button type="button" (click)="asignando.set(null)"
                        class="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 bg-white">Cancelar</button>
                    </div>
                  </div>
                }

                @if (historialDe()?.id === i.id_ingreso) {
                  <div class="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-3">
                    @if (historialDe()!.filas.length === 0) {
                      <p class="text-xs text-gray-500">Sin movimientos.</p>
                    } @else {
                      <ul class="space-y-1">
                        @for (h of historialDe()!.filas; track h.id_historial) {
                          <li class="text-xs text-gray-600">
                            {{ fecha(h.fecha) }} · {{ h.placa_sena || 'sin placa' }}:
                            {{ h.cuentadante_anterior_nombre || 'sin cuentadante' }} → <strong>{{ h.cuentadante_nuevo_nombre || '—' }}</strong>
                            · lo asignó {{ h.asigna_nombre || '—' }}{{ h.motivo ? ' · “' + h.motivo + '”' : '' }}
                          </li>
                        }
                      </ul>
                    }
                  </div>
                }
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
})
export class MaterialesCuentadanteComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);
  private readonly personaApi = inject(PersonaService);
  private readonly toast = inject(ToastService);

  readonly pestana = signal<Pestana>('mis-bienes');
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly bienes = signal<BienACargo[]>([]);
  readonly ingresos = signal<IngresoDevolutivo[]>([]);
  readonly puedeAsignar = signal(false);
  readonly candidatos = signal<SSOption[]>([]);
  readonly asignando = signal<IngresoDevolutivo | null>(null);
  readonly historialDe = signal<{ id: string; filas: HistorialCuentadante[] } | null>(null);
  readonly enviando = signal(false);

  nuevoCuentadante: string | null = null;
  motivo = '';

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.bienes.set((await this.api.misBienesACargo()) ?? []);
      // Quien no gestiona el catálogo no ve la pestaña de asignar (el backend le daría 403).
      const gestor = await this.api.puedeGestionarCatalogo().catch(() => false);
      this.puedeAsignar.set(gestor);
      if (gestor) {
        this.ingresos.set((await this.api.listarIngresosCuentadante()) ?? []);
        void this.cargarCandidatos();
        if (this.bienes().length === 0) this.pestana.set('ingresos');
      }
    } catch (e) {
      log.error('cuentadante: no se pudo cargar', e);
      this.error.set('No se pudo cargar la información del cuentadante.');
    } finally {
      this.cargando.set(false);
    }
  }

  /** Personas elegibles: las mismas que pueden ser responsable de bodega (datos mínimos, sin `usuarios.gestionar`). */
  private async cargarCandidatos(): Promise<void> {
    try {
      const usuarios = await this.personaApi.listarResponsablesBodega();
      this.candidatos.set(
        usuarios.map((u: any) => ({
          value: u.idUsuario,
          label: `${u.persona?.nombre ?? ''} ${u.persona?.apellido ?? ''} — ${u.persona?.cargo ?? ''}`.trim(),
        })),
      );
    } catch (e) {
      log.warn('cuentadante: no se pudo cargar la lista de personas', e);
      this.toast.warn('No se pudo cargar la lista de personas', 'Reintentá recargando la pantalla.');
    }
  }

  abrirAsignar(i: IngresoDevolutivo): void {
    this.historialDe.set(null);
    this.nuevoCuentadante = i.id_cuentadante;
    this.motivo = '';
    this.asignando.set(i);
  }

  async guardar(i: IngresoDevolutivo): Promise<void> {
    if (!this.nuevoCuentadante) return;
    this.enviando.set(true);
    try {
      const r = await this.api.asignarCuentadante(i.id_ingreso, this.nuevoCuentadante, this.motivo);
      this.toast.ok(
        r?.actualizados ? 'Cuentadante asignado' : 'Sin cambios',
        r?.actualizados ? `${r.actualizados} unidad(es) actualizadas.` : 'Ya estaba a cargo de esa persona.',
      );
      this.asignando.set(null);
      this.ingresos.set((await this.api.listarIngresosCuentadante()) ?? []);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo asignar el cuentadante.');
    } finally {
      this.enviando.set(false);
    }
  }

  async verHistorial(i: IngresoDevolutivo): Promise<void> {
    if (this.historialDe()?.id === i.id_ingreso) {
      this.historialDe.set(null);
      return;
    }
    this.asignando.set(null);
    try {
      this.historialDe.set({ id: i.id_ingreso, filas: (await this.api.historialCuentadante(i.id_ingreso)) ?? [] });
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el historial.');
    }
  }

  fecha(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }
}
