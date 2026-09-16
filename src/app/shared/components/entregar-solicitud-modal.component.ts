import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Item,
  MaterialesApiService,
  SeleccionLineaEntregaInput,
  Solicitud,
} from '../../core/services/materiales/materiales-api.service';

interface LineaParaElegir {
  id_detalle: string | null;
  id_producto: string;
  nombre: string;
  cantidad: number;
  opciones: Item[];
  elegidos: string[];
}

/**
 * Modal de "Marcar en entrega" con las dos opciones (2026-09-16, pedido
 * explícito: "lo ideal sería tener las dos opciones") — Automático (de
 * siempre: los primeros N ítems DISPONIBLE por línea) o Manual (el
 * responsable elige a mano qué placa(s) puntuales entregar, por ejemplo para
 * descartar una unidad en mal estado aunque figure DISPONIBLE en el sistema).
 *
 * Componente único para admin/instructor/aprendiz-encargado — las 3
 * pantallas de Solicitudes ya usaban el mismo patrón "el padre llama a la
 * API y maneja el toast/recarga"; este modal es "tonto": solo junta la
 * selección y la emite, no llama a `entregarSolicitud` él mismo.
 *
 * Solo ofrece elegir las líneas DEVOLUTIVAS (`id_producto` sin `id_lote`) —
 * un lote consumible no tiene unidad individual que elegir, se sigue
 * decrementando automático. Si la solicitud no tiene ninguna línea
 * devolutiva, `tieneLineasParaElegir` da `false` y el padre puede saltarse
 * el modal directo (entrega automática, sin nada que elegir).
 */
@Component({
  selector: 'app-entregar-solicitud-modal',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (abierto) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cancelar()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Marcar en entrega</h2>
            <button (click)="cancelar()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          @if (loading) {
            <p class="text-sm text-gray-400 py-6 text-center">Cargando ítems disponibles…</p>
          } @else if (lineas.length === 0) {
            <p class="text-sm text-gray-500">
              Esta solicitud no tiene ítems para elegir (solo consumibles/lotes) — se entrega automático.
            </p>
            <div class="flex justify-end gap-2 mt-6">
              <button (click)="cancelar()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
              <button (click)="confirmar()" class="px-5 py-2 text-white text-sm font-medium rounded-lg transition-colors" style="background-color: #39A900">
                Confirmar entrega
              </button>
            </div>
          } @else {
            <div class="flex rounded-xl border border-gray-200 bg-gray-50 p-1 mb-5">
              <button type="button" (click)="modo = 'auto'"
                class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                [class.bg-white]="modo === 'auto'" [class.shadow-sm]="modo === 'auto'"
                [class.text-gray-800]="modo === 'auto'" [class.text-gray-400]="modo !== 'auto'">
                Automático
              </button>
              <button type="button" (click)="modo = 'manual'"
                class="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                [class.bg-white]="modo === 'manual'" [class.shadow-sm]="modo === 'manual'"
                [class.text-gray-800]="modo === 'manual'" [class.text-gray-400]="modo !== 'manual'">
                Elegir placas
              </button>
            </div>

            @if (modo === 'auto') {
              <p class="text-xs text-gray-400 mb-4">
                El sistema elige automáticamente las primeras unidades disponibles de cada producto.
              </p>
            } @else {
              <p class="text-xs text-gray-400 mb-4">
                Elegí exactamente la cantidad pedida de cada línea. Útil para descartar una unidad en mal estado
                aunque el sistema la marque disponible.
              </p>
              <div class="space-y-4">
                @for (linea of lineas; track linea.id_producto + (linea.id_detalle ?? '')) {
                  <div class="rounded-xl border border-gray-100 p-3">
                    <div class="flex items-center justify-between mb-2">
                      <p class="text-sm font-semibold text-gray-800">{{ linea.nombre }}</p>
                      <span class="text-[11px] font-semibold rounded-full px-2 py-0.5"
                        [class.bg-green-50]="linea.elegidos.length === linea.cantidad"
                        [class.text-green-700]="linea.elegidos.length === linea.cantidad"
                        [class.bg-amber-50]="linea.elegidos.length !== linea.cantidad"
                        [class.text-amber-700]="linea.elegidos.length !== linea.cantidad">
                        {{ linea.elegidos.length }} / {{ linea.cantidad }}
                      </span>
                    </div>
                    @if (linea.opciones.length === 0) {
                      <p class="text-xs text-red-500">No hay unidades disponibles de este producto.</p>
                    } @else {
                      <div class="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                        @for (item of linea.opciones; track item.id_item) {
                          <label class="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg border cursor-pointer transition-colors"
                            [class.border-[#39A900]]="estaElegido(linea, item.id_item)"
                            [class.bg-green-50]="estaElegido(linea, item.id_item)"
                            [class.border-gray-200]="!estaElegido(linea, item.id_item)"
                            [class.opacity-40]="!estaElegido(linea, item.id_item) && linea.elegidos.length >= linea.cantidad">
                            <input type="checkbox" class="accent-[#39A900]"
                              [checked]="estaElegido(linea, item.id_item)"
                              [disabled]="!estaElegido(linea, item.id_item) && linea.elegidos.length >= linea.cantidad"
                              (change)="toggleItem(linea, item.id_item)" />
                            <span class="font-mono truncate">{{ item.placa_sena || item.codigo_sku || item.id_item.slice(0, 8) }}</span>
                          </label>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <div class="flex justify-end gap-2 mt-6">
              <button (click)="cancelar()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
              <button (click)="confirmar()" [disabled]="modo === 'manual' && !manualCompleto"
                class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                style="background-color: #39A900">
                Confirmar entrega
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class EntregarSolicitudModalComponent implements OnChanges {
  @Input() abierto = false;
  @Input({ required: true }) solicitud!: Solicitud;
  @Output() cerrado = new EventEmitter<void>();
  @Output() confirmado = new EventEmitter<SeleccionLineaEntregaInput[] | undefined>();

  modo: 'auto' | 'manual' = 'auto';
  loading = false;
  lineas: LineaParaElegir[] = [];

  constructor(private api: MaterialesApiService) {}

  ngOnChanges(): void {
    if (this.abierto) {
      this.modo = 'auto';
      this.prepararLineas();
    }
  }

  /** ¿Alguna línea es devolutiva (tiene ítems puntuales para elegir)? Si no,
   *  el padre puede saltarse el modal directo — no hay nada que elegir. */
  get tieneLineasParaElegir(): boolean {
    if (this.solicitud.lineas?.length) {
      return this.solicitud.lineas.some((l) => !l.id_lote && l.id_producto);
    }
    return !!this.solicitud.id_producto && this.solicitud.producto?.tipo_material === 'DEVOLUTIVO';
  }

  private async prepararLineas(): Promise<void> {
    const base = this.solicitud.lineas?.length
      ? this.solicitud.lineas
          .filter((l) => !l.id_lote && l.id_producto)
          .map((l) => ({ id_detalle: l.id_detalle as string | null, id_producto: l.id_producto as string, nombre: l.producto_nombre ?? 'Producto', cantidad: l.cantidad }))
      : this.tieneLineasParaElegir
        ? [{ id_detalle: null, id_producto: this.solicitud.id_producto as string, nombre: this.solicitud.producto?.nombre ?? 'Producto', cantidad: this.solicitud.cantidad }]
        : [];

    if (base.length === 0) {
      this.lineas = [];
      return;
    }
    this.loading = true;
    try {
      this.lineas = await Promise.all(
        base.map(async (l) => {
          const items = await this.api.listarItems(l.id_producto);
          return { ...l, opciones: items.filter((i) => i.estado === 'DISPONIBLE'), elegidos: [] as string[] };
        }),
      );
    } finally {
      this.loading = false;
    }
  }

  estaElegido(linea: LineaParaElegir, idItem: string): boolean {
    return linea.elegidos.includes(idItem);
  }

  toggleItem(linea: LineaParaElegir, idItem: string): void {
    const idx = linea.elegidos.indexOf(idItem);
    if (idx >= 0) {
      linea.elegidos.splice(idx, 1);
    } else if (linea.elegidos.length < linea.cantidad) {
      linea.elegidos.push(idItem);
    }
  }

  get manualCompleto(): boolean {
    return this.lineas.every((l) => l.elegidos.length === l.cantidad);
  }

  cancelar(): void {
    this.cerrado.emit();
  }

  confirmar(): void {
    if (this.modo === 'auto' || this.lineas.length === 0) {
      this.confirmado.emit(undefined);
      return;
    }
    this.confirmado.emit(this.lineas.map((l) => ({ id_detalle: l.id_detalle, id_items: l.elegidos })));
  }
}
