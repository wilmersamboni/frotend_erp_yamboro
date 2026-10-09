import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { ToastService, mensajeDeError } from '../../../core/services/toast.service';
import { MaterialesApiService, PlantillaCaracteristicas, RegistroCaracteristicas } from '../data-access/materiales-api.service';
import { valoresLimpios } from '../caracteristicas-equipo.util';
import { CamposCaracteristicasComponent, PlantillasCaracteristicasService } from './caracteristicas-equipo.component';

/** Qué se edita: una unidad (devolutivo, con historial y motivo) o un lote (consumible, sin historial). */
export interface ObjetivoCaracteristicas {
  tipo: 'item' | 'lote';
  id: string;
  id_producto: string;
  titulo: string;
  /** Código de la lista sugerida de la categoría (solo unidades), o null. */
  codigoPlantilla: string | null;
  caracteristicas: Record<string, string>;
}

/**
 * <app-editar-caracteristicas-modal> — editar las características de UNA unidad o de un lote (2026-10-09). Lo usan
 * Equipos con placa y la tarjeta de Mi Bodega ("entraron 5 iguales y a una le subieron la RAM").
 *  - Unidad: si se cambia o borra un valor ya registrado pide **motivo** (igual que el backend) y muestra el
 *    historial con quién tuvo el equipo entre cambios.
 *  - Lote: solo los campos; sin motivo ni historial (un lote se consume).
 * Emite `guardado` con las características que quedaron.
 */
@Component({
  selector: 'app-editar-caracteristicas-modal',
  standalone: true,
  imports: [DialogDirective, FormsModule, CamposCaracteristicasComponent],
  template: `
    @if (objetivo; as o) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" (click)="cerrado.emit()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between px-6 pt-6 pb-3">
            <div class="min-w-0">
              <h2 class="text-lg font-bold text-gray-800">{{ o.tipo === 'lote' ? 'Características del lote' : 'Características' }}</h2>
              <p class="text-xs text-gray-400 mt-0.5 truncate">{{ o.titulo }}</p>
            </div>
            <button aria-label="Cerrar" (click)="cerrado.emit()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-6 py-2">
            <app-campos-caracteristicas #editor [plantilla]="plantilla" [valores]="valores" [sugeridos]="sugeridos" />
            @if (o.tipo === 'item' && cambiaRegistrado()) {
              <!-- Cambiar un valor que ya estaba registrado deja rastro: queda en el historial con el motivo. -->
              <label class="block mt-4">
                <span class="block text-xs font-medium text-gray-600 mb-1">Motivo del cambio <span class="text-red-500">*</span></span>
                <textarea rows="2" [(ngModel)]="motivo" maxlength="500"
                  placeholder="Ej: se le subió la RAM a 16 GB"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"></textarea>
                <span class="block text-[11px] text-gray-400 mt-0.5">Queda en el historial del equipo junto con quién lo cambió y cuándo.</span>
              </label>
            }
            @if (error) {
              <p class="text-red-600 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
            }

            @if (o.tipo === 'item') {
              <!-- Historial: con qué llegó, qué cambió, quién lo registró y quién tenía el equipo entre cambios. -->
              <div class="mt-5 border-t border-gray-100 pt-4 pb-2">
                <p class="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Historial</p>
                @if (historial === null) {
                  <p class="text-xs text-gray-400">Cargando…</p>
                } @else if (!historial.length) {
                  <p class="text-xs text-gray-400">Sin cambios registrados todavía.</p>
                } @else {
                  <ol class="space-y-3">
                    @for (h of historial; track h.id_historial) {
                      <li class="rounded-lg border border-gray-100 p-2.5 text-xs">
                        <p class="text-gray-500">
                          <span class="font-semibold text-gray-700">{{ h.inicial ? 'Registro inicial' : 'Cambio' }}</span>
                          · {{ fechaHora(h.fecha) }} · {{ h.registrado_por || 'Usuario desconocido' }}
                        </p>
                        @if (h.motivo && !h.inicial) { <p class="text-gray-600 mt-0.5 italic">«{{ h.motivo }}»</p> }
                        <ul class="mt-1 space-y-0.5">
                          @for (c of h.cambios; track c.clave) {
                            <li class="text-gray-700">
                              {{ c.campo }}:
                              @if (h.inicial) { <b>{{ c.despues }}</b> }
                              @else { <span class="line-through text-gray-400">{{ c.antes || 'vacío' }}</span> → <b>{{ c.despues || 'vacío' }}</b> }
                            </li>
                          }
                        </ul>
                        @if (!h.inicial) {
                          @if (h.lo_tuvieron.length) {
                            <div class="mt-1.5 rounded-md bg-amber-50 border border-amber-100 px-2 py-1 text-amber-800">
                              <p class="font-medium">Lo tuvieron desde el registro anterior:</p>
                              @for (t of h.lo_tuvieron; track t.desde) {
                                <p>{{ t.persona || 'Persona sin identificar' }} · {{ t.tipo === 'PRESTAMO' ? 'préstamo' : t.tipo === 'FICHA' ? 'entregado a ' + (t.referencia || 'una ficha') : 'salida ' + (t.referencia || '') }}
                                  · {{ fecha(t.desde) }} → {{ t.hasta ? fecha(t.hasta) : 'sin devolver' }}</p>
                              }
                            </div>
                          } @else {
                            <p class="mt-1 text-gray-400">Nadie lo sacó de la bodega desde el registro anterior.</p>
                          }
                        }
                      </li>
                    }
                  </ol>
                }
              </div>
            }
          </div>
          <div class="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
            <button (click)="cerrado.emit()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
            <button (click)="guardar()" [disabled]="guardando"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60" style="background-color: var(--accent-brand)">
              {{ guardando ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class EditarCaracteristicasModalComponent implements OnChanges {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);
  private readonly plantillas = inject(PlantillasCaracteristicasService);

  /** null = cerrado. */
  @Input() objetivo: ObjetivoCaracteristicas | null = null;
  @Output() cerrado = new EventEmitter<void>();
  @Output() guardado = new EventEmitter<Record<string, string>>();
  @ViewChild('editor') editor?: CamposCaracteristicasComponent;

  valores: Record<string, any> = {};
  plantilla: PlantillaCaracteristicas | null = null;
  sugeridos: string[] = [];
  historial: RegistroCaracteristicas[] | null = null;
  motivo = '';
  error: string | null = null;
  guardando = false;

  ngOnChanges(changes: SimpleChanges): void {
    const o = this.objetivo;
    if (!changes['objetivo'] || !o) return;
    this.valores = { ...o.caracteristicas };
    this.motivo = '';
    this.error = null;
    this.sugeridos = [];
    const ya = this.plantillas.deSync(o.codigoPlantilla);
    this.plantilla = ya ?? null;
    if (ya === undefined) void this.plantillas.de(o.codigoPlantilla).then((p) => this.objetivo === o && (this.plantilla = p)).catch(() => undefined);
    void this.api.sugerenciasCaracteristicas(o.id_producto)
      .then((s) => this.objetivo === o && (this.sugeridos = s.campos.map((c) => c.campo)))
      .catch(() => undefined);
    this.historial = o.tipo === 'item' ? null : [];
    if (o.tipo === 'item') {
      void this.api.historialCaracteristicasItem(o.id)
        .then((h) => this.objetivo === o && (this.historial = h))
        .catch(() => this.objetivo === o && (this.historial = []));
    }
  }

  /** ¿Se cambia o borra un valor que ya estaba registrado? Entonces el motivo es obligatorio (igual que el backend). */
  cambiaRegistrado(): boolean {
    const o = this.objetivo;
    if (!o) return false;
    const nuevos = valoresLimpios(this.valores);
    return Object.entries(o.caracteristicas).some(([k, v]) => (nuevos[k] ?? '') !== v);
  }

  async guardar(): Promise<void> {
    const o = this.objetivo;
    if (!o) return;
    if (this.editor?.hayErrores) {
      this.error = 'Revisa los campos marcados en rojo.';
      return;
    }
    const motivo = this.motivo.trim();
    if (o.tipo === 'item' && this.cambiaRegistrado() && motivo.length < 5) {
      this.error = 'Escribe el motivo del cambio (mínimo 5 caracteres): queda en el historial del equipo.';
      return;
    }
    this.guardando = true;
    this.error = null;
    try {
      const limpias = valoresLimpios(this.valores);
      const r = o.tipo === 'item'
        ? await this.api.actualizarCaracteristicasItem(o.id, limpias, motivo || undefined)
        : await this.api.actualizarCaracteristicasLote(o.id, limpias);
      this.toast.ok('Características guardadas');
      this.guardado.emit(r.caracteristicas ?? {});
    } catch (e) {
      this.error = mensajeDeError(e, 'No se pudieron guardar las características.');
    } finally {
      this.guardando = false;
    }
  }

  fecha(iso: string): string {
    return new Date(iso + 'Z').toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  fechaHora(iso: string): string {
    return new Date(iso + 'Z').toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
