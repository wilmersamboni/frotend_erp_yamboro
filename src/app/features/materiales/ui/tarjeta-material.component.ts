import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { EditarCaracteristicasModalComponent, ObjetivoCaracteristicas } from './editar-caracteristicas-modal.component';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { Item, Lote, PlantillaCaracteristicas, Producto } from '../data-access/materiales-api.service';
import { camposPropios, gruposDe, resumenCaracteristicas } from '../caracteristicas-equipo.util';
import { PlantillasCaracteristicasService } from './caracteristicas-equipo.component';

const TIPO: Record<string, { texto: string; clases: string }> = {
  DEVOLUTIVO: { texto: 'Devolutivo', clases: 'bg-blue-50 text-blue-700 border-blue-200' },
  CONSUMO: { texto: 'Consumo', clases: 'bg-green-50 text-green-700 border-green-200' },
  PERECEDERO: { texto: 'Perecedero', clases: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const ESTADO: Record<string, string> = {
  DISPONIBLE: 'bg-green-50 text-green-700',
  PRESTADO: 'bg-blue-50 text-blue-700',
  RESERVADO: 'bg-indigo-50 text-indigo-700',
  FUERA_DE_SEDE: 'bg-purple-50 text-purple-700',
  EN_MANTENIMIENTO: 'bg-amber-50 text-amber-700',
  DAÑADO: 'bg-red-50 text-red-700',
  PERDIDO: 'bg-red-50 text-red-700',
};

/**
 * <app-tarjeta-material> — tarjeta que se abre al tocar un producto o un ítem en Mi Bodega / Bodegas (2026-10-09,
 * pedido del dueño). Muestra la ficha (nombre, marca/modelo, categoría, tipo, unidad, UNSPSC, descripción) y:
 *  - con un ítem: su placa, estado y características técnicas completas (si su categoría las lleva);
 *  - con un producto: lo que hay en ESTA bodega — las unidades (con su resumen de características; tocar una abre
 *    su detalle) o los lotes con saldo y vencimiento.
 * Solo lee: lo que ya cargó la pantalla, más la plantilla de características (una vez por sesión).
 */
@Component({
  selector: 'app-tarjeta-material',
  standalone: true,
  imports: [DialogDirective, EditarCaracteristicasModalComponent],
  template: `
    @if (producto; as p) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="closed.emit()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <!-- Encabezado: la ficha -->
          <div class="px-5 pt-5 pb-3 border-b border-gray-100">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                @if (itemSel) {
                  <button type="button" (click)="volverAProducto()" class="text-xs font-medium text-[#2d8000] hover:underline mb-1">← {{ p.nombre }}</button>
                }
                <h2 class="text-lg font-bold text-gray-800 leading-snug">{{ p.nombre }}</h2>
                <p class="text-sm text-gray-500">{{ marcaModelo(p) }}</p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border" [class]="tipo(p).clases">{{ tipo(p).texto }}</span>
                <button type="button" aria-label="Cerrar" (click)="closed.emit()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
              </div>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
            @if (itemSel; as it) {
              <!-- Una unidad -->
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-mono font-semibold text-gray-800">{{ it.placa_sena || 'Sin placa SENA' }}</span>
                <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full" [class]="claseEstado(it.estado)">{{ estadoLegible(it.estado) }}</span>
                @if (it.activo === false) { <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Desactivado</span> }
              </div>
              @if (bodegaNombre) { <p class="text-xs text-gray-500">En {{ bodegaNombre }}</p> }

              <div>
                <div class="flex items-center justify-between mb-2">
                  <p class="text-[11px] font-bold uppercase tracking-wider text-gray-400">Características</p>
                  @if (puedeEditarItem) {
                    <button type="button" (click)="editarItem(it)"
                      class="px-3 py-1 rounded-full text-xs font-semibold border border-[#39A900]/40 text-[#2d8000] bg-[#39A900]/5 hover:bg-[#39A900]/10">Editar características</button>
                  }
                </div>
                @if (!tieneCaracteristicas(it)) {
                  <p class="text-sm text-gray-400">Sin registrar.</p>
                } @else {
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    @for (g of gruposConValor(it); track g.grupo) {
                      <div class="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2">
                        <p class="text-[11px] font-semibold text-gray-500">{{ g.grupo }}</p>
                        @for (c of g.campos; track c.clave) {
                          <p class="text-sm text-gray-800">
                            @if (c.etiqueta !== g.grupo) { <span class="text-gray-400 text-xs">{{ c.etiqueta }}: </span> }
                            {{ valor(it, c.clave, c.unidad) }}
                          </p>
                        }
                      </div>
                    }
                    @if (propiosDe(it).length) {
                      <div class="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2" [class.sm:col-span-2]="!gruposConValor(it).length">
                        @if (gruposConValor(it).length) { <p class="text-[11px] font-semibold text-gray-500">Otros</p> }
                        @for (c of propiosDe(it); track c.campo) {
                          <p class="text-sm text-gray-800"><span class="text-gray-400 text-xs">{{ c.campo }}: </span>{{ c.valor }}</p>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            } @else {
              <!-- El producto en esta bodega -->
              @if (p.descripcion) { <p class="text-sm text-gray-600">{{ p.descripcion }}</p> }
              <div>
                <p class="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">En {{ bodegaNombre || 'esta bodega' }}</p>
                @if (p.tipo_material === 'DEVOLUTIVO') {
                  @if (!unidades.length) {
                    <p class="text-sm text-gray-400">No hay unidades en esta bodega.</p>
                  } @else {
                    <p class="text-sm text-gray-700 mb-2">{{ disponibles }} disponible(s) de {{ unidades.length }} unidad(es).</p>
                    <ul class="divide-y divide-gray-100 rounded-lg border border-gray-100">
                      @for (u of unidades; track u.id_item) {
                        <li>
                          <button type="button" (click)="verItem(u)" class="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start justify-between gap-3">
                            <span class="min-w-0">
                              <span class="block text-sm font-mono text-gray-800">{{ u.placa_sena || 'Sin placa' }}</span>
                              <span class="block text-xs text-gray-500 truncate">{{ resumen(u) || 'Características sin registrar' }}</span>
                            </span>
                            <span class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full" [class]="claseEstado(u.estado)">{{ estadoLegible(u.estado) }}</span>
                          </button>
                        </li>
                      }
                    </ul>
                  }
                } @else {
                  @if (!lotes.length) {
                    <p class="text-sm text-gray-400">No hay lotes activos en esta bodega.</p>
                  } @else {
                    <ul class="divide-y divide-gray-100 rounded-lg border border-gray-100">
                      @for (l of lotes; track l.id_lote) {
                        <li class="px-3 py-2 flex items-start justify-between gap-3 text-sm">
                          <span class="min-w-0">
                            <span class="block font-mono text-gray-800">{{ l.codigo_lote || 'Lote sin código' }}</span>
                            @if (l.fecha_vencimiento) { <span class="block text-xs text-gray-500">Vence {{ fechaCorta(l.fecha_vencimiento) }}</span> }
                            @if (resumen(l)) { <span class="block text-xs text-gray-500">{{ resumen(l) }}</span> }
                            @if (puedeEditarLote) {
                              <button type="button" (click)="editarLote(l)" class="mt-0.5 text-xs font-medium text-[#2d8000] hover:underline">
                                {{ resumen(l) ? 'Editar características' : '+ Agregar características' }}
                              </button>
                            }
                          </span>
                          <span class="shrink-0 text-gray-700">{{ l.cantidad_disponible }} / {{ l.cantidad_inicial }} <span class="text-xs text-gray-400">{{ p.unidad_medida }}</span></span>
                        </li>
                      }
                    </ul>
                  }
                }
              </div>
            }

            <!-- Datos de la ficha -->
            <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2 text-xs border-t border-gray-100 pt-3">
              <div><dt class="text-gray-400">Categoría</dt><dd class="text-gray-700 font-medium">{{ p.categoria?.nombre || '—' }}</dd></div>
              <div><dt class="text-gray-400">Unidad</dt><dd class="text-gray-700 font-medium">{{ p.unidad_medida }}</dd></div>
              <div><dt class="text-gray-400">UNSPSC</dt><dd class="text-gray-700 font-medium">{{ p.codigo_unspsc || '—' }}</dd></div>
              @if (p.SKU) { <div><dt class="text-gray-400">SKU</dt><dd class="text-gray-700 font-medium">{{ p.SKU }}</dd></div> }
            </dl>
          </div>
        </div>
      </div>
    }

    <app-editar-caracteristicas-modal [objetivo]="editando" (cerrado)="editando = null" (guardado)="onGuardado($event)" />
  `,
})
export class TarjetaMaterialComponent implements OnChanges {
  private readonly plantillas = inject(PlantillasCaracteristicasService);

  /** Ficha a mostrar; null = cerrada. */
  @Input() producto: Producto | null = null;
  /** Si viene, la tarjeta abre directo en esa unidad. */
  @Input() item: Item | null = null;
  /** Unidades y lotes de ESTE producto en la bodega (ya filtrados por la pantalla). */
  @Input() unidades: Item[] = [];
  @Input() lotes: Lote[] = [];
  @Input() bodegaNombre: string | null = null;
  /** `materiales.items.editar` / `materiales.lotes.editar`: muestran "Editar características". */
  @Input() puedeEditarItem = false;
  @Input() puedeEditarLote = false;
  @Output() closed = new EventEmitter<void>();
  /** Se guardaron características: el padre actualiza su lista (la tarjeta ya muestra lo nuevo). */
  @Output() caracteristicasGuardadas = new EventEmitter<{ tipo: 'item' | 'lote'; id: string; caracteristicas: Record<string, string> }>();

  editando: ObjetivoCaracteristicas | null = null;

  itemSel: Item | null = null;
  plantilla: PlantillaCaracteristicas | null = null;
  grupos: ReturnType<typeof gruposDe> = [];

  ngOnChanges(changes: SimpleChanges): void {
    // Solo al abrir otra ficha u otro ítem: las listas pueden llegar como arreglo nuevo en cada redibujado del padre
    // y no deben devolver la tarjeta al producto mientras se mira una unidad.
    if (changes['producto'] || changes['item']) {
      this.itemSel = this.item;
      if (changes['producto']) void this.cargarPlantilla();
    }
  }

  private get codigoPlantilla(): string | null {
    const p = this.producto;
    return p?.tipo_material === 'DEVOLUTIVO' ? p.categoria?.plantilla_caracteristicas ?? null : null;
  }

  private async cargarPlantilla(): Promise<void> {
    const p = this.producto;
    const codigo = this.codigoPlantilla;
    // Si la pantalla ya precargó las listas, se pinta en el mismo instante (antes tardaba ~½ s en Ítems).
    const ya = this.plantillas.deSync(codigo);
    if (ya !== undefined) {
      this.plantilla = ya;
      this.grupos = gruposDe(ya);
      return;
    }
    try {
      const pl = await this.plantillas.de(codigo);
      if (this.producto === p) {
        this.plantilla = pl;
        this.grupos = gruposDe(pl);
      }
    } catch {
      this.plantilla = null;
      this.grupos = [];
    }
  }

  get disponibles(): number {
    return this.unidades.filter((u) => u.estado === 'DISPONIBLE').length;
  }

  /** Grupos de la lista sugerida que tienen algún valor en esta unidad. */
  gruposConValor(it: Item) {
    return this.grupos
      .map((g) => ({ grupo: g.grupo, campos: g.campos.filter((c) => !!it.caracteristicas?.[c.clave]) }))
      .filter((g) => g.campos.length);
  }

  propiosDe(it: Item): { campo: string; valor: string }[] {
    return camposPropios(it.caracteristicas);
  }

  editarItem(it: Item): void {
    this.editando = {
      tipo: 'item',
      id: it.id_item,
      id_producto: it.id_producto,
      titulo: `${this.producto?.nombre ?? ''} · ${it.placa_sena ? 'Placa ' + it.placa_sena : 'Sin placa'}`,
      codigoPlantilla: this.codigoPlantilla,
      caracteristicas: { ...(it.caracteristicas ?? {}) },
    };
  }

  editarLote(l: Lote): void {
    this.editando = {
      tipo: 'lote',
      id: l.id_lote,
      id_producto: l.id_producto,
      titulo: `${this.producto?.nombre ?? ''} · ${l.codigo_lote || 'Lote sin código'}`,
      codigoPlantilla: null,
      caracteristicas: { ...(l.caracteristicas ?? {}) },
    };
  }

  onGuardado(c: Record<string, string>): void {
    const e = this.editando;
    if (!e) return;
    if (e.tipo === 'item') {
      const u = this.unidades.find((x) => x.id_item === e.id) ?? (this.itemSel?.id_item === e.id ? this.itemSel : null);
      if (u) u.caracteristicas = c;
    } else {
      const l = this.lotes.find((x) => x.id_lote === e.id);
      if (l) l.caracteristicas = c;
    }
    this.caracteristicasGuardadas.emit({ tipo: e.tipo, id: e.id, caracteristicas: c });
    this.editando = null;
  }

  verItem(u: Item): void {
    this.itemSel = u;
  }

  volverAProducto(): void {
    this.itemSel = null;
  }

  tipo(p: Producto) {
    return TIPO[p.tipo_material] ?? TIPO['CONSUMO'];
  }

  marcaModelo(p: Producto): string {
    return [p.marca, p.modelo].filter(Boolean).join(' · ') || 'Sin marca';
  }

  claseEstado(estado: string): string {
    return ESTADO[estado] ?? 'bg-gray-100 text-gray-600';
  }

  estadoLegible(estado: string): string {
    const t = estado.replace(/_/g, ' ').toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  tieneCaracteristicas(it: Item): boolean {
    return Object.keys(it.caracteristicas ?? {}).length > 0;
  }

  valor(it: Item, clave: string, unidad?: string): string {
    const v = it.caracteristicas?.[clave];
    return v ? (unidad ? `${v} ${unidad}` : v) : '—';
  }

  resumen(x: Item | Lote): string {
    return resumenCaracteristicas(x.caracteristicas);
  }

  fechaCorta(iso: string): string {
    const [a, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  }
}
