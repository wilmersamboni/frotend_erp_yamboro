import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminModalComponent } from '../../../shared/components/admin-modal.component';
import { OpcionSelect } from '../services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Item, MaterialesApiService, Sitio, Traslado } from '../../../core/services/materiales/materiales-api.service';

/**
 * Traslados de ítems entre sitios — PENDIENTE → APROBADO/RECHAZADO, terminal
 * (el backend bloquea re-resolver uno ya resuelto). Sin doble confirmación
 * como Solicitudes, pero misma razón que Novedades para tabla a medida:
 * los botones cambian según estado.
 *
 * Gating de botones: solo admin por ahora (ver nota en Novedades — el
 * criterio de responsable-de-sitio queda pendiente). A diferencia de
 * Solicitudes, el backend de Traslados NO tiene un bypass de admin cuando
 * el sitio origen sí tiene responsable asignado — en ese caso el 403 de
 * "no te toca aprobar esto" es esperado incluso para admin, y lo maneja el
 * toast global de errores.
 */
@Component({
  selector: 'app-materiales-traslados',
  standalone: true,
  imports: [FormsModule, DatePipe, AdminModalComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Traslados</h1>
        <button (click)="nuevo()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Nuevo traslado
        </button>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (traslados.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay traslados registrados</p>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gray-100">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Ítem</th>
                <th class="px-4 py-3 text-left font-medium">Origen</th>
                <th class="px-4 py-3 text-left font-medium">Destino</th>
                <th class="px-4 py-3 text-left font-medium">Justificación</th>
                <th class="px-4 py-3 text-left font-medium">Estado</th>
                <th class="px-4 py-3 text-left font-medium">Fecha</th>
                <th class="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (t of traslados; track t.id_traslado) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ t.item?.codigo_sku ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreSitio(t.id_sitio_origen) }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ nombreSitio(t.id_sitio_destino) }}</td>
                  <td class="px-4 py-3 text-gray-500 max-w-[200px] truncate">{{ t.justificacion ?? '—' }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs"
                      [class.bg-amber-100]="t.estado === 'PENDIENTE'" [class.text-amber-700]="t.estado === 'PENDIENTE'"
                      [class.bg-green-100]="t.estado === 'APROBADO'" [class.text-green-700]="t.estado === 'APROBADO'"
                      [class.bg-red-100]="t.estado === 'RECHAZADO'" [class.text-red-700]="t.estado === 'RECHAZADO'">
                      {{ t.estado }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ t.fecha_solicitud | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    @if (t.estado === 'PENDIENTE' && (puedeAprobar || puedeRechazar)) {
                      <div class="flex justify-end gap-1.5">
                        @if (puedeAprobar) {
                          <button (click)="aprobar(t)"
                            class="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                            Aprobar
                          </button>
                        }
                        @if (puedeRechazar) {
                          <button (click)="rechazar(t)"
                            class="px-2.5 py-1 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                            Rechazar
                          </button>
                        }
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <app-admin-modal
      [open]="modalOpen"
      [editando]="null"
      labelSingular="traslado"
      [columns]="['id_item', 'id_sitio_destino', 'justificacion']"
      [form]="form"
      [opciones]="opciones"
      [columnLabels]="columnLabels"
      [saving]="saving"
      [error]="error"
      (closed)="cerrarModal()"
      (saved)="guardar($event)" />
  `,
})
export class MaterialesTrasladosComponent implements OnInit {
  traslados: Traslado[] = [];
  items: Item[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  form: Record<string, any> = {};

  columnLabels: Record<string, string> = { id_item: 'Ítem', id_sitio_destino: 'Destino', justificacion: 'Justificación (opcional)' };

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
  ) {}

  /**
   * Aprobar/Rechazar gateados por servicio (`materiales.traslados.aprobar`
   * / `.rechazar`), no por cargo — antes un solo `esAdmin` (cargo puro)
   * mostraba ambos botones juntos sin mirar el permiso. Ver plan "Ronda 3".
   */
  get puedeAprobar(): boolean {
    return this.auth.tieneServicio('materiales.traslados.aprobar');
  }
  get puedeRechazar(): boolean {
    return this.auth.tieneServicio('materiales.traslados.rechazar');
  }

  get opciones(): Record<string, OpcionSelect[]> {
    return {
      id_item: this.items.map((i) => ({ label: `${i.codigo_sku}${i.placa_sena ? ' — ' + i.placa_sena : ''}`, value: i.id_item })),
      id_sitio_destino: this.sitios.map((s) => ({ label: `${s.nombre} (${s.tipo})`, value: s.id_sitio })),
    };
  }

  ngOnInit(): void {
    this.cargar();
  }

  nombreSitio(id: number): string {
    return this.sitios.find((s) => s.id_sitio === id)?.nombre ?? '—';
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [traslados, items, sitios] = await Promise.all([
        this.api.listarTraslados(),
        this.api.listarItems(),
        this.api.listarSitios(),
      ]);
      this.traslados = traslados;
      this.items = items;
      this.sitios = sitios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los traslados.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (this.items.length === 0 || this.sitios.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos un ítem y un sitio para crear un traslado.');
      return;
    }
    this.form = { id_item: this.items[0].id_item, id_sitio_destino: this.sitios[0].id_sitio, justificacion: '' };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(form: Record<string, any>): Promise<void> {
    this.saving = true;
    this.error = null;
    try {
      await this.api.crearTraslado({
        id_item: Number(form['id_item']),
        id_sitio_destino: Number(form['id_sitio_destino']),
        justificacion: form['justificacion'] || undefined,
      });
      this.toast.ok('Traslado solicitado');
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear el traslado.';
    } finally {
      this.saving = false;
    }
  }

  async aprobar(t: Traslado): Promise<void> {
    try {
      await this.api.aprobarTraslado(t.id_traslado);
      this.toast.ok('Traslado aprobado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo aprobar el traslado.');
    }
  }

  async rechazar(t: Traslado): Promise<void> {
    const observacion = window.prompt('Motivo del rechazo (opcional):');
    if (observacion === null) return;
    try {
      await this.api.rechazarTraslado(t.id_traslado, observacion || undefined);
      this.toast.ok('Traslado rechazado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo rechazar el traslado.');
    }
  }
}
