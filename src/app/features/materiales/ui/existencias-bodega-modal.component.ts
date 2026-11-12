import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { ToastService } from '../../../core/services/toast.service';
import { ElementoExistencia, ExistenciasDeBodega, MaterialesApiService } from '../data-access/materiales-api.service';
import { ConteoSeleccion, contarSeleccion, mensajeResultado, nombreElemento } from '../existencias-bodega.util';

/**
 * <app-existencias-bodega-modal> — botón "Desactivar" de la pestaña Productos
 * de Mi Bodega (2026-11-12, boceto aprobado por el dueño). Actúa sobre las
 * unidades (devolutivo) o lotes (consumo/perecedero) de UNA ficha en UNA
 * bodega, nunca sobre la ficha:
 *  - "Eliminar N": registro por error; se borran sin rastro (solo los que no
 *    tienen historia).
 *  - "Desactivar N": existieron y ya no están; quedan en el historial (pide motivo).
 * Se cierra con la X; no hay botón Cancelar.
 */
@Component({
  selector: 'app-existencias-bodega-modal',
  standalone: true,
  imports: [DialogDirective, FormsModule],
  template: `
    @if (open) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="cerrar()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3 shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-5 border-b border-gray-100">
            <div class="min-w-0">
              <h2 class="text-base font-bold text-gray-800 truncate">{{ nombre }}</h2>
              <p class="text-xs text-gray-400 mt-0.5">{{ bodegaNombre }}</p>
            </div>
            <button type="button" aria-label="Cerrar" (click)="cerrar()" [disabled]="trabajando" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 space-y-3">
            @if (cargando) {
              <p class="text-sm text-gray-400 py-6 text-center">Cargando…</p>
            } @else if (errorCarga) {
              <div class="text-sm text-gray-500 py-6 text-center">
                No se pudo cargar.
                <button type="button" (click)="cargar()" class="ml-1 text-[#2f8a00] font-medium hover:underline">Reintentar</button>
              </div>
            } @else if (!datos?.elementos?.length) {
              <p class="text-sm text-gray-500 py-6 text-center">Esta ficha no tiene {{ plural }} en esta bodega.</p>
            } @else {
              <p class="text-xs font-medium text-gray-500">{{ tituloLista }}</p>
              <div class="rounded-xl border border-gray-200 divide-y divide-gray-100">
                <label class="flex items-center gap-3 px-3 py-2 bg-gray-50/70 text-sm font-medium text-gray-700 cursor-pointer rounded-t-xl">
                  <input type="checkbox" class="accent-[#39A900] w-4 h-4" [checked]="todosMarcados" [indeterminate]="algunoMarcado && !todosMarcados" (change)="marcarTodos($any($event.target).checked)" [disabled]="trabajando" />
                  Seleccionar todas ({{ seleccionables.length }})
                </label>
                @for (e of elementos; track e.id) {
                  <label class="flex items-start gap-3 px-3 py-2 text-sm" [class.cursor-pointer]="usable(e)" [class.opacity-60]="!usable(e)">
                    <input type="checkbox" class="accent-[#39A900] w-4 h-4 mt-0.5" [checked]="seleccion.has(e.id)" (change)="alternar(e, $any($event.target).checked)" [disabled]="!usable(e) || trabajando" />
                    <span class="flex-1 min-w-0">
                      <span class="flex items-baseline justify-between gap-3">
                        <span class="font-medium text-gray-800 truncate">{{ e.referencia }}</span>
                        <span class="text-xs text-gray-500 shrink-0">{{ e.detalle }}</span>
                      </span>
                      @if (!e.eliminable) {
                        <span class="block text-xs text-gray-400 mt-0.5">
                          {{ e.desactivable ? 'Solo desactivar: ' + e.motivo_no_eliminar : 'No se puede: ' + e.motivo_no_desactivar }}
                        </span>
                      }
                    </span>
                  </label>
                }
              </div>

              @if (conteo.conHistoria > 0) {
                <p class="text-xs text-gray-500">ⓘ {{ conteo.conHistoria }} {{ conteo.conHistoria === 1 ? 'seleccionada ya tiene' : 'seleccionadas ya tienen' }} historia: no se {{ conteo.conHistoria === 1 ? 'puede' : 'pueden' }} eliminar, solo desactivar.</p>
              }

              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1" for="motivo-desactivar">Motivo <span class="font-normal text-gray-400">(solo para desactivar)</span></label>
                <input id="motivo-desactivar" type="text" maxlength="300" [(ngModel)]="motivo" [disabled]="trabajando"
                  placeholder="Por ejemplo: se dañó, se perdió, se dio de baja"
                  class="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30"
                  [class]="errorMotivo ? 'border-red-400 bg-red-50' : 'border-gray-200'" />
                @if (errorMotivo) { <p class="text-xs text-red-600 mt-1">{{ errorMotivo }}</p> }
              </div>

              <p class="text-xs text-gray-400">La ficha y las demás bodegas no cambian.</p>
            }
          </div>

          @if (datos?.elementos?.length) {
            <div class="flex gap-3 shrink-0 border-t border-gray-100 bg-gray-50/70 px-4 py-3 sm:px-6">
              <button type="button" (click)="desactivar()" [disabled]="trabajando || !conteo.desactivables.length"
                class="flex-1 h-10 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                Desactivar {{ conteo.desactivables.length }}
              </button>
              <button type="button" (click)="eliminar()" [disabled]="trabajando || !conteo.eliminables.length"
                class="flex-1 h-10 rounded-lg bg-red-100 text-sm font-semibold text-red-600 hover:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed">
                Eliminar {{ conteo.eliminables.length }}
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class ExistenciasBodegaModalComponent implements OnChanges {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);

  @Input() open = false;
  @Input() idProducto: string | null = null;
  @Input() nombre = '';
  @Input() idSitio: string | null = null;
  @Input() bodegaNombre = '';
  @Output() closed = new EventEmitter<void>();
  /** Se eliminó o desactivó algo: el padre recarga la pantalla. */
  @Output() cambio = new EventEmitter<void>();

  datos: ExistenciasDeBodega | null = null;
  seleccion = new Set<string>();
  conteo: ConteoSeleccion = { seleccionados: 0, eliminables: [], desactivables: [], conHistoria: 0 };
  cargando = false;
  errorCarga = false;
  trabajando = false;
  motivo = '';
  errorMotivo = '';

  ngOnChanges(c: SimpleChanges): void {
    if ((c['open'] || c['idProducto'] || c['idSitio']) && this.open) void this.cargar();
  }

  get elementos(): ElementoExistencia[] {
    return this.datos?.elementos ?? [];
  }
  get plural(): string {
    return nombreElemento(this.datos?.tipo_material ?? '', 2);
  }
  get tituloLista(): string {
    return this.plural.charAt(0).toUpperCase() + this.plural.slice(1) + ' en esta bodega';
  }
  /** Ni eliminable ni desactivable (p. ej. prestada): se muestra con su motivo, sin casilla. */
  usable(e: ElementoExistencia): boolean {
    return e.eliminable || e.desactivable;
  }
  get seleccionables(): ElementoExistencia[] {
    return (this.datos?.elementos ?? []).filter((e) => this.usable(e));
  }
  get todosMarcados(): boolean {
    return this.seleccionables.length > 0 && this.seleccionables.every((e) => this.seleccion.has(e.id));
  }
  get algunoMarcado(): boolean {
    return this.seleccion.size > 0;
  }

  async cargar(): Promise<void> {
    if (!this.idProducto || !this.idSitio) return;
    this.cargando = true;
    this.errorCarga = false;
    this.motivo = '';
    this.errorMotivo = '';
    try {
      this.datos = await this.api.listarExistenciasDeBodega(this.idProducto, this.idSitio);
      this.seleccion = new Set(this.seleccionables.map((e) => e.id));
    } catch (e) {
      this.datos = null;
      this.errorCarga = true;
      this.toast.httpError(e, 'No se pudieron leer las existencias de esta bodega.');
    } finally {
      this.cargando = false;
      this.recontar();
    }
  }

  marcarTodos(marcar: boolean): void {
    this.seleccion = new Set(marcar ? this.seleccionables.map((e) => e.id) : []);
    this.recontar();
  }

  alternar(e: ElementoExistencia, marcar: boolean): void {
    const s = new Set(this.seleccion);
    if (marcar) s.add(e.id);
    else s.delete(e.id);
    this.seleccion = s;
    this.recontar();
  }

  private recontar(): void {
    this.conteo = contarSeleccion(this.datos?.elementos ?? [], this.seleccion);
  }

  cerrar(): void {
    if (!this.trabajando) this.closed.emit();
  }

  async eliminar(): Promise<void> {
    if (!this.idProducto || !this.idSitio || !this.conteo.eliminables.length) return;
    this.trabajando = true;
    try {
      const r = await this.api.eliminarExistenciasDeBodega(this.idProducto, this.idSitio, this.conteo.eliminables);
      this.toast.ok(mensajeResultado('eliminar', r));
      this.cambio.emit();
      this.closed.emit();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar.');
      await this.cargar();
    } finally {
      this.trabajando = false;
    }
  }

  async desactivar(): Promise<void> {
    if (!this.idProducto || !this.idSitio || !this.conteo.desactivables.length) return;
    if (this.motivo.trim().length < 5) {
      this.errorMotivo = 'Escribe el motivo (mínimo 5 caracteres) para desactivar.';
      return;
    }
    this.errorMotivo = '';
    this.trabajando = true;
    try {
      const r = await this.api.desactivarExistenciasDeBodega(
        this.idProducto,
        this.idSitio,
        this.conteo.desactivables,
        this.motivo.trim(),
      );
      this.toast.ok(mensajeResultado('desactivar', r));
      this.cambio.emit();
      this.closed.emit();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo desactivar.');
      await this.cargar();
    } finally {
      this.trabajando = false;
    }
  }
}
