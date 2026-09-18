import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminTableComponent, TableRowLink } from '../../../shared/components/admin-table.component';
import { AdminModalComponent } from '../../tenant-administration/ui/admin-modal.component';
import { ProductoFormModalComponent } from '../ui/producto-form-modal.component';
import { OpcionSelect } from '../../tenant-administration/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import {
  Categoria, Item, Lote, MaterialesApiService, Producto, Sitio,
} from '../data-access/materiales-api.service';

type Tab = 'productos' | 'items';

const OPCIONES_ESTADO_ITEM: OpcionSelect[] = [
  { label: 'Disponible', value: 'DISPONIBLE' },
  { label: 'Prestado', value: 'PRESTADO' },
  { label: 'Dañado', value: 'DAÑADO' },
  { label: 'Perdido', value: 'PERDIDO' },
];

/**
 * "Mi Bodega" — consola del encargado de bodega (`sitio.id_responsable`).
 * Cualquier cargo salvo admin. Muestra SOLO el catálogo (Productos / Ítems)
 * de la(s) bodega(s) a cargo. Los flujos (solicitudes, novedades, traslados,
 * devoluciones) NO van acá — viven en sus propios módulos, donde el backend
 * ya filtra a "las de mis bodegas" (`findForResponsable`) y el encargado puede
 * aprobar por ser el `id_responsable`.
 *
 * Ruta sin gate de `roles` — la habilita `miBodegaGuard` (¿responsable de ≥1
 * sitio?, admin siempre afuera). El backend recorta todo a las bodegas del
 * usuario; acá además se filtra por la bodega elegida en el selector.
 *
 * **`todasLasBodegas`** (2026-09-14, `route.data`): el MISMO componente sirve
 * la consola admin "Todas las bodegas" (`/materiales/bodegas`) — trae
 * `listarSitios()` (todos) en vez de `sitiosACargo()` (solo las mías), sin
 * duplicar la pantalla entera para una sola diferencia de origen de datos.
 *
 * Paridad con `/materiales/productos` (2026-09-14): antes tenía un
 * subconjunto de lo que ofrece esa pantalla — sin filtro de
 * activos/desactivados (ni reactivar), sin los links cruzados a
 * Existencias/Kardex/Lotes, sin "Importar", y sin respetar los servicios de
 * creación/edición/eliminación (mostraba los botones siempre). Ahora replica
 * ese mismo comportamiento, acotado a la bodega elegida.
 */
@Component({
  selector: 'app-mi-bodega',
  standalone: true,
  imports: [FormsModule, RouterLink, AdminTableComponent, AdminModalComponent, ProductoFormModalComponent],
  template: `
    <div class="p-6 space-y-5">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-xl font-bold text-gray-800">{{ todasLasBodegas ? 'Bodegas' : 'Mi Bodega' }}</h1>
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
                <div class="p-1 space-y-0.5 max-h-64 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

        @if (tab() === 'productos' && puedeCrear()) {
          <a routerLink="/materiales/importar"
            class="sm:ml-auto group inline-flex items-center gap-1.5 text-xs font-semibold rounded-full pl-2.5 pr-3.5 py-2 border border-[#39A900]/25 text-[#2d8000] bg-[#39A900]/[0.07] shadow-sm hover:bg-[#39A900]/15 hover:border-[#39A900]/45 transition-colors">
            <svg class="w-4 h-4 transition-transform group-hover:translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Importar
          </a>
        }
      </div>

      @if (bodegas().length === 0 && !loading()) {
        <div class="rounded-2xl border bg-white p-8 text-center text-gray-500">
          {{ todasLasBodegas ? 'No hay bodegas registradas.' : 'No sos responsable de ninguna bodega.' }}
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
            [addLabel]="puedeCrear() ? 'Nuevo producto' : null"
            (add)="nuevoProd()"
            [rows]="filasProd()"
            [searchable]="true"
            [searchPlaceholder]="'Buscar por nombre, SKU, categoría, tipo…'"
            [columns]="['nombre', 'categoria_nombre', 'tipo_material', 'unidad_medida', 'SKU', 'stock_minimo', 'stock_txt']"
            [columnLabels]="{ categoria_nombre: 'Categoría', tipo_material: 'Tipo', unidad_medida: 'Unidad de medida', SKU: 'SKU', stock_minimo: 'Stock mínimo', stock_txt: 'Stock (disp./total)' }"
            [loading]="loading()"
            [filterOptions]="puedeEliminar() ? estadoOpciones : null"
            [filterValue]="estadoFiltro"
            filterLabel="Estado"
            (filterValueChange)="onEstadoFiltro($event)"
            [canEdit]="puedeEditar() && estadoFiltro !== 'inactivos'"
            [canDelete]="puedeEliminar()"
            [deleteLabel]="estadoFiltro === 'inactivos' ? 'Reactivar' : 'Desactivar'"
            [rowLinks]="rowLinksProducto"
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
            [canEdit]="puedeEditarItem()"
            [canDelete]="false"
            (edit)="editarItem($event)" />
        }
      }
    </div>

    <!-- Producto: mismo formulario único que usa /materiales/productos (no una
         versión reducida propia) — ver docblock de <app-producto-form-modal>. -->
    <app-producto-form-modal
      [open]="modalKind() === 'producto' && modalOpen()"
      [editando]="editandoProducto()"
      [categorias]="categorias()"
      [productosExistentes]="productos()"
      [sitioFijo]="bodegaSel()"
      (closed)="modalOpen.set(false)"
      (guardado)="onProductoGuardado()" />

    <!-- Ítem: sigue en el modal genérico (placa SENA + estado, nada que unificar). -->
    <app-admin-modal
      [open]="modalKind() === 'item' && modalOpen()"
      [editando]="editando()"
      labelSingular="ítem"
      [columns]="modalColumns"
      [form]="form"
      [opciones]="opcionesModal()"
      [columnLabels]="{ codigo_sku: 'SKU', placa_sena: 'Placa SENA' }"
      [saving]="saving()"
      [error]="error()"
      (closed)="modalOpen.set(false)"
      (saved)="guardarModal($event)" />
  `,
})
export class MiBodegaComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly route = inject(ActivatedRoute);

  /** `true` en `/materiales/bodegas` (admin, todos los sitios); `false` en `/mi-bodega` (solo los propios). */
  readonly todasLasBodegas: boolean = this.route.snapshot.data['todasLasBodegas'] === true;

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.productos.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.productos.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.productos.eliminar'));
  /** Ítems tiene su propio servicio de edición, distinto del de Productos. */
  puedeEditarItem = computed(() => this.auth.tieneServicio('materiales.items.editar'));

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

  /** B1 — filtro de estado del toolbar (solo se ofrece a quien puede desactivar).
   *  'activos' = solo activos (default); 'inactivos' = solo los desactivados,
   *  para reactivarlos. Mismo patrón que `/materiales/productos`. */
  readonly estadoOpciones = [
    { value: 'activos', label: 'Activos' },
    { value: 'inactivos', label: 'Desactivados' },
  ];
  estadoFiltro: 'activos' | 'inactivos' = 'activos';

  onEstadoFiltro(v: string): void {
    this.estadoFiltro = v === 'inactivos' ? 'inactivos' : 'activos';
    this.cargar();
  }

  /** Navegación cruzada, igual que en `/materiales/productos` — Lotes queda
   *  admin-only ahí también (nadie que entra por "Mi Bodega" es admin). */
  readonly rowLinksProducto: TableRowLink[] = [
    { label: 'Existencias', routerLink: () => ['/materiales/existencias'], queryParams: (r) => ({ id_producto: r.id_producto }) },
    {
      label: 'Kardex',
      routerLink: () => [this.auth.isAdmin() ? '/materiales/kardex' : '/instructor/materiales/kardex'],
      queryParams: (r) => ({ id_producto: r.id_producto }),
      visible: () => this.auth.isAdmin() || this.auth.cargo() === 'instructor',
    },
    {
      label: 'Lotes',
      routerLink: () => ['/materiales/lotes'],
      queryParams: (r) => ({ id_producto: r.id_producto }),
      visible: () => this.auth.isAdmin(),
    },
  ];

  modalOpen = signal(false);
  modalKind = signal<'producto' | 'item'>('producto');
  editando = signal<Producto | Item | null>(null);
  /** Vista tipada de `editando` para <app-producto-form-modal>, que espera `Producto | null`. */
  editandoProducto = computed<Producto | null>(() =>
    this.modalKind() === 'producto' ? (this.editando() as Producto | null) : null,
  );
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
    const cats = this.categorias();
    return this.productos()
      .filter((p) => this.estaEnBodega(p, sel))
      .map((p) => ({
        ...p,
        nombre: (p as any).activo === false ? `${p.nombre}  ·  (desactivado)` : p.nombre,
        // Mismo dato que ya mostraba /materiales/productos — acá faltaba.
        categoria_nombre: p.categoria?.nombre ?? cats.find((c) => c.id_categoria === p.id_categoria)?.nombre ?? '—',
        stock_txt: this.stockEnBodega(p, sel),
      }));
  });
  filasItems = computed(() =>
    this.items()
      .filter((i) => i.id_sitio === this.bodegaSel())
      .map((i) => {
        const producto = i.producto ?? this.productos().find((p) => p.id_producto === i.id_producto);
        return {
          ...i,
          codigo_sku: i.codigo_sku ?? producto?.SKU ?? '—',
          producto_nombre: producto?.nombre ?? '—',
        };
      }),
  );

  /** Columnas del modal genérico — ya solo sirve para ítems (placa SENA + estado). */
  readonly modalColumns: string[] = ['placa_sena', 'estado'];
  opcionesModal = computed<Record<string, OpcionSelect[]>>(() => ({
    estado: OPCIONES_ESTADO_ITEM,
  }));

  ngOnInit(): void {
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading.set(true);
    try {
      const bodegas = this.todasLasBodegas
        ? await this.api.listarSitios()
        : await this.api.sitiosACargo();
      this.bodegas.set(bodegas);
      if (bodegas.length && !this.bodegaSel()) this.bodegaSel.set(bodegas[0].id_sitio);
      if (!bodegas.length) return;

      const soloInactivos = this.estadoFiltro === 'inactivos';
      const [prod, items, lotes, cats] = await Promise.all([
        this.api.listarProductos(soloInactivos).catch(() => []),
        this.api.listarItems().catch(() => []),
        this.api.listarLotes().catch(() => []),
        this.api.listarCategorias().catch(() => []),
      ]);
      // `listarProductos(true)` trae activos + desactivados; en modo
      // "Desactivados" nos quedamos solo con los que están dados de baja —
      // mismo criterio que `/materiales/productos`.
      this.productos.set(soloInactivos ? prod.filter((p) => (p as any).activo === false) : prod);
      this.items.set(items);
      this.lotes.set(lotes);
      this.categorias.set(cats);
    } catch (e) {
      this.toast.httpError(e, this.todasLasBodegas ? 'No se pudieron cargar las bodegas.' : 'No se pudo cargar Mi Bodega.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Productos (formulario en <app-producto-form-modal>) ──
  nuevoProd(): void {
    if (!this.puedeCrear()) return;
    if (this.categorias().length === 0) {
      this.toast.warn('Sin categorías', 'No hay categorías creadas. Pedile a un administrador que cree al menos una.');
      return;
    }
    this.modalKind.set('producto');
    this.editando.set(null);
    this.modalOpen.set(true);
  }

  editarProd(fila: any): void {
    if (!this.puedeEditar()) return;
    const p = this.productos().find((x) => x.id_producto === fila.id_producto);
    if (!p) return;
    this.modalKind.set('producto');
    this.editando.set(p);
    this.modalOpen.set(true);
  }

  async onProductoGuardado(): Promise<void> {
    this.modalOpen.set(false);
    await this.cargar();
  }

  /** B1 — el botón de la derecha es "Desactivar" (soft-delete) o "Reactivar" según el modo. */
  async eliminarProd(fila: any): Promise<void> {
    if (!this.puedeEliminar()) return;
    const p = this.productos().find((x) => x.id_producto === fila.id_producto);
    const nombre = p?.nombre ?? 'este producto';

    if (this.estadoFiltro === 'inactivos') {
      if (!(await this.confirm.ask(`¿Reactivar el producto "${nombre}"?`, { danger: false, acceptLabel: 'Reactivar' }))) return;
      try {
        await this.api.activarProducto(fila.id_producto);
        this.toast.ok('Producto reactivado');
        await this.cargar();
      } catch (e) {
        this.toast.httpError(e, 'No se pudo reactivar el producto.');
      }
      return;
    }

    if (!(await this.confirm.ask(
      `¿Desactivar el producto "${nombre}"? Sale de las listas y los selects; su histórico (kardex, préstamos, lotes) queda intacto y podés reactivarlo.`,
      { acceptLabel: 'Desactivar' },
    ))) return;
    try {
      await this.api.eliminarProducto(fila.id_producto);
      this.toast.ok('Producto desactivado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo desactivar el producto.');
    }
  }

  // ── Ítems ──
  editarItem(fila: any): void {
    if (!this.puedeEditarItem()) return;
    const it = this.items().find((x) => x.id_item === fila.id_item);
    if (!it) return;
    this.modalKind.set('item');
    this.editando.set(it);
    this.form = { placa_sena: it.placa_sena ?? '', estado: it.estado };
    this.error.set(null);
    this.modalOpen.set(true);
  }

  // ── Guardado del modal genérico — ya solo ítems (producto se guarda solo,
  // ver (guardado) de <app-producto-form-modal> arriba) ──
  async guardarModal(form: Record<string, any>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const it = this.editando() as Item;
      if ((form['placa_sena'] || '') !== (it.placa_sena ?? '')) {
        await this.api.actualizarItem(it.id_item, { placa_sena: form['placa_sena'] || undefined });
      }
      if (form['estado'] !== it.estado) {
        await this.api.actualizarEstadoItem(it.id_item, form['estado']);
      }
      this.toast.ok('Ítem actualizado');
      this.modalOpen.set(false);
      await this.cargar();
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'No se pudo guardar.');
    } finally {
      this.saving.set(false);
    }
  }
}
