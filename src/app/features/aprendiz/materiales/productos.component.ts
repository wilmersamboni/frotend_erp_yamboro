import { Component, DoCheck, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent } from '../../../shared/components/admin-table.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import { OpcionSelect } from '../../admin/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { Categoria, Item, MaterialesApiService, Producto, Sitio } from '../../../core/services/materiales/materiales-api.service';

const OPCIONES_TIPO_MATERIAL = [
  { value: 'CONSUMO', label: 'Consumo', clases: 'border-green-300 bg-green-50 text-green-700' },
  { value: 'DEVOLUTIVO', label: 'Devolutivo', clases: 'border-blue-300 bg-blue-50 text-blue-700' },
  { value: 'PERECEDERO', label: 'Perecedero', clases: 'border-amber-300 bg-amber-50 text-amber-700' },
] as const;

// Mismo catálogo UNSPSC curado que la versión admin
// (features/admin/materiales/productos.component.ts) — ver ese archivo para
// el comentario completo sobre el origen y la decisión de mantenerlo
// hardcodeado (pendiente de revisar tabla+búsqueda server-side más adelante).
const OPCIONES_UNSPSC: OpcionSelect[] = [
  { label: '50101501 - Arroz', value: '50101501' },
  { label: '50101701 - Harina de trigo', value: '50101701' },
  { label: '50101702 - Harina de maíz', value: '50101702' },
  { label: '50111501 - Aceite vegetal comestible', value: '50111501' },
  { label: '50111601 - Mantequilla', value: '50111601' },
  { label: '50111602 - Margarina', value: '50111602' },
  { label: '50121501 - Azúcar refinada', value: '50121501' },
  { label: '50121901 - Sal de mesa', value: '50121901' },
  { label: '50122001 - Vinagre', value: '50122001' },
  { label: '50131501 - Leche entera pasteurizada', value: '50131501' },
  { label: '50131502 - Leche descremada', value: '50131502' },
  { label: '50131601 - Crema de leche', value: '50131601' },
  { label: '50131701 - Queso fresco', value: '50131701' },
  { label: '50141501 - Huevos de gallina', value: '50141501' },
  { label: '50151501 - Pollo entero fresco', value: '50151501' },
  { label: '50151502 - Carne de res fresca', value: '50151502' },
  { label: '50151601 - Cerdo fresco', value: '50151601' },
  { label: '50171501 - Pescado fresco', value: '50171501' },
  { label: '50181501 - Camarón fresco', value: '50181501' },
  { label: '50191501 - Legumbres secas (lentejas, frijoles, garbanzos)', value: '50191501' },
  { label: '50201501 - Papas frescas', value: '50201501' },
  { label: '50201502 - Cebollas frescas', value: '50201502' },
  { label: '50201503 - Tomates frescos', value: '50201503' },
  { label: '50201701 - Zanahorias frescas', value: '50201701' },
  { label: '50211501 - Manzanas frescas', value: '50211501' },
  { label: '50211502 - Plátanos frescos', value: '50211502' },
  { label: '50221501 - Especias y condimentos', value: '50221501' },
  { label: '50221502 - Hierbas aromáticas secas', value: '50221502' },
  { label: '50281501 - Café molido', value: '50281501' },
  { label: '50281701 - Té en bolsas', value: '50281701' },
  { label: '50291501 - Agua embotellada', value: '50291501' },
  { label: '50301701 - Pasta alimentaria', value: '50301701' },
  { label: '50301801 - Pan industrial', value: '50301801' },
  { label: '52141501 - Ollas de acero inoxidable', value: '52141501' },
  { label: '52141502 - Sartenes de acero inoxidable', value: '52141502' },
  { label: '52141601 - Tablas de cortar plásticas', value: '52141601' },
  { label: '52141701 - Cuchillos de cocina profesional', value: '52141701' },
  { label: '52141702 - Juego de cuchillos de chef', value: '52141702' },
  { label: '52141801 - Cucharones y espumaderas', value: '52141801' },
  { label: '52141901 - Bowls de acero inoxidable', value: '52141901' },
  { label: '52142001 - Bandejas de hornear', value: '52142001' },
  { label: '52142101 - Coladeras y coladores', value: '52142101' },
  { label: '52142201 - Peladores de verduras', value: '52142201' },
  { label: '52142301 - Batidores de alambre (globo)', value: '52142301' },
  { label: '52142401 - Termómetros de cocina', value: '52142401' },
  { label: '48101701 - Licuadora industrial', value: '48101701' },
  { label: '48101702 - Batidora de pedestal industrial', value: '48101702' },
  { label: '48101801 - Horno de convección', value: '48101801' },
  { label: '48102001 - Freidora industrial', value: '48102001' },
  { label: '48102101 - Plancha de cocina industrial', value: '48102101' },
  { label: '26111701 - Baterías recargables', value: '26111701' },
  { label: '26111702 - Pilas alcalinas', value: '26111702' },
  { label: '48102301 - Estufa industrial a gas', value: '48102301' },
  { label: '47131501 - Detergente desengrasante para cocina', value: '47131501' },
  { label: '47131502 - Desinfectante multiusos para superficies', value: '47131502' },
  { label: '47131601 - Jabón antibacterial líquido', value: '47131601' },
  { label: '47131701 - Blanqueador / hipoclorito de sodio', value: '47131701' },
  { label: '47141501 - Esponjas y estropajos', value: '47141501' },
  { label: '47141601 - Guantes de caucho para limpieza', value: '47141601' },
  { label: '47141701 - Traperos y mochos', value: '47141701' },
  { label: '47141702 - Escobas y cepillos', value: '47141702' },
  { label: '24111501 - Bolsas plásticas para alimentos', value: '24111501' },
  { label: '24111601 - Film plástico / vinipel', value: '24111601' },
  { label: '24111701 - Papel aluminio para cocina', value: '24111701' },
  { label: '24111801 - Papel encerado para alimentos', value: '24111801' },
  { label: '31201501 - Recipientes herméticos plásticos', value: '31201501' },
  { label: '24121501 - Contenedores desechables de icopor', value: '24121501' },
  { label: '24121601 - Vasos desechables de plástico', value: '24121601' },
  { label: '24121701 - Cubiertos desechables', value: '24121701' },
  { label: '43211501 - Computador de escritorio (PC)', value: '43211501' },
  { label: '43211503 - Computador portátil / laptop', value: '43211503' },
  { label: '43211507 - Servidor de red', value: '43211507' },
  { label: '43211604 - Teclado USB', value: '43211604' },
  { label: '43211605 - Mouse / ratón óptico', value: '43211605' },
  { label: '43211901 - Memoria USB / pendrive', value: '43211901' },
  { label: '43211702 - Impresora de inyección de tinta', value: '43211702' },
  { label: '43211701 - Equipo de lectura de código de barras', value: '43211701' },
  { label: '43212105 - Tableta electrónica (tablet)', value: '43212105' },
  { label: '43201401 - Proyector multimedia / video beam', value: '43201401' },
  { label: '43201405 - Pantalla interactiva / smartboard', value: '43201405' },
  { label: '43201601 - Monitor de computador', value: '43201601' },
  { label: '43202201 - Cámara web / webcam', value: '43202201' },
  { label: '43201801 - Audífonos con micrófono (headset)', value: '43201801' },
  { label: '43191501 - Disco duro externo', value: '43191501' },
  { label: '43191602 - Tarjeta de memoria SD', value: '43191602' },
  { label: '43221501 - Software de sistema operativo', value: '43221501' },
  { label: '43221502 - Software de ofimática (Office)', value: '43221502' },
  { label: '43221701 - Software antivirus / seguridad', value: '43221701' },
  { label: '43222601 - Router / enrutador de red', value: '43222601' },
  { label: '43222602 - Switch de red', value: '43222602' },
  { label: '43222603 - Punto de acceso inalámbrico (WiFi)', value: '43222603' },
  { label: '43222501 - UPS / sistema de alimentación ininterrumpida', value: '43222501' },
  { label: '43231501 - Cable de red UTP', value: '43231501' },
];

const TODAS_LAS_UNIDADES = [
  'UNIDAD', 'PAR', 'KIT', 'JUEGO', 'SET', 'METRO', 'ROLLO',
  'LITRO', 'MILILITRO', 'GALÓN', 'BOTELLA', 'LATA', 'FRASCO',
  'KILOGRAMO', 'GRAMO', 'LIBRA', 'TONELADA',
  'BULTO', 'PAQUETE', 'CAJA', 'CARTÓN', 'ATADO', 'BOLSA',
  'LICENCIA',
];
const OPCIONES_UNIDAD_MEDIDA: OpcionSelect[] = TODAS_LAS_UNIDADES.map((u) => ({ label: u, value: u }));

// Mismo mapa que la versión admin (ver ese archivo para el detalle completo por familia).
const UNIDADES_POR_FAMILIA: Record<string, string[]> = {
  '5010': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'BULTO', 'PAQUETE', 'TONELADA'],
  '5011': ['LITRO', 'MILILITRO', 'BOTELLA', 'GALÓN', 'LATA', 'KILOGRAMO'],
  '5012': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'LITRO', 'BOTELLA', 'PAQUETE', 'BULTO'],
  '5013': ['LITRO', 'MILILITRO', 'BOTELLA', 'BOLSA', 'CAJA', 'KILOGRAMO', 'GRAMO', 'UNIDAD'],
  '5014': ['UNIDAD', 'CARTÓN', 'PAQUETE', 'CAJA'],
  '5015': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'PAQUETE'],
  '5017': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD'],
  '5018': ['KILOGRAMO', 'GRAMO', 'LIBRA'],
  '5019': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'BULTO', 'PAQUETE'],
  '5020': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'ATADO', 'PAQUETE', 'BULTO'],
  '5021': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'CAJA', 'PAQUETE'],
  '5022': ['GRAMO', 'KILOGRAMO', 'PAQUETE', 'FRASCO', 'UNIDAD'],
  '5028': ['GRAMO', 'KILOGRAMO', 'PAQUETE', 'CAJA', 'UNIDAD'],
  '5029': ['LITRO', 'BOTELLA', 'UNIDAD'],
  '5030': ['PAQUETE', 'UNIDAD', 'CAJA'],
  '5214': ['UNIDAD', 'JUEGO', 'SET', 'KIT', 'CAJA'],
  '4810': ['UNIDAD'],
  '2611': ['UNIDAD', 'PAQUETE', 'CAJA'],
  '4713': ['LITRO', 'MILILITRO', 'BOTELLA', 'GALÓN', 'LATA'],
  '4714': ['UNIDAD', 'PAQUETE', 'CAJA'],
  '2411': ['ROLLO', 'PAQUETE', 'CAJA', 'METRO'],
  '3120': ['UNIDAD', 'JUEGO', 'SET', 'CAJA'],
  '2412': ['PAQUETE', 'CAJA', 'UNIDAD'],
  '4320': ['UNIDAD'],
  '4321': ['UNIDAD', 'CAJA'],
  '4319': ['UNIDAD', 'CAJA'],
  '4322': ['UNIDAD', 'LICENCIA'],
  '4323': ['ROLLO', 'METRO', 'UNIDAD'],
};

const OPCIONES_UNIDAD_PESO: OpcionSelect[] = ['KILOGRAMO', 'GRAMO', 'LIBRA'].map((u) => ({ label: u, value: u }));

/**
 * Catálogo de productos para aprendiz — crear/editar/eliminar gateado por
 * servicio (`materiales.productos.crear/.editar/.eliminar`), no por cargo.
 * Ver plan "Ronda 3".
 *
 * Diálogo propio (no `AdminModalComponent`, Ronda 2026-09-04) — ver docblock
 * completo en la versión admin de este componente: "Tipo de material" como 3
 * pills de color en vez de `<select>`, resto en grilla de 2 columnas.
 */
@Component({
  selector: 'app-aprendiz-materiales-productos',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, SearchableSelectComponent],
  template: `
    <div class="p-6">
      <h1 class="text-xl font-bold text-gray-800 mb-5">Productos</h1>

      <app-admin-table
        [addLabel]="puedeCrear() ? 'Nuevo producto' : null"
        (add)="nuevo()"
        [rows]="filas"
        [searchable]="true"
        [searchPlaceholder]="'Buscar por nombre, SKU, categoría, placa…'"
        [columns]="['nombre', 'categoria_nombre', 'tipo_material', 'unidad_medida', 'stock_minimo']"
        [columnLabels]="columnLabels"
        [loading]="loading"
        [canEdit]="puedeEditar()"
        [canDelete]="puedeEliminar()"
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
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1.5">Tipo de material <span class="text-red-500">*</span></label>
              <div class="grid grid-cols-3 gap-2">
                @for (t of opcionesTipoMaterial; track t.value) {
                  <button type="button" (click)="form['tipo_material'] = t.value"
                    class="px-2 py-2 rounded-lg border text-sm font-medium text-center transition-colors"
                    [class]="form['tipo_material'] === t.value ? t.clases : 'border-gray-200 text-gray-500 hover:bg-gray-50'">
                    {{ t.label }}
                  </button>
                }
              </div>
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
              <app-ss [options]="opcionesUnspsc" placeholder="Buscar código o nombre…" [(ngModel)]="form['codigo_unspsc']"></app-ss>
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
                <label class="block text-xs font-medium text-gray-600 mb-1">Sitio <span class="text-red-500">*</span></label>
                <app-ss [options]="opcionesSitio" placeholder="— Selecciona —" [(ngModel)]="form['id_sitio']"></app-ss>
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
export class AprendizMaterialesProductosComponent implements OnInit, DoCheck {
  private readonly confirm = inject(ConfirmService);

  productos: Producto[] = [];
  categorias: Categoria[] = [];
  sitios: Sitio[] = [];
  /** Solo para que el buscador de la tabla alcance la placa SENA (vive en Item, no en Producto). */
  items: Item[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  opcionesTipoMaterial = OPCIONES_TIPO_MATERIAL;
  opcionesUnspsc = OPCIONES_UNSPSC;
  opcionesUnidadPeso = OPCIONES_UNIDAD_PESO;

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

  puedeCrear = computed(() => this.auth.tieneServicio('materiales.productos.crear'));
  puedeEditar = computed(() => this.auth.tieneServicio('materiales.productos.editar'));
  puedeEliminar = computed(() => this.auth.tieneServicio('materiales.productos.eliminar'));

  /** Estado del auto-fill de SKU al crear — ver docblock de la versión admin. */
  private skuEsAuto = true;
  private ultimoNombreVisto = '';
  private ultimoSkuAuto = '';

  constructor(private api: MaterialesApiService, private toast: ToastService, private auth: AuthService) {}

  ngOnInit(): void {
    this.cargar();
  }

  ngDoCheck(): void {
    if (!this.modalOpen || this.editando) return;
    const nombreActual: string = this.form['nombre'] ?? '';
    const skuActual: string = this.form['SKU'] ?? '';
    if (skuActual !== this.ultimoSkuAuto) {
      this.skuEsAuto = !skuActual.trim();
    }
    if (this.skuEsAuto && nombreActual !== this.ultimoNombreVisto) {
      this.ultimoNombreVisto = nombreActual;
      const nuevoSku = this.generarSku(nombreActual);
      this.form['SKU'] = nuevoSku;
      this.ultimoSkuAuto = nuevoSku;
    }
  }

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

  opcionesUnidadMedida(): OpcionSelect[] {
    const familia = (this.form['codigo_unspsc'] ?? '').slice(0, 4);
    const unidades = UNIDADES_POR_FAMILIA[familia];
    return unidades ? unidades.map((u) => ({ label: u, value: u })) : OPCIONES_UNIDAD_MEDIDA;
  }

  get filas(): any[] {
    return this.productos.map((p) => ({
      ...p,
      categoria_nombre: p.categoria?.nombre ?? this.categorias.find((c) => c.id_categoria === p.id_categoria)?.nombre ?? '—',
      // Campo oculto (no está en `columns`) — solo para que el buscador de la tabla matchee por placa SENA.
      _placas: this.items.filter((i) => i.id_producto === p.id_producto).map((i) => i.placa_sena).filter(Boolean).join(' '),
    }));
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // El aprendiz no tiene `materiales.sitios.ver` (ni lo necesita) — pedir
      // /sitios igual daba 403 y, al ir en Promise.all, tumbaba toda la carga.
      // Sitios solo hace falta para el modal de alta/edición, que el aprendiz
      // no abre salvo excepción de permiso explícita.
      const verSitios = this.auth.tieneServicio('materiales.sitios.ver');
      const [productos, categorias, sitios, items] = await Promise.all([
        this.api.listarProductos(),
        this.api.listarCategorias().catch(() => [] as Categoria[]),
        verSitios ? this.api.listarSitios().catch(() => [] as Sitio[]) : Promise.resolve([] as Sitio[]),
        this.api.listarItems().catch(() => [] as Item[]),
      ]);
      this.productos = productos;
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
    if (this.categorias.length === 0 || this.sitios.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos una categoría y un sitio antes de registrar un producto.');
      return;
    }
    this.editando = null;
    this.form = {
      nombre: '', descripcion: '', codigo_unspsc: '', SKU: '', marca: '', modelo: '',
      tipo_material: 'CONSUMO', unidad_medida: '', usa_placa_sena: true,
      unidad_peso_bulto: '', peso_por_bulto: '',
      id_categoria: this.categorias[0].id_categoria,
      id_sitio: this.sitios[0].id_sitio,
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
      id_sitio: producto.id_sitio ?? this.sitios[0]?.id_sitio,
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
        await this.api.actualizarProducto(this.editando.id_producto, {
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
          id_sitio: form['id_sitio'],
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
          id_sitio: form['id_sitio'],
          // Solo DEVOLUTIVO genera ítems; en CONSUMO/PERECEDERO el stock se carga aparte en Lotes.
          cantidad: esDevolutivo ? (Number(form['cantidad']) || 1) : 0,
          stock_minimo: Number(form['stock_minimo']),
          ...camposCondicionales,
        });
        if (esDevolutivo) {
          this.toast.ok('Producto creado', `Se generaron ${items_generados.length} ítem(s).`);
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

  async eliminar(fila: any): Promise<void> {
    if (!this.puedeEliminar()) return;
    if (!(await this.confirm.ask(`¿Eliminar el producto "${fila.nombre}"?`))) return;
    try {
      await this.api.eliminarProducto(fila.id_producto);
      this.toast.ok('Producto eliminado');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo eliminar el producto.');
    }
  }
}
