import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminTableComponent, TableRowLink } from '../../shared/components/admin-table.component';
import { ProductoFormModalComponent } from './ui/producto-form-modal.component';
import { AgregarExistenciasModalComponent } from './ui/agregar-existencias-modal.component';
import { FichasPedidasPanelComponent, prefillDesdePedido } from './ui/fichas-pedidas-panel.component';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Categoria, Item, MaterialesApiService, Producto, Sitio, SolicitudFicha } from './data-access/materiales-api.service';
import { AlertComponent } from '../../shared/ui/alert.component';
import { CargasSecundarias } from './data-access/cargas-secundarias';
import { AvisoCargasComponent } from './ui/aviso-cargas.component';
import { MaterialesScreenPolicy } from './ui/materiales-screen-policy';

/**
 * Catálogo de Productos — único por centro (2026-10-02). Crear un producto es
 * crear su FICHA (sin bodega ni cantidad); cada bodega le agrega sus unidades
 * con "Agregar al inventario" (`<app-agregar-existencias-modal>`): ítems si es
 * DEVOLUTIVO, un lote si es CONSUMO/PERECEDERO.
 *
 * El formulario de crear/editar vive en `<app-producto-form-modal>`
 * (`shared/components/producto-form-modal.component.ts`) — antes era un
 * diálogo propio acá mismo, ahora es el ÚNICO formulario de producto del
 * sistema: `features/mi-bodega/mi-bodega.component.ts` (consola del
 * encargado de bodega, cualquier cargo) usa exactamente el mismo componente
 * en vez de su propia versión reducida (sin UNSPSC/marca/modelo/placa
 * SENA/SKU automático) que tenía antes.
 *
 * Componente único para admin/instructor/aprendiz (plan de unificación) —
 * antes vivía triplicado en `features/{admin,instructor,aprendiz}/materiales/`,
 * con el catálogo UNSPSC (100+ líneas) copiado 1:1 en cada copia. El gating
 * por servicio reemplaza al gate por cargo (salvo las fichas: ver `gestionaCatalogo`):
 * admin trae todos los servicios de Materiales por su bundle de rol.
 *
 * Navegación cruzada (rowLinks): desde un producto, ir directo a sus
 * Existencias / Kardex / Lotes ya filtrados por `id_producto`.
 */
@Component({
  selector: 'app-materiales-productos',
  standalone: true,
  imports: [AvisoCargasComponent, AlertComponent, FormsModule, RouterLink, AdminTableComponent, ProductoFormModalComponent, AgregarExistenciasModalComponent, FichasPedidasPanelComponent],
  template: `
    <div class="p-6">
      <nav aria-label="Migas de pan" class="mb-4 flex items-center gap-2 text-sm text-gray-500">
        <span>Materiales</span><span aria-hidden="true">/</span><span>Catálogo</span><span aria-hidden="true">/</span><span aria-current="page" class="font-semibold text-gray-800">Productos</span>
      </nav>
      <div class="flex items-center justify-between mb-5">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Catálogo de productos</h1>
          <p class="text-xs text-gray-400 mt-0.5">Catálogo único del centro. Cada bodega agrega aquí sus unidades, sin crear el producto otra vez.</p>
        </div>
        <div class="flex items-center gap-2">
        @if (puedeAgregar() && bodegasGestionables.length) {
          <button type="button" (click)="abrirAgregar(null)"
            class="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3.5 py-2 text-white shadow-sm transition-colors"
            style="background-color: var(--accent-brand)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Agregar al inventario
          </button>
        }
        @if (puedeImportar()) {
          <a routerLink="/materiales/importar"
            class="group inline-flex items-center gap-1.5 text-xs font-semibold rounded-full pl-2.5 pr-3.5 py-2 border border-[#39A900]/25 text-[#2d8000] bg-[#39A900]/[0.07] shadow-sm hover:bg-[#39A900]/15 hover:border-[#39A900]/45 transition-colors">
            <svg class="w-4 h-4 transition-transform group-hover:translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Importar
          </a>
        }
        </div>
      </div>

      <app-aviso-cargas [cargas]="secundarias" (reintentar)="recargar()" />

      <!-- Pedir ficha al líder: lo que los encargados pidieron y todavía no está en el catálogo. -->
      @if (pedidosPendientes.length) {
        <div class="mb-5">
          <app-fichas-pedidas-panel [pedidos]="pedidosPendientes" (crear)="crearDesdePedido($event)" (cambiado)="recargar()" />
        </div>
      }

      @if (bodegasInactivas().length > 0) {
        <app-alert class="mb-4" variante="advertencia" [titulo]="bodegasInactivas().length === 1 ? 'Bodega inactiva' : 'Bodegas inactivas'">
          <strong>{{ bodegasInactivas().map(s => s.nombre).join(', ') }}</strong>
          — no se pueden gestionar sus productos, ítems, lotes, solicitudes ni traslados mientras estén así.
        </app-alert>
      }

      <app-admin-table
        [addLabel]="puedeCrear() ? 'Nueva ficha' : null"
        (add)="nuevo()"
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por nombre, SKU, categoría, placa…'"
        [columns]="['nombre', 'categoria_nombre', 'tipo_material', 'unidad_medida', 'stock_minimo']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [filterOptions]="puedeEliminar() ? estadoOpciones : null"
        [filterValue]="estadoFiltro"
        filterLabel="Estado"
        (filterValueChange)="onEstadoFiltro($event)"
        [canEdit]="puedeEditar() && estadoFiltro === 'activos'"
        [canDelete]="puedeGestionarActivo"
        [deleteLabel]="estadoFiltro === 'inactivos' ? 'Reactivar' : 'Desactivar'"
        [rowLinks]="rowLinks"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    <app-producto-form-modal
      [open]="modalOpen"
      [editando]="editando"
      [categorias]="categorias"
      [productosExistentes]="productos"
      [prefill]="prefillFicha"
      (closed)="cerrarModal()"
      (guardado)="onProductoGuardado($event)"
      (usarExistente)="onUsarExistente($event)" />

    <app-agregar-existencias-modal
      [open]="agregarOpen"
      [sitios]="bodegasGestionables"
      [productoInicial]="fichaParaAgregar"
      [puedeCrearFicha]="puedeCrear()"
      (closed)="agregarOpen = false"
      (guardado)="onExistenciasAgregadas()"
      (crearFicha)="agregarOpen = false; nuevo()" />
  `,
})
export class MaterialesProductosComponent implements OnInit {
  /** Catálogos auxiliares de la pantalla: si uno falla se avisa, no se muestra vacío. */
  readonly secundarias = new CargasSecundarias();
  readonly recargar = (): void => void this.cargar();
  private readonly acceso = inject(MaterialesScreenPolicy);
  productos: Producto[] = [];
  categorias: Categoria[] = [];
  sitios: Sitio[] = [];
  /** Solo para que el buscador de la tabla alcance la placa SENA (vive en Item, no en Producto). */
  items: Item[] = [];
  loading = false;

  /** Banner general de la pantalla — lista todas las bodegas inactivas del
   *  tenant (ver plan 2026-09-18). */
  bodegasInactivas(): Sitio[] {
    return this.sitios.filter((s) => !s.estado);
  }

  /**
   * Crear / editar / desactivar fichas del catálogo único: solo
   * administrador_erp y líderes de área (2026-10-02). Lo decide el backend
   * por quién es el usuario (`GET /productos/catalogo/gestion`), no por el
   * servicio `materiales.productos.*` — los encargados de bodega lo traen en
   * su bundle pero solo agregan existencias.
   */
  gestionaCatalogo = signal(false);
  puedeCrear = computed(() => this.gestionaCatalogo());
  puedeEditar = computed(() => this.gestionaCatalogo());
  puedeEliminar = computed(() => this.gestionaCatalogo());
  /** La importación también suma stock a fichas existentes; sigue con su servicio. */
  puedeImportar = computed(() => this.auth.tieneServicio('materiales.productos.crear'));

  /** Desactivar/Activar afecta la ficha en TODAS las bodegas (para una unidad: desactivar POR ÍTEM). */
  puedeGestionarActivo = (row: any): boolean =>
    this.puedeEliminar() && this.estadoFiltro !== 'todos' && !!row;
  // Misma regla que `GET /sitios` del backend (`LECTURA_LISTA.sitios`) — acá
  // se chequeaba solo `sitios.ver`, más estricto de lo que el backend permite,
  // y alguien con solo `traslados.crear` no cargaba bodegas ni veía el aviso de
  // bodega inactiva (2026-09-18), aunque sí lo viera en Solicitudes.
  puedeVerSitios = computed(() => this.acceso.puedeListar('sitios'));

  modalOpen = false;
  editando: Producto | null = null;

  columnLabels: Record<string, string> = {
    categoria_nombre: 'Categoría',
    tipo_material: 'Tipo de material',
    unidad_medida: 'Unidad de medida',
    // El de la ficha (sugerido para todo el centro); cada bodega fija el suyo en Mi Bodega.
    stock_minimo: 'Stock mínimo (ficha)',
  };

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
    private confirm: ConfirmService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  /**
   * Navegación cruzada: desde un producto, ir directo a su stock/movimientos/
   * lotes ya filtrados. Existencias está unificado (una ruta para los 3
   * cargos); Kardex bifurca por cargo y Lotes es admin-only.
   */
  readonly rowLinks: TableRowLink[] = [
    { label: 'Existencias', routerLink: () => ['/materiales/existencias'], queryParams: (r) => ({ id_producto: r.id_producto }) },
    {
      label: 'Kardex',
      routerLink: () => [this.auth.isAdmin() ? '/materiales/kardex' : '/instructor/materiales/kardex'],
      queryParams: (r) => ({ id_producto: r.id_producto }),
      // Antes solo miraba el cargo ('instructor'), no el servicio real — un
      // instructor común ya NO tiene `materiales.kardex.ver` por defecto
      // desde el recorte de 2026-09-16, así que el link quedaba visible pero
      // llevaba a una ruta que el roleGuard rebotaba al Home. Sigue
      // apareciendo para quien SÍ lo tiene (encargado de bodega/líder de
      // área, vía su bundle).
      visible: () => this.auth.isAdmin() || this.auth.tieneServicio('materiales.kardex.ver'),
    },
    {
      label: 'Lotes',
      routerLink: () => ['/materiales/lotes'],
      queryParams: (r) => ({ id_producto: r.id_producto }),
      visible: () => this.auth.isAdmin(),
    },
  ];

  /** B1 — filtro de estado del toolbar (solo se ofrece a quien puede desactivar).
   *  'todos' = activos + desactivados mezclados, solo lectura (default);
   *  'activos' = solo activos, editable/desactivable; 'inactivos' = solo los
   *  desactivados, para reactivarlos. Edit/Reactivar/Desactivar quedan
   *  deshabilitados en 'todos' porque `<app-admin-table>` no soporta un
   *  label o permiso distinto por fila — mezclar activos/inactivos en la
   *  misma tabla haría ambiguo un solo botón "Desactivar"/"Reactivar" para
   *  toda la tabla. Para mutar un registro, cambiar a la vista específica. */
  readonly estadoOpciones = [
    { value: 'todos', label: 'Todos' },
    { value: 'activos', label: 'Activos' },
    { value: 'inactivos', label: 'Desactivados' },
  ];
  estadoFiltro: 'todos' | 'activos' | 'inactivos' = 'todos';

  get filas(): any[] {
    return this.productos.map((p) => ({
      ...p,
      nombre: (p as any).activo === false ? `${p.nombre}  ·  (desactivado)` : p.nombre,
      categoria_nombre: p.categoria?.nombre ?? this.categorias.find((c) => c.id_categoria === p.id_categoria)?.nombre ?? '—',
      // Campo oculto (no está en `columns`) — solo para que el buscador de la tabla matchee por placa SENA.
      _placas: this.items.filter((i) => i.id_producto === p.id_producto).map((i) => i.placa_sena).filter(Boolean).join(' '),
    }));
  }

  onEstadoFiltro(v: string): void {
    this.estadoFiltro = v === 'inactivos' || v === 'activos' ? v : 'todos';
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    this.secundarias.reiniciar();
    try {
      // Primero: de esto depende si se piden también los desactivados.
      this.gestionaCatalogo.set(await this.api.puedeGestionarCatalogo().catch(() => false));
      // Un aprendiz o instructor comunes ya NO traen por defecto
      // `materiales.sitios.ver`/`materiales.categorias.ver`/`materiales.items.ver`
      // — ninguna de las tres se pide siquiera si no se tiene el servicio (no
      // alcanza con un `.catch()`: la petición igual sale y queda como 403 de
      // ruido en la consola/red aunque no rompa la pantalla). Sin categorías
      // no se pierde nada visible: el nombre ya llega embebido en
      // `producto.categoria`.
      const verSitios = this.puedeVerSitios();
      const verCategorias = this.acceso.puedeListar('categorias');
      const verItems = this.acceso.puedeListar('items');
      // Quien no puede desactivar tampoco ve el filtro (línea 61) — para esa
      // audiencia el comportamiento se mantiene igual que siempre: solo activos.
      const incluirInactivos = this.puedeEliminar() && this.estadoFiltro !== 'activos';
      const [productos, categorias, sitios, items, aCargo] = await Promise.all([
        this.api.listarProductos(incluirInactivos),
        this.secundarias.cargar('categorías', () => this.api.listarCategorias(), verCategorias),
        this.secundarias.cargar('bodegas', () => this.api.listarSitios(), verSitios),
        this.secundarias.cargar('ítems', () => this.api.listarItems(), verItems),
        // Bodegas a cargo (responsable o líder del área): ahí puede "Agregar al
        // inventario". El admin agrega en cualquier bodega (usa `sitios`).
        this.puedeAgregar() && !this.auth.isAdmin()
          ? this.secundarias.cargar('bodegas a tu cargo', () => this.api.sitiosACargo())
          : Promise.resolve([] as Sitio[]),
      ]);
      this.bodegasGestionables = this.auth.isAdmin() ? sitios : aCargo;
      // `listarProductos(true)` trae activos + desactivados; en modo
      // "Desactivados" nos quedamos solo con los que están dados de baja, en
      // "Todos" se muestran ambos tal cual llegan.
      this.productos = this.estadoFiltro === 'inactivos'
        ? productos.filter((p) => (p as any).activo === false)
        : productos;
      this.categorias = categorias;
      this.sitios = sitios;
      this.items = items;
      this.pedidosPendientes = this.gestionaCatalogo()
        ? (await this.api.listarSolicitudesFicha().catch(() => ({ puede_atender: false, solicitudes: [] as SolicitudFicha[] })))
            .solicitudes.filter((x) => x.estado === 'PENDIENTE')
        : [];
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los productos.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (!this.puedeCrear()) return;
    if (this.categorias.length === 0) {
      this.toast.warn('Faltan datos', 'Creá al menos una categoría antes de registrar un producto.');
      return;
    }
    this.editando = null;
    this.modalOpen = true;
  }

  editar(fila: any): void {
    if (!this.puedeEditar()) return;
    const producto = this.productos.find((p) => p.id_producto === fila.id_producto)!;
    this.editando = producto;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
    this.pedidoEnCurso = null;
    this.prefillFicha = null;
  }

  /** Ficha recién creada → si venía de un pedido, se atiende; si no, se ofrece agregarle existencias. */
  async onProductoGuardado(creado: Producto | null): Promise<void> {
    this.modalOpen = false;
    const pedido = this.pedidoEnCurso;
    this.pedidoEnCurso = null;
    this.prefillFicha = null;
    if (creado && pedido) {
      await this.atenderPedido(pedido, creado.id_producto);
    } else if (creado && this.puedeAgregar() && this.bodegasGestionables.length) {
      this.abrirAgregar(creado);
    }
    await this.cargar();
  }

  /** "Usar esta" en el formulario: si venía de un pedido, la ficha ya existía — se atiende con ella. */
  async onUsarExistente(p: Producto): Promise<void> {
    const pedido = this.pedidoEnCurso;
    if (!pedido) {
      this.abrirAgregar(p);
      return;
    }
    this.modalOpen = false;
    this.pedidoEnCurso = null;
    this.prefillFicha = null;
    await this.atenderPedido(pedido, p.id_producto);
    await this.cargar();
  }

  // ── Pedir ficha al líder: pedidos de los encargados (solo gestores del catálogo) ──
  pedidosPendientes: SolicitudFicha[] = [];
  pedidoEnCurso: SolicitudFicha | null = null;
  prefillFicha: Record<string, string> | null = null;

  crearDesdePedido(pf: SolicitudFicha): void {
    this.pedidoEnCurso = pf;
    this.prefillFicha = prefillDesdePedido(pf);
    this.editando = null;
    this.modalOpen = true;
  }

  private async atenderPedido(pf: SolicitudFicha, idProducto: string): Promise<void> {
    try {
      await this.api.atenderSolicitudFicha(pf.id_solicitud_ficha, idProducto);
      this.toast.ok('Pedido atendido', `Se le avisó a ${pf.solicitante_nombre || 'quien la pidió'} que ya puede agregarla.`);
    } catch (e) {
      this.toast.httpError(e, 'La ficha quedó creada, pero no se pudo marcar el pedido como atendido.');
    }
  }


  // ── Agregar al inventario (catálogo único, 2026-10-02) ──
  puedeAgregar = computed(() =>
    this.auth.tieneServicio('materiales.items.crear') || this.auth.tieneServicio('materiales.lotes.crear'),
  );
  agregarOpen = false;
  fichaParaAgregar: Producto | null = null;
  /** Bodegas donde el usuario puede agregar: todas para admin, las suyas para un encargado. */
  bodegasGestionables: Sitio[] = [];

  abrirAgregar(ficha: Producto | null): void {
    if (!this.puedeAgregar()) return;
    this.modalOpen = false;
    this.fichaParaAgregar = ficha;
    this.agregarOpen = true;
  }

  async onExistenciasAgregadas(): Promise<void> {
    this.agregarOpen = false;
    await this.cargar();
  }

  /** B1 — el botón de la derecha es "Desactivar" (soft-delete) o "Reactivar" según el modo. */
  async eliminar(fila: any): Promise<void> {
    if (!this.puedeEliminar()) return;
    const p = this.productos.find((x) => x.id_producto === fila.id_producto);
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

    // ¿Fue un error de registro (bodega equivocada, cantidad mal digitada)? Sin
    // historia se puede borrar de verdad, con lo que generó; si no, solo desactivar.
    if (await this.confirm.ask(
      `¿"${nombre}" se registró por error (bodega equivocada, cantidad mal digitada)? Se puede eliminar por completo, junto con las unidades y lotes que generó, solo si todavía no tiene placas, préstamos, traslados, novedades ni movimientos. Si eliges "Solo desactivar" se conserva el histórico.`,
      { header: 'Registro por error', acceptLabel: 'Eliminar definitivamente', rejectLabel: 'Solo desactivar' },
    )) {
      if (!(await this.confirm.ask(`Esto borra "${nombre}" y todo lo que se generó con él, y no se puede deshacer. ¿Continuar?`, { acceptLabel: 'Sí, eliminar' }))) return;
      try {
        await this.api.eliminarProductoDefinitivo(fila.id_producto);
        this.toast.ok('Producto eliminado definitivamente');
        await this.cargar();
      } catch (e) {
        this.toast.httpError(e, 'No se pudo eliminar el producto.');
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
}
