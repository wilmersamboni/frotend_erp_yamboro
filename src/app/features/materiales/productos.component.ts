import { Component, DoCheck, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminTableComponent, TableRowLink } from '../../shared/components/admin-table.component';
import { SearchableSelectComponent } from '../../shared/components/searchable-select.component';
import { OpcionSelect } from '../admin/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Categoria, Item, MaterialesApiService, Producto, Sitio } from '../../core/services/materiales/materiales-api.service';

const OPCIONES_TIPO_MATERIAL = [
  { value: 'CONSUMO', label: 'Consumo', clases: 'border-green-300 bg-green-50 text-green-700' },
  { value: 'DEVOLUTIVO', label: 'Devolutivo', clases: 'border-blue-300 bg-blue-50 text-blue-700' },
  { value: 'PERECEDERO', label: 'Perecedero', clases: 'border-amber-300 bg-amber-50 text-amber-700' },
] as const;

// Unidades de medida frecuentes en SENA (alimentos, TIC, aseo, herramientas) —
// select en vez de texto libre. Lista completa, usada como fallback cuando
// no hay UNSPSC elegido o su familia no está en UNIDADES_POR_FAMILIA de abajo.
const TODAS_LAS_UNIDADES = [
  'UNIDAD', 'PAR', 'KIT', 'JUEGO', 'SET', 'METRO', 'ROLLO',
  'LITRO', 'MILILITRO', 'GALÓN', 'BOTELLA', 'LATA', 'FRASCO',
  'KILOGRAMO', 'GRAMO', 'LIBRA', 'TONELADA',
  'BULTO', 'PAQUETE', 'CAJA', 'CARTÓN', 'ATADO', 'BOLSA',
  'LICENCIA', 'ARROBA',
];
const OPCIONES_UNIDAD_MEDIDA: OpcionSelect[] = TODAS_LAS_UNIDADES.map((u) => ({ label: u, value: u }));

// Filtra las unidades ofrecidas según la familia UNSPSC elegida (primeros 4
// dígitos del código) — mismo criterio que SGM (`UNIDADES_POR_FAMILIA`),
// adaptado y extendido acá para cubrir también las familias no-alimenticias
// del catálogo propio del ERP (TIC, aseo, empaques, herramientas de cocina).
const UNIDADES_POR_FAMILIA: Record<string, string[]> = {
  '5010': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'BULTO', 'PAQUETE', 'TONELADA','ARROBA'], // Cereales y granos
  '5011': ['LITRO', 'MILILITRO', 'BOTELLA', 'GALÓN', 'LATA', 'KILOGRAMO'], // Aceites y grasas
  '5012': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'LITRO', 'BOTELLA', 'PAQUETE', 'BULTO'], // Condimentos
  '5013': ['LITRO', 'MILILITRO', 'BOTELLA', 'BOLSA', 'CAJA', 'KILOGRAMO', 'GRAMO', 'UNIDAD'], // Lácteos
  '5014': ['UNIDAD', 'CARTÓN', 'PAQUETE', 'CAJA'], // Huevos
  '5015': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'PAQUETE','ARROBA'], // Carnes
  '5017': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD'], // Pescado
  '5018': ['KILOGRAMO', 'GRAMO', 'LIBRA'], // Mariscos
  '5019': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'BULTO', 'PAQUETE','ARROBA'], // Legumbres
  '5020': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'ATADO', 'PAQUETE', 'BULTO','ARROBA'], // Verduras y tubérculos
  '5021': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'CAJA', 'PAQUETE','ARROBA'], // Frutas
  '5022': ['GRAMO', 'KILOGRAMO', 'PAQUETE', 'FRASCO', 'UNIDAD','ARROBA'], // Especias y hierbas
  '5028': ['GRAMO', 'KILOGRAMO', 'PAQUETE', 'CAJA', 'UNIDAD','ARROBA'], // Café y té
  '5029': ['LITRO', 'BOTELLA', 'UNIDAD'], // Agua y bebidas
  '5030': ['PAQUETE', 'UNIDAD', 'CAJA'], // Pastas y panadería
  '5214': ['UNIDAD', 'JUEGO', 'SET', 'KIT', 'CAJA'], // Utensilios de cocina
  '4810': ['UNIDAD'], // Equipos industriales de cocina
  '2611': ['UNIDAD', 'PAQUETE', 'CAJA'], // Baterías y pilas
  '4713': ['LITRO', 'MILILITRO', 'BOTELLA', 'GALÓN', 'LATA'], // Detergentes y desinfectantes
  '4714': ['UNIDAD', 'PAQUETE', 'CAJA'], // Esponjas, trapeadores, escobas
  '2411': ['ROLLO', 'PAQUETE', 'CAJA', 'METRO'], // Bolsas, film, papel aluminio
  '3120': ['UNIDAD', 'JUEGO', 'SET', 'CAJA'], // Recipientes herméticos
  '2412': ['PAQUETE', 'CAJA', 'UNIDAD'], // Desechables
  '4320': ['UNIDAD'], // Pantallas, proyectores, periféricos de video/audio
  '4321': ['UNIDAD', 'CAJA'], // Computadores y periféricos
  '4319': ['UNIDAD', 'CAJA'], // Almacenamiento (discos, memorias)
  '4322': ['UNIDAD', 'LICENCIA'], // Software y redes
  '4323': ['ROLLO', 'METRO', 'UNIDAD'], // Cableado de red
};

// Unidades de peso válidas para "peso por bulto" — subconjunto de
// OPCIONES_UNIDAD_MEDIDA, mismas 3 que ofrece SGM (unidadesPeso).
const OPCIONES_UNIDAD_PESO: OpcionSelect[] = ['KILOGRAMO', 'GRAMO', 'LIBRA'].map((u) => ({ label: u, value: u }));

/**
 * CRUD de Productos. Crear un producto DEVOLUTIVO genera automáticamente
 * `cantidad` Items; en CONSUMO/PERECEDERO el stock se carga aparte como
 * lote(s) en el módulo de Lotes — ver `MaterialesApiService.crearProducto`.
 *
 * Diálogo propio (no `AdminModalComponent`, Ronda 2026-09-04 — el genérico
 * amontonaba ~14 campos en una sola columna larga y no dejaba agrupar
 * visualmente "qué es esto" antes de "cómo se llama", quedaba confuso).
 * "Tipo de material" como 3 pills de color (inspirado en el mismo patrón de
 * SigMat) en vez de un `<select>`, y el resto en grilla de 2 columnas.
 *
 * Componente único para admin/instructor/aprendiz (plan de unificación) —
 * antes vivía triplicado en `features/{admin,instructor,aprendiz}/materiales/`,
 * con el catálogo UNSPSC (100+ líneas) copiado 1:1 en cada copia. El gating
 * por servicio (`puedeCrear/Editar/Eliminar`) reemplaza al gate por cargo:
 * admin trae todos los servicios de Materiales por su bundle de rol.
 *
 * Navegación cruzada (rowLinks): desde un producto, ir directo a sus
 * Existencias / Kardex / Lotes ya filtrados por `id_producto`.
 *
 * Pulido: al crear (no al editar), el SKU se autogenera a partir del nombre
 * mientras se escribe (prefijo de 3 letras + consecutivo por prefijo, mismo
 * algoritmo que SGM `generarSku()`) — editable a mano; si se vacía el campo,
 * vuelve al auto-fill. Se implementa con `ngDoCheck` comparando
 * `form['nombre']`/`form['SKU']` contra el último valor visto, porque el
 * template muta `form` por referencia en cada keystroke. El `<select>` de
 * unidad de medida se filtra por la familia UNSPSC elegida
 * (`UNIDADES_POR_FAMILIA`).
 */
@Component({
  selector: 'app-materiales-productos',
  standalone: true,
  imports: [FormsModule, RouterLink, AdminTableComponent, SearchableSelectComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Productos</h1>
        @if (puedeCrear()) {
          <a routerLink="/materiales/importar"
            class="group inline-flex items-center gap-1.5 text-xs font-semibold rounded-full pl-2.5 pr-3.5 py-2 border border-[#39A900]/25 text-[#2d8000] bg-[#39A900]/[0.07] shadow-sm hover:bg-[#39A900]/15 hover:border-[#39A900]/45 transition-colors">
            <svg class="w-4 h-4 transition-transform group-hover:translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Importar
          </a>
        }
      </div>

      <app-admin-table
        [addLabel]="puedeCrear() ? 'Nuevo producto' : null"
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
        [canEdit]="puedeEditar() && estadoFiltro !== 'inactivos'"
        [canDelete]="puedeEliminar()"
        [deleteLabel]="estadoFiltro === 'inactivos' ? 'Reactivar' : 'Desactivar'"
        [rowLinks]="rowLinks"
        (edit)="editar($event)"
        (delete)="eliminar($event)" />
    </div>

    @if (modalOpen) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarModal()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">{{ editando ? 'Editar producto' : 'Nuevo producto' }}</h2>
            <button (click)="cerrarModal()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-4">
            <!-- Tipo de material: pills de color, primera decisión del form.
                 Inmutable al editar (M4): cambiar el tipo dejaba ítems/lotes huérfanos. -->
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1.5">Tipo de material <span class="text-red-500">*</span></label>
              <div class="grid grid-cols-3 gap-2">
                @for (t of opcionesTipoMaterial; track t.value) {
                  <button type="button" (click)="!editando && (form['tipo_material'] = t.value)"
                    [disabled]="!!editando"
                    class="px-2 py-2 rounded-lg border text-sm font-medium text-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    [class]="form['tipo_material'] === t.value ? t.clases : 'border-gray-200 text-gray-500 hover:bg-gray-50'">
                    {{ t.label }}
                  </button>
                }
              </div>
              @if (editando) {
                <p class="text-[11px] text-gray-400 mt-1">El tipo no se puede cambiar. Si está mal, desactivá el producto y creá otro.</p>
              }
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Nombre <span class="text-red-500">*</span></label>
              <input type="text" [(ngModel)]="form['nombre']" placeholder="Ej: Taladro percutor, Guantes de nitrilo…"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
              <input type="text" [(ngModel)]="form['descripcion']" placeholder="Ej: Uso exclusivo del taller de soldadura"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
            </div>

            <div [class]="form['tipo_material'] === 'DEVOLUTIVO' ? 'grid grid-cols-2 gap-3' : ''">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Marca</label>
                <input type="text" [(ngModel)]="form['marca']" placeholder="Ej: Bosch, 3M…"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
              </div>
              @if (form['tipo_material'] === 'DEVOLUTIVO') {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Modelo</label>
                  <input type="text" [(ngModel)]="form['modelo']" placeholder="Ej: GSB 550, 8210"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                </div>
              }
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Código UNSPSC</label>
              <app-ss [loadOptions]="buscarUnspsc" placeholder="Buscar código o nombre…" [(ngModel)]="form['codigo_unspsc']"></app-ss>
            </div>

            @if (form['tipo_material'] === 'DEVOLUTIVO') {
              <label class="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" [(ngModel)]="form['usa_placa_sena']" class="sr-only peer" />
                <span class="relative w-10 h-6 rounded-full bg-gray-200 peer-checked:bg-[#39A900] transition-colors
                  after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5
                  after:rounded-full after:bg-white after:shadow after:transition-transform
                  peer-checked:after:translate-x-4"></span>
                <span class="text-xs text-gray-600">Los ítems se identifican por placa SENA (no por SKU)</span>
              </label>
            }

            @if (mostrarSku()) {
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">SKU <span class="text-red-500">*</span></label>
                <input type="text" [(ngModel)]="form['SKU']" placeholder="Se autogenera si lo dejás vacío (ej. TAL-001)"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
              </div>
            }

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Unidad de medida <span class="text-red-500">*</span></label>
                <app-ss [options]="opcionesUnidadMedida()" placeholder="— Selecciona —" [(ngModel)]="form['unidad_medida']"></app-ss>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Categoría <span class="text-red-500">*</span></label>
                <app-ss [options]="opcionesCategoria" placeholder="— Selecciona —" [(ngModel)]="form['id_categoria']"></app-ss>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Bodega por defecto</label>
                <app-ss [options]="opcionesSitio" placeholder="— Sin bodega —" [(ngModel)]="form['id_sitio']"></app-ss>
                <p class="text-[11px] text-gray-400 mt-1">Opcional. Prellena el form de lotes; el stock se ubica por lote o por ítem.</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Stock mínimo</label>
                <input type="number" [(ngModel)]="form['stock_minimo']" placeholder="Ej: 5"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
              </div>
            </div>

            @if (!editando && form['tipo_material'] === 'DEVOLUTIVO') {
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Cantidad de ítems a generar</label>
                <input type="number" [(ngModel)]="form['cantidad']" placeholder="Ej: 10"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
              </div>
            }

            @if (!editando && form['tipo_material'] !== 'DEVOLUTIVO') {
              <p class="text-xs text-gray-400 bg-gray-50 rounded-lg p-2.5">
                El stock (cantidad y fecha de vencimiento) se registra después como lote(s) en el módulo de <span class="font-medium text-gray-500">Lotes</span>.
              </p>
            }

            @if (esBulto()) {
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Unidad de peso por bulto</label>
                  <app-ss [options]="opcionesUnidadPeso" placeholder="— Selecciona —" [(ngModel)]="form['unidad_peso_bulto']"></app-ss>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Peso por bulto</label>
                  <input type="number" [(ngModel)]="form['peso_por_bulto']" placeholder="Ej: 25"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                </div>
              </div>
            }
          </div>

          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button (click)="cerrarModal()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardar()" [disabled]="saving"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ saving ? 'Guardando...' : (editando ? 'Guardar' : 'Crear producto') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MaterialesProductosComponent implements OnInit, DoCheck {
  private readonly confirm = inject(ConfirmService);

  productos: Producto[] = [];
  categorias: Categoria[] = [];
  sitios: Sitio[] = [];
  /** Solo para que el buscador de la tabla alcance la placa SENA (vive en Item, no en Producto). */
  items: Item[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.productos.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.productos.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.productos.eliminar'));
  puedeVerSitios = computed(() => this.auth.tieneServicio('materiales.sitios.ver'));

  opcionesTipoMaterial = OPCIONES_TIPO_MATERIAL;
  opcionesUnidadPeso = OPCIONES_UNIDAD_PESO;

  // Arrow function (no método de clase) para que `this` quede atado al
  // componente al pasarla como [loadOptions] — <app-ss> la invoca directo,
  // sin bind. Reemplaza el arreglo hardcodeado OPCIONES_UNSPSC (~95 códigos
  // curados a mano): ahora busca contra el catálogo UNSPSC real completo
  // (backend-practica-hexagonal, tabla unspsc_catalogo).
  buscarUnspsc = async (q: string): Promise<OpcionSelect[]> => {
    const resultados = await this.api.buscarUnspsc(q);
    return resultados.map((u) => ({ label: `${u.codigo} - ${u.nombre}`, value: u.codigo }));
  };

  /** SKU se oculta del todo cuando el UNSPSC elegido es de gastronomía (empieza en '50'). */
  esGastronomia(): boolean {
    return !!this.form['codigo_unspsc']?.startsWith('50');
  }

  /** También se oculta en DEVOLUTIVO con placa SENA activa — ahí el SKU no se usa para identificar ítems. */
  mostrarSku(): boolean {
    if (this.esGastronomia()) return false;
    if (this.form['tipo_material'] === 'DEVOLUTIVO' && this.form['usa_placa_sena']) return false;
    return true;
  }

  esPerecedero(): boolean {
    return this.form['tipo_material'] === 'PERECEDERO';
  }

  esBulto(): boolean {
    return this.form['unidad_medida'] === 'BULTO' || this.form['unidad_medida'] === 'PAQUETE';
  }

  modalOpen = false;
  editando: Producto | null = null;
  form: Record<string, any> = {};

  columnLabels: Record<string, string> = {
    categoria_nombre: 'Categoría',
    tipo_material: 'Tipo de material',
    unidad_medida: 'Unidad de medida',
    stock_minimo: 'Stock mínimo',
  };

  /** Estado del auto-fill de SKU al crear — ver docblock arriba. */
  private skuEsAuto = true;
  private ultimoNombreVisto = '';
  private ultimoSkuAuto = '';

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  ngDoCheck(): void {
    if (!this.modalOpen || this.editando) return;
    const nombreActual: string = this.form['nombre'] ?? '';
    const skuActual: string = this.form['SKU'] ?? '';

    // Si el SKU visible no coincide con el último que autogeneré, alguien lo tocó a mano.
    if (skuActual !== this.ultimoSkuAuto) {
      this.skuEsAuto = !skuActual.trim(); // vacío → vuelve al auto-fill; con texto → deja de autogenerar
    }

    if (this.skuEsAuto && nombreActual !== this.ultimoNombreVisto) {
      this.ultimoNombreVisto = nombreActual;
      const nuevoSku = this.generarSku(nombreActual);
      this.form['SKU'] = nuevoSku;
      this.ultimoSkuAuto = nuevoSku;
    }
  }

  /** Prefijo de 3 letras del nombre + consecutivo por prefijo entre los productos ya cargados — mismo algoritmo que SGM. */
  private generarSku(nombre: string): string {
    const limpio = nombre.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const prefijo = limpio.substring(0, 3);
    if (!prefijo) return '';
    const nums = this.productos
      .map((p) => {
        const sku = (p.SKU ?? '').toUpperCase();
        if (!sku.startsWith(prefijo + '-')) return NaN;
        return parseInt(sku.split('-').pop() ?? '', 10);
      })
      .filter((n) => !isNaN(n) && n > 0);
    const siguiente = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `${prefijo}-${siguiente}`;
  }

  get opcionesCategoria(): OpcionSelect[] {
    return this.categorias.map((c) => ({ label: c.nombre, value: c.id_categoria }));
  }

  get opcionesSitio(): OpcionSelect[] {
    return this.sitios.map((s) => ({ label: s.nombre, value: s.id_sitio }));
  }

  /** Unidades ofrecidas según la familia UNSPSC elegida (primeros 4 dígitos) — ver UNIDADES_POR_FAMILIA. */
  opcionesUnidadMedida(): OpcionSelect[] {
    const familia = (this.form['codigo_unspsc'] ?? '').slice(0, 4);
    const unidades = UNIDADES_POR_FAMILIA[familia];
    return unidades ? unidades.map((u) => ({ label: u, value: u })) : OPCIONES_UNIDAD_MEDIDA;
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
      visible: () => this.auth.isAdmin() || this.auth.cargo() === 'instructor',
    },
    {
      label: 'Lotes',
      routerLink: () => ['/materiales/lotes'],
      queryParams: (r) => ({ id_producto: r.id_producto }),
      visible: () => this.auth.isAdmin(),
    },
  ];

  /** B1 — filtro de estado del toolbar (solo se ofrece a quien puede desactivar).
   *  'activos' = solo activos (default); 'inactivos' = solo los desactivados,
   *  para reactivarlos. */
  readonly estadoOpciones = [
    { value: 'activos', label: 'Activos' },
    { value: 'inactivos', label: 'Desactivados' },
  ];
  estadoFiltro: 'activos' | 'inactivos' = 'activos';

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
    this.estadoFiltro = v === 'inactivos' ? 'inactivos' : 'activos';
    this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // Sin `materiales.sitios.ver` (caso típico de aprendiz) ni se pide
      // /sitios ni se deja que un 403 ahí tumbe el resto de la carga.
      const verSitios = this.puedeVerSitios();
      const soloInactivos = this.estadoFiltro === 'inactivos';
      const [productos, categorias, sitios, items] = await Promise.all([
        this.api.listarProductos(soloInactivos),
        this.api.listarCategorias(),
        verSitios ? this.api.listarSitios().catch(() => [] as Sitio[]) : Promise.resolve([] as Sitio[]),
        this.api.listarItems().catch(() => [] as Item[]),
      ]);
      // `listarProductos(true)` trae activos + desactivados; en modo
      // "Desactivados" nos quedamos solo con los que están dados de baja.
      this.productos = soloInactivos
        ? productos.filter((p) => (p as any).activo === false)
        : productos;
      this.categorias = categorias;
      this.sitios = sitios;
      this.items = items;
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
    this.form = {
      nombre: '', descripcion: '', codigo_unspsc: '', SKU: '', marca: '', modelo: '',
      tipo_material: 'CONSUMO', unidad_medida: '', usa_placa_sena: true,
      unidad_peso_bulto: '', peso_por_bulto: '',
      id_categoria: this.categorias[0].id_categoria,
      // Bodega por defecto opcional — arranca vacía (Paso 0 de #5).
      id_sitio: '',
      cantidad: 1, stock_minimo: 1,
    };
    this.skuEsAuto = true;
    this.ultimoNombreVisto = '';
    this.ultimoSkuAuto = '';
    this.error = null;
    this.modalOpen = true;
  }

  editar(fila: any): void {
    if (!this.puedeEditar()) return;
    const producto = this.productos.find((p) => p.id_producto === fila.id_producto)!;
    this.editando = producto;
    this.form = {
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? '',
      codigo_unspsc: producto.codigo_unspsc ?? '',
      SKU: producto.SKU ?? '',
      marca: producto.marca ?? '',
      modelo: producto.modelo ?? '',
      tipo_material: producto.tipo_material,
      usa_placa_sena: producto.usa_placa_sena ?? true,
      unidad_medida: producto.unidad_medida,
      unidad_peso_bulto: producto.unidad_peso_bulto ?? '',
      peso_por_bulto: producto.peso_por_bulto ?? '',
      id_categoria: producto.id_categoria,
      id_sitio: producto.id_sitio ?? '',
      stock_minimo: producto.stock_minimo,
    };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async guardar(): Promise<void> {
    const form = this.form;
    if (!form['nombre']?.trim()) {
      this.error = 'El nombre es obligatorio.';
      return;
    }
    if (!form['unidad_medida']?.trim()) {
      this.error = 'La unidad de medida es obligatoria.';
      return;
    }
    if (this.mostrarSku() && !form['SKU']?.trim()) {
      this.error = 'El SKU es obligatorio salvo para productos de gastronomía (código UNSPSC que empieza en 50) o devolutivos con placa SENA.';
      return;
    }
    this.saving = true;
    this.error = null;
    const esDevolutivo = form['tipo_material'] === 'DEVOLUTIVO';
    // Solo se mandan si el campo aplica y está visible — mismo criterio que SKU con gastronomía.
    // `fecha_vencimiento` ya NO se pide acá: vive en cada lote (módulo de Lotes).
    const camposCondicionales = {
      unidad_peso_bulto: this.esBulto() ? (form['unidad_peso_bulto'] || undefined) : undefined,
      peso_por_bulto: this.esBulto() && form['peso_por_bulto'] ? Number(form['peso_por_bulto']) : undefined,
    };
    // `es_psd` no lo llena el usuario — se deriva de tipo_material, igual que SGM (Ronda 6).
    const esPsd = this.esPerecedero();
    // Solo aplica a DEVOLUTIVO — en CONSUMO/PERECEDERO no se manda (el backend ya lo ignora, pero así queda explícito).
    const usaPlacaSena = form['tipo_material'] === 'DEVOLUTIVO' ? !!form['usa_placa_sena'] : undefined;
    // "Modelo" solo tiene sentido en devolutivos (un activo con nº de modelo); en consumo/perecedero el campo ni se muestra.
    const modelo = form['tipo_material'] === 'DEVOLUTIVO' ? (form['modelo'] || undefined) : undefined;
    try {
      if (this.editando) {
        // `tipo_material` es inmutable (M4) — el backend ya no lo acepta en el PATCH.
        await this.api.actualizarProducto(this.editando.id_producto, {
          nombre: form['nombre'],
          descripcion: form['descripcion'] || undefined,
          codigo_unspsc: form['codigo_unspsc'] || undefined,
          SKU: form['SKU'] || undefined,
          marca: form['marca'] || undefined,
          modelo,
          usa_placa_sena: usaPlacaSena,
          unidad_medida: form['unidad_medida'],
          es_psd: esPsd,
          id_categoria: form['id_categoria'],
          id_sitio: form['id_sitio'] || undefined,
          stock_minimo: Number(form['stock_minimo']),
          ...camposCondicionales,
        });
        this.toast.ok('Producto actualizado');
      } else {
        const { items_generados } = await this.api.crearProducto({
          nombre: form['nombre'],
          descripcion: form['descripcion'] || undefined,
          codigo_unspsc: form['codigo_unspsc'] || undefined,
          SKU: form['SKU'] || undefined,
          marca: form['marca'] || undefined,
          modelo,
          tipo_material: form['tipo_material'],
          usa_placa_sena: usaPlacaSena,
          unidad_medida: form['unidad_medida'],
          es_psd: esPsd,
          id_categoria: form['id_categoria'],
          id_sitio: form['id_sitio'] || undefined,
          // Solo DEVOLUTIVO genera ítems; en CONSUMO/PERECEDERO el stock se carga aparte en Lotes.
          cantidad: esDevolutivo ? (Number(form['cantidad']) || 1) : 0,
          stock_minimo: Number(form['stock_minimo']),
          ...camposCondicionales,
        });
        if (esDevolutivo) {
          this.toast.ok('Producto creado', `Se generaron ${items_generados.length} ítem(s).`);
          // Recordatorio: sin SKU copiado, esos ítems son irreconocibles hasta
          // que se les asigne la placa a mano en Ítems.
          if (usaPlacaSena && items_generados.length > 0) {
            this.toast.warn(
              'Falta la placa SENA',
              `Recordá agregar la placa SENA a los ${items_generados.length} ítem(s) de "${form['nombre']}" en el módulo de Ítems.`,
              7000,
            );
          }
        } else {
          this.toast.ok('Producto creado');
          this.toast.warn(
            'Falta el stock',
            `Registrá el stock inicial de "${form['nombre']}" como lote en el módulo de Lotes.`,
            7000,
          );
        }
      }
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar el producto.';
    } finally {
      this.saving = false;
    }
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
