import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../shared/components/admin-modal.component';
import { OpcionSelect } from '../admin/services/admin.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import {
  Categoria, Item, Lote, MaterialesApiService, Producto, Sitio,
} from '../../core/services/materiales/materiales-api.service';

type Tab = 'productos' | 'items';

const OPCIONES_TIPO_MATERIAL: OpcionSelect[] = [
  { label: 'Consumo', value: 'CONSUMO' },
  { label: 'Devolutivo', value: 'DEVOLUTIVO' },
  { label: 'Perecedero', value: 'PERECEDERO' },
];
const OPCIONES_UNIDAD: OpcionSelect[] = [
  'UNIDAD', 'PAR', 'KIT', 'JUEGO', 'METRO', 'ROLLO', 'LITRO', 'MILILITRO', 'GALÓN',
  'KILOGRAMO', 'GRAMO', 'LIBRA', 'BULTO', 'PAQUETE', 'CAJA', 'BOLSA', 'LICENCIA',
].map((u) => ({ label: u, value: u }));
const OPCIONES_ESTADO_ITEM: OpcionSelect[] = [
  { label: 'Disponible', value: 'DISPONIBLE' },
  { label: 'Prestado', value: 'PRESTADO' },
  { label: 'Dañado', value: 'DAÑADO' },
  { label: 'Perdido', value: 'PERDIDO' },
];

/**
 * "Mi Bodega" — consola del encargado de bodega (`sitio.id_responsable`).
 * Cualquier cargo. Muestra SOLO el catálogo (Productos / Ítems) de la(s)
 * bodega(s) a cargo. Los flujos (solicitudes, novedades, traslados,
 * devoluciones) NO van acá — viven en sus propios módulos, donde el backend
 * ya filtra a "las de mis bodegas" (`findForResponsable`) y el encargado puede
 * aprobar por ser el `id_responsable`.
 *
 * Ruta sin gate de `roles` — la habilita `miBodegaGuard` (¿responsable de ≥1
 * sitio?). El backend recorta todo a las bodegas del usuario; acá además se
 * filtra por la bodega elegida en el selector.
 */
@Component({
  selector: 'app-mi-bodega',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, AdminModalComponent],
  template: `
    <div class="p-6 space-y-5">
      <div class="flex flex-wrap items-center gap-3">
  <h1 class="text-xl font-bold text-gray-800">Mi Bodega</h1>
  @if (bodegas().length > 1) {
    <!-- Dropdown Moderno Personalizado -->
    <div class="relative">
      <button 
        type="button"
        (click)="toggleDropdown()"
        class="flex items-center justify-between gap-3 w-64 px-4 py-2 text-sm bg-white border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-600 transition-all">
        <span class="font-medium text-gray-700 truncate">
          {{ bodegaActual()?.nombre ?? 'Seleccionar bodega...' }}
        </span>
        <svg class="w-4 h-4 text-gray-400 transition-transform duration-200" [class.rotate-180]="dropdownOpen()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      @if (dropdownOpen()) {
        <!-- Backdrop para cerrar al hacer clic afuera -->
        <div class="fixed inset-0 z-10" (click)="dropdownOpen.set(false)"></div>

        <!-- Menú flotante -->
        <div class="absolute left-0 z-20 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div class="p-1 space-y-0.5">
            @for (b of bodegas(); track b.id_sitio) {
              <button
                type="button"
                (click)="seleccionarBodega(b.id_sitio)"
                class="w-full flex items-center justify-between px-3 py-2 text-sm text-left rounded-lg transition-colors"
                [class.bg-green-50]="bodegaSel() === b.id_sitio"
                [class.text-green-700]="bodegaSel() === b.id_sitio"
                [class.font-medium]="bodegaSel() === b.id_sitio"
                [class.text-gray-600]="bodegaSel() !== b.id_sitio"
                [class.hover:bg-gray-50]="bodegaSel() !== b.id_sitio">
                <span class="truncate">{{ b.nombre }}</span>
                @if (bodegaSel() === b.id_sitio) {
                  <svg class="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                }
              </button>
            }
          </div>
        </div>
      }
    </div>
  } @else if (bodegaActual()) {
    <span class="text-sm text-gray-500">— {{ bodegaActual()!.nombre }}</span>
  }
</div>

      @if (bodegas().length === 0 && !loading()) {
        <div class="rounded-2xl border bg-white p-8 text-center text-gray-500">
          No sos responsable de ninguna bodega.
        </div>
      } @else {
        <div class="flex gap-1 border-b">
          @for (t of tabs; track t.id) {
            <button
              class="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
              [class.border-green-600]="tab() === t.id"
              [class.text-green-700]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-gray-500]="tab() !== t.id"
              (click)="tab.set(t.id)">
              {{ t.label }}
            </button>
          }
        </div>

        @if (tab() === 'productos') {
          <app-admin-table
            [addLabel]="'Nuevo producto'"
            (add)="nuevoProd()"
            [rows]="filasProd()"
            [searchable]="true"
            [searchPlaceholder]="'Buscar por nombre, SKU, tipo…'"
            [columns]="['nombre', 'SKU', 'tipo_material', 'stock_txt']"
            [columnLabels]="{ SKU: 'SKU', tipo_material: 'Tipo', stock_txt: 'Stock (disp./total)' }"
            [loading]="loading()"
            (edit)="editarProd($event)"
            (delete)="eliminarProd($event)" />
        }

        @if (tab() === 'items') {
          <app-admin-table
            [rows]="filasItems()"
            [searchable]="true"
            [searchPlaceholder]="'Buscar por SKU, producto, placa, estado…'"
            [columns]="['codigo_sku', 'producto_nombre', 'placa_sena', 'estado']"
            [columnLabels]="{ codigo_sku: 'SKU', producto_nombre: 'Producto', placa_sena: 'Placa SENA' }"
            [loading]="loading()"
            [canDelete]="false"
            (edit)="editarItem($event)" />
        }
      }
    </div>

    <app-admin-modal
      [open]="modalOpen()"
      [editando]="editando()"
      [labelSingular]="modalKind() === 'producto' ? 'producto' : 'ítem'"
      [columns]="modalColumns"
      [form]="form"
      [opciones]="opcionesModal()"
      [columnLabels]="{ tipo_material: 'Tipo', unidad_medida: 'Unidad de medida', id_categoria: 'Categoría', stock_minimo: 'Stock mínimo', codigo_sku: 'SKU', placa_sena: 'Placa SENA' }"
      [saving]="saving()"
      [error]="error()"
      (closed)="modalOpen.set(false)"
      (saved)="guardarModal($event)" />
  `,
})
export class MiBodegaComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  bodegas = signal<Sitio[]>([]);
  bodegaSel = signal<string>('');
  bodegaActual = computed(() => this.bodegas().find((b) => b.id_sitio === this.bodegaSel()) ?? null);

  productos = signal<Producto[]>([]);
  items = signal<Item[]>([]);
  lotes = signal<Lote[]>([]);
  categorias = signal<Categoria[]>([]);

  // Agrega esta signal junto a tus otras declaraciones
dropdownOpen = signal(false);

toggleDropdown(): void {
  this.dropdownOpen.update((v) => !v);
}

seleccionarBodega(idSitio: string): void {
  this.bodegaSel.set(idSitio);
  this.dropdownOpen.set(false);
}

  tab = signal<Tab>('productos');
  tabs = [
    { id: 'productos' as Tab, label: 'Productos' },
    { id: 'items' as Tab, label: 'Ítems' },
  ];

  modalOpen = signal(false);
  modalKind = signal<'producto' | 'item'>('producto');
  editando = signal<Producto | Item | null>(null);
  form: Record<string, any> = {};

  private itemsDe = (idProducto: string) => this.items().filter((i) => i.id_producto === idProducto);
  private lotesDe = (idProducto: string) => this.lotes().filter((l) => l.id_producto === idProducto && l.estado === 'ACTIVO');

  /**
   * ¿Este producto tiene presencia real en `idSitio`? Un consumible/perecedero
   * puede tener lotes en varias bodegas distintas de su `producto.id_sitio`
   * "de casa" — filtrar solo por `p.id_sitio === bodega` (como antes) dejaba
   * afuera productos con stock real en la bodega del encargado (reporte QA
   * 2026-09-11: Pollo con lote en "Cocina Fría" invisible ahí porque su
   * `id_sitio` propio apunta a "Cuarto Frío", aunque el backend ya lo incluye
   * en `/productos` desde el fix homónimo en `ProductosRepositoryAdapter`).
   * Sin ningún ítem/lote todavía, cae al `id_sitio` propio como único dato
   * disponible — mismo criterio que `UBICACIONES_SQL` en el backend.
   */
  private estaEnBodega(p: Producto, idSitio: string): boolean {
    if (p.tipo_material === 'DEVOLUTIVO') {
      const units = this.itemsDe(p.id_producto);
      return units.length > 0 ? units.some((i) => i.id_sitio === idSitio) : p.id_sitio === idSitio;
    }
    const lotesDe = this.lotesDe(p.id_producto);
    return lotesDe.length > 0 ? lotesDe.some((l) => l.id_sitio === idSitio) : p.id_sitio === idSitio;
  }

  /** Stock EN ESTA bodega puntual (no el total del producto en todo el tenant). */
  private stockEnBodega(p: Producto, idSitio: string): string {
    if (p.tipo_material === 'DEVOLUTIVO') {
      const units = this.itemsDe(p.id_producto).filter((i) => i.id_sitio === idSitio);
      const disp = units.filter((i) => i.estado === 'DISPONIBLE').length;
      return `${disp} / ${units.length}`;
    }
    const lotesDe = this.lotesDe(p.id_producto).filter((l) => l.id_sitio === idSitio);
    const disp = lotesDe.reduce((a, l) => a + l.cantidad_disponible, 0);
    const total = lotesDe.reduce((a, l) => a + l.cantidad_inicial, 0);
    return `${disp} / ${total}`;
  }

  filasProd = computed(() => {
    const sel = this.bodegaSel();
    return this.productos()
      .filter((p) => this.estaEnBodega(p, sel))
      .map((p) => ({ ...p, stock_txt: this.stockEnBodega(p, sel) }));
  });
  filasItems = computed(() =>
    this.items()
      .filter((i) => i.id_sitio === this.bodegaSel())
      .map((i) => ({ ...i, producto_nombre: i.producto?.nombre ?? this.productos().find((p) => p.id_producto === i.id_producto)?.nombre ?? '—' })),
  );

  // Getter (no computed): tiene que reaccionar a form['tipo_material'], que es
  // un objeto plano, no un signal. Se re-evalúa en cada CD igual que en lotes/productos.
  get modalColumns(): string[] {
    if (this.modalKind() === 'item') return ['placa_sena', 'estado'];
    const base = ['nombre', 'tipo_material', 'SKU', 'unidad_medida', 'id_categoria', 'stock_minimo'];
    // "cantidad" solo al crear un DEVOLUTIVO (genera N ítems). CONSUMO/PERECEDERO carga su stock en Lotes.
    return !this.editando() && this.form['tipo_material'] === 'DEVOLUTIVO' ? [...base, 'cantidad'] : base;
  }
  opcionesModal = computed<Record<string, OpcionSelect[]>>(() => ({
    tipo_material: OPCIONES_TIPO_MATERIAL,
    unidad_medida: OPCIONES_UNIDAD,
    estado: OPCIONES_ESTADO_ITEM,
    id_categoria: this.categorias().map((c) => ({ label: c.nombre, value: c.id_categoria })),
  }));

  ngOnInit(): void {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading.set(true);
    try {
      const bodegas = await this.api.sitiosACargo();
      this.bodegas.set(bodegas);
      if (bodegas.length && !this.bodegaSel()) this.bodegaSel.set(bodegas[0].id_sitio);
      if (!bodegas.length) return;

      const [prod, items, lotes, cats] = await Promise.all([
        this.api.listarProductos().catch(() => []),
        this.api.listarItems().catch(() => []),
        this.api.listarLotes().catch(() => []),
        this.api.listarCategorias().catch(() => []),
      ]);
      this.productos.set(prod);
      this.items.set(items);
      this.lotes.set(lotes);
      this.categorias.set(cats);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar Mi Bodega.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Productos ──
  nuevoProd(): void {
    if (this.categorias().length === 0) {
      this.toast.warn('Sin categorías', 'No hay categorías creadas. Pedile a un administrador que cree al menos una.');
      return;
    }
    this.modalKind.set('producto');
    this.editando.set(null);
    this.form = {
      nombre: '', SKU: '', tipo_material: 'CONSUMO', unidad_medida: 'UNIDAD',
      id_categoria: this.categorias()[0].id_categoria, stock_minimo: 0, cantidad: 1,
    };
    this.error.set(null);
    this.modalOpen.set(true);
  }

  editarProd(fila: any): void {
    const p = this.productos().find((x) => x.id_producto === fila.id_producto);
    if (!p) return;
    this.modalKind.set('producto');
    this.editando.set(p);
    this.form = {
      nombre: p.nombre, SKU: p.SKU ?? '', tipo_material: p.tipo_material,
      unidad_medida: p.unidad_medida, id_categoria: p.id_categoria, stock_minimo: p.stock_minimo,
    };
    this.error.set(null);
    this.modalOpen.set(true);
  }

  async eliminarProd(fila: any): Promise<void> {
    if (!(await this.confirm.ask(`¿Eliminar el producto "${fila.nombre}" y todos sus ítems?`))) return;
    try {
      await this.api.eliminarProducto(fila.id_producto);
      this.toast.ok('Producto eliminado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar el producto.');
    }
  }

  // ── Ítems ──
  editarItem(fila: any): void {
    const it = this.items().find((x) => x.id_item === fila.id_item);
    if (!it) return;
    this.modalKind.set('item');
    this.editando.set(it);
    this.form = { placa_sena: it.placa_sena ?? '', estado: it.estado };
    this.error.set(null);
    this.modalOpen.set(true);
  }

  // ── Guardado del modal ──
  async guardarModal(form: Record<string, any>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      if (this.modalKind() === 'item') {
        const it = this.editando() as Item;
        if ((form['placa_sena'] || '') !== (it.placa_sena ?? '')) {
          await this.api.actualizarItem(it.id_item, { placa_sena: form['placa_sena'] || undefined });
        }
        if (form['estado'] !== it.estado) {
          await this.api.actualizarEstadoItem(it.id_item, form['estado']);
        }
        this.toast.ok('Ítem actualizado');
      } else if (this.editando()) {
        const p = this.editando() as Producto;
        await this.api.actualizarProducto(p.id_producto, {
          nombre: form['nombre'], SKU: form['SKU'] || null, tipo_material: form['tipo_material'],
          unidad_medida: form['unidad_medida'], id_categoria: form['id_categoria'],
          stock_minimo: Number(form['stock_minimo']) || 0,
        });
        this.toast.ok('Producto actualizado');
      } else {
        const esDevolutivo = form['tipo_material'] === 'DEVOLUTIVO';
        const { items_generados } = await this.api.crearProducto({
          nombre: form['nombre'], SKU: form['SKU'] || undefined, tipo_material: form['tipo_material'],
          unidad_medida: form['unidad_medida'], id_categoria: form['id_categoria'],
          stock_minimo: Number(form['stock_minimo']) || 0,
          // Solo DEVOLUTIVO genera ítems; CONSUMO/PERECEDERO carga su stock aparte como lote.
          cantidad: esDevolutivo ? (Number(form['cantidad']) || 1) : 0,
          es_psd: form['tipo_material'] === 'PERECEDERO',
          id_sitio: this.bodegaSel(),
        } as any);
        this.toast.ok('Producto creado');
        // DEVOLUTIVO usa placa SENA por defecto (usa_placa_sena=true) — sin
        // SKU copiado en el ítem, hay que asignarla a mano después.
        if (esDevolutivo && items_generados?.length > 0) {
          this.toast.warn(
            'Falta la placa SENA',
            `Recordá agregar la placa SENA a los ${items_generados.length} ítem(s) de "${form['nombre']}" en el módulo de Ítems.`,
            7000,
          );
        } else if (!esDevolutivo) {
          this.toast.warn(
            'Falta el stock',
            `Registrá el stock inicial de "${form['nombre']}" como lote en el módulo de Lotes.`,
            7000,
          );
        }
      }
      this.modalOpen.set(false);
      await this.cargar();
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'No se pudo guardar.');
    } finally {
      this.saving.set(false);
    }
  }
}
