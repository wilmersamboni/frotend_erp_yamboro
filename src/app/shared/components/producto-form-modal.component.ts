import { Component, DoCheck, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SearchableSelectComponent } from './searchable-select.component';
import { OpcionSelect } from '../../features/admin/services/admin.service';
import { ToastService } from '../../core/services/toast.service';
import { Categoria, MaterialesApiService, Producto, Sitio } from '../../core/services/materiales/materiales-api.service';

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
  'BULTO', 'PAQUETE', 'CAJA', 'CARTÓN', 'ATADO', 'BOLSA', 'SOBRE', 'RACIMO',
  'LICENCIA', 'ARROBA',
];

// Filtra las unidades ofrecidas según la familia UNSPSC elegida (primeros 4
// dígitos del código) — mismo criterio que SGM (`UNIDADES_POR_FAMILIA`),
// adaptado y extendido acá para cubrir también las familias no-alimenticias
// del catálogo propio del ERP (TIC, aseo, empaques, herramientas de cocina).
/**
 * ⚠️ 2026-09-17 — este mapa se reconstruyó desde cero. La versión anterior
 * asignaba categorías a cada familia UNSPSC "por memoria" (asumiendo, p.ej.,
 * que la familia 5017 era "Pescado"), sin verificar contra el catálogo real
 * importado (`unspsc_catalogo`, 70.437 códigos). Al revisar el caso
 * reportado ("Conservas de pescado" = código 50121541, familia 5012) se
 * confirmó que esa asunción era falsa — 5012 sí es pescado/mariscos, pero
 * 5017 en realidad es "Condimentos y especias", 5018 es "Panadería", etc.
 * La mayoría de las familias de este mapa (alimentos, aseo, empaques, TIC)
 * tenían el mismo problema. Todas las entradas de abajo fueron verificadas
 * consultando el catálogo real de `erp_yamboro` antes de escribirlas.
 *
 * Categorías que NO se pudieron curar de forma confiable, y por qué:
 * - Frutas, verduras y "agua y bebidas": el catálogo no tiene una familia
 *   única y coherente para estas — cada fruta/verdura (manzana, alcachofa,
 *   uva, limón...) tiene su propio grupo de ~10 familias (una por estado:
 *   fresca, orgánica, seca, congelada, en conserva, puré...). Curar esto
 *   requeriría mapear decenas de familias por cada producto agrícola, no es
 *   viable a mano. Quedan en el fallback (`TODAS_LAS_UNIDADES`, ya incluye
 *   LATA/RACIMO/GALÓN para cubrir los casos más comunes).
 * - Detergentes/jabones de limpieza: no se encontró una familia identificable
 *   con confianza (las búsquedas por "detergente" solo daban reactivos de
 *   laboratorio, no productos de aseo).
 * - Herramientas de mano sueltas (destornillador, martillo): están
 *   dispersas en varias familias sin un patrón claro — solo las máquinas
 *   industriales (2310) forman una familia coherente.
 */
const UNIDADES_POR_FAMILIA: Record<string, string[]> = {
  '2310': ['UNIDAD', 'JUEGO', 'KIT'], // Máquinas-herramienta industriales (taladros, tornos, cortadoras...)
  '3011': ['BULTO', 'KILOGRAMO', 'TONELADA'], // Concreto, cemento, morteros
  '3210': ['UNIDAD', 'KIT', 'PAQUETE', 'CAJA'], // Componentes/tarjetas electrónicas (microcontroladores, circuitos)
  '3120': ['ROLLO', 'UNIDAD', 'CAJA'], // Cintas adhesivas/aislantes — antes decía (mal) "Recipientes herméticos"
  '2412': ['CAJA', 'PAQUETE', 'BULTO', 'UNIDAD'], // Cajas y material de embalaje — antes decía (mal) "Desechables"
  '2411': ['UNIDAD', 'PAQUETE', 'CAJA', 'BULTO'], // Bolsas y contenedores flexibles (lona, papel, plástico)
  '4713': ['UNIDAD', 'PAQUETE', 'CAJA', 'ROLLO'], // Trapos, esponjas, papel higiénico — antes decía (mal) "Detergentes"
  '5215': ['PAQUETE', 'CAJA', 'BOLSA', 'UNIDAD'], // Desechables de un solo uso (vasos, platos, cubiertos, pitillos)
  '5214': ['UNIDAD'], // Electrodomésticos (neveras, microondas, lavavajillas) — antes decía (mal) "Utensilios de cocina"
  '4810': ['UNIDAD'], // Equipos de cocina industrial/comercial (baños maría, hornos, parrillas)
  '2611': ['UNIDAD', 'PAR', 'PAQUETE', 'CAJA'], // Baterías y pilas — PAR: AA/AAA se venden de a pares
  '4321': ['UNIDAD', 'CAJA'], // Computadores y periféricos (servidores, portátiles, mouse, teclado)
  '4320': ['UNIDAD'], // Componentes internos de PC (tarjetas, discos, memorias) — antes decía (mal) "Pantallas/proyectores"
  '4319': ['UNIDAD', 'CAJA'], // Teléfonos y telefonía — antes decía (mal) "Almacenamiento"
  '4322': ['UNIDAD'], // Sistemas/equipos de telefonía (PBX, ACD) — antes decía (mal) "Software y redes"
  '4323': ['UNIDAD', 'LICENCIA'], // Software — antes decía (mal) "Cableado de red"

  // ── Alimentos (segmento 50) — familias verificadas contra el catálogo real ──
  '5010': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'PAQUETE', 'BOLSA', 'FRASCO'], // Nueces y semillas
  '5011': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'PAQUETE', 'LATA','ARROBA'], // Carnes (res, cerdo, pollo, ternera)
  // Pescados, mariscos y otros productos acuáticos: LATA — atún, sardinas y
  // similares se venden mayormente enlatados (2026-09-17: gap real reportado,
  // el motivo de esta reconstrucción — la familia correcta es 5012, no 5017
  // como decía la versión anterior).
  '5012': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD', 'LATA'],
  '5013': ['LITRO', 'MILILITRO', 'BOTELLA', 'BOLSA', 'CAJA', 'CARTÓN', 'LATA', 'FRASCO', 'KILOGRAMO', 'GRAMO', 'LIBRA', 'UNIDAD'], // Huevos y lácteos (leche, queso, crema, suero)
  '5015': ['LITRO', 'MILILITRO', 'BOTELLA', 'GALÓN', 'LATA', 'PAQUETE', 'KILOGRAMO'], // Aceites y grasas vegetales (incl. margarina)
  '5016': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'PAQUETE', 'BOLSA', 'CAJA', 'FRASCO', 'SOBRE', 'UNIDAD'], // Azúcares, edulcorantes, chocolates, caramelos
  '5017': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'LITRO', 'BOTELLA', 'FRASCO', 'PAQUETE', 'SOBRE', 'BULTO'], // Condimentos, especias, sal, vinagres, salsas
  '5018': ['PAQUETE', 'BOLSA', 'UNIDAD', 'CAJA', 'KILOGRAMO', 'LIBRA'], // Panadería y horneados (pan, galletas, levadura, masas)
  '5019': ['PAQUETE', 'BOLSA', 'LATA', 'UNIDAD', 'CAJA', 'KILOGRAMO', 'GRAMO'], // Sopas, guisos y pasabocas preparados
  '5020': ['GRAMO', 'KILOGRAMO', 'PAQUETE', 'CAJA', 'LATA', 'FRASCO', 'SOBRE', 'UNIDAD','ARROBA'], // Café y té
  '5022': ['KILOGRAMO', 'GRAMO', 'LIBRA', 'BULTO', 'PAQUETE', 'BOLSA', 'LATA','ARROBA'], // Legumbres, cereales y harinas
};

// Unidades de peso válidas para "peso por bulto" — subconjunto de
// TODAS_LAS_UNIDADES, mismas 3 que ofrece SGM (unidadesPeso).
const OPCIONES_UNIDAD_PESO: OpcionSelect[] = ['KILOGRAMO', 'GRAMO', 'LIBRA'].map((u) => ({ label: u, value: u }));

/**
 * <app-producto-form-modal> — formulario de crear/editar producto, ÚNICO para
 * todos los puntos de entrada (antes vivía completo en
 * `features/materiales/productos.component.ts` y duplicado, mucho más
 * reducido, dentro de `features/mi-bodega/mi-bodega.component.ts` — un
 * encargado de bodega sin `materiales.productos.ver` solo veía ese segundo
 * formulario, sin UNSPSC/marca/modelo/placa SENA/SKU automático). Ambos
 * ahora instancian este mismo componente.
 *
 * `sitioFijo`: cuando se pasa (Mi Bodega, ya con una bodega elegida), oculta
 * el selector "Bodega por defecto" y precarga ese valor al crear — evitar que
 * el encargado le asigne el producto nuevo a una bodega que no administra.
 * Al editar, la bodega ya guardada del producto no se toca (mismo criterio
 * que tenía Mi Bodega antes: su edición nunca mandaba `id_sitio`).
 */
@Component({
  selector: 'app-producto-form-modal',
  standalone: true,
  imports: [FormsModule, SearchableSelectComponent],
  template: `
    @if (open) {
      <div class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="closed.emit()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
            <h2 class="text-lg font-bold text-gray-800">{{ editando ? 'Editar producto' : 'Nuevo producto' }}</h2>
            <button (click)="closed.emit()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="producto-form-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6">
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

            <div [class]="form['tipo_material'] === 'DEVOLUTIVO' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''">
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
                <span class="text-xs text-gray-600">Cada ítem se identifica por placa SENA; el SKU identifica el producto</span>
              </label>
            }

            @if (mostrarSku()) {
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">SKU <span class="text-red-500">*</span></label>
                <input type="text" [(ngModel)]="form['SKU']" placeholder="Automático: TAL-CAT-GSB550-0001"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
              </div>
            }

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Unidad de medida <span class="text-red-500">*</span></label>
                <app-ss [options]="opcionesUnidadMedida()" placeholder="— Selecciona —" [(ngModel)]="form['unidad_medida']"></app-ss>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Categoría <span class="text-red-500">*</span></label>
                <app-ss [options]="opcionesCategoria" placeholder="— Selecciona —" [(ngModel)]="form['id_categoria']"></app-ss>
              </div>
            </div>

            <div [class]="sitioFijo ? '' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'">
              @if (!sitioFijo) {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Bodega por defecto</label>
                  <app-ss [options]="opcionesSitio" placeholder="— Sin bodega —" [(ngModel)]="form['id_sitio']"></app-ss>
                  <p class="text-[11px] text-gray-400 mt-1">Opcional. Prellena el form de lotes; el stock se ubica por lote o por ítem.</p>
                </div>
              }
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
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          @if (bodegaSeleccionadaInactiva) {
            <p class="text-amber-600 text-xs mt-3 p-2 bg-amber-50 rounded-lg">Esa bodega está inactiva — no se puede guardar mientras esté así.</p>
          }
          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }
          </div>

          <div class="shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-gray-100 px-4 py-4 sm:px-6">
            <button (click)="closed.emit()" class="w-full sm:w-auto px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardar()" [disabled]="saving || bodegaSeleccionadaInactiva"
              [style.opacity]="(saving || bodegaSeleccionadaInactiva) ? 0.6 : 1"
              [style.cursor]="(saving || bodegaSeleccionadaInactiva) ? 'not-allowed' : 'pointer'"
              class="w-full sm:w-auto px-5 py-2 text-white text-sm font-medium rounded-lg transition-colors"
              style="background-color: #39A900">
              {{ saving ? 'Guardando...' : (editando ? 'Guardar' : 'Crear producto') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .producto-form-scroll {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }

    .producto-form-scroll::-webkit-scrollbar {
      display: none;
    }
  `],
})
export class ProductoFormModalComponent implements OnChanges, DoCheck {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);

  @Input() open = false;
  @Input() editando: Producto | null = null;
  @Input() categorias: Categoria[] = [];
  @Input() sitios: Sitio[] = [];
  @Input() productosExistentes: Producto[] = [];
  /** Bodega ya elegida por el llamador (Mi Bodega) — oculta el selector y se usa como `id_sitio` al crear. */
  @Input() sitioFijo: string | null = null;

  @Output() closed = new EventEmitter<void>();
  /** Se emite tras guardar con éxito — el padre cierra y recarga su lista. */
  @Output() guardado = new EventEmitter<void>();

  saving = false;
  error: string | null = null;
  form: Record<string, any> = {};

  opcionesTipoMaterial = OPCIONES_TIPO_MATERIAL;
  opcionesUnidadPeso = OPCIONES_UNIDAD_PESO;

  // Arrow function (no método de clase) para que `this` quede atado al
  // componente al pasarla como [loadOptions] — <app-ss> la invoca directo,
  // sin bind.
  buscarUnspsc = async (q: string): Promise<OpcionSelect[]> => {
    const resultados = await this.api.buscarUnspsc(q);
    return resultados.map((u) => ({ label: `${u.codigo} - ${u.nombre}`, value: u.codigo }));
  };

  /** SKU se oculta del todo cuando el UNSPSC elegido es de gastronomía (empieza en '50'). */
  esGastronomia(): boolean {
    return !!this.form['codigo_unspsc']?.startsWith('50');
  }

  /** El SKU identifica el producto; gastronomía conserva la excepción histórica. */
  mostrarSku(): boolean {
    return !this.esGastronomia();
  }

  esPerecedero(): boolean {
    return this.form['tipo_material'] === 'PERECEDERO';
  }

  esBulto(): boolean {
    return this.form['unidad_medida'] === 'BULTO' || this.form['unidad_medida'] === 'PAQUETE';
  }

  get opcionesCategoria(): OpcionSelect[] {
    return this.categorias.map((c) => ({ label: c.nombre, value: c.id_categoria }));
  }

  get opcionesSitio(): OpcionSelect[] {
    // Una bodega inactiva no acepta productos/ítems nuevos (ver plan
    // 2026-09-18) — se excluye del selector, salvo que sea la bodega YA
    // guardada del producto que se está editando (si no, el selector
    // quedaría en blanco al abrir el modal).
    const actual: string | undefined = this.form['id_sitio'];
    const activos = this.sitios.filter((s) => s.estado || s.id_sitio === actual);
    return activos.map((s) => ({ label: s.nombre, value: s.id_sitio }));
  }

  /** La bodega elegida (nueva o ya guardada) está inactiva — el backend
   *  rechazaría el guardado igual, así que se deshabilita acá directo (ver
   *  plan 2026-09-18). */
  get bodegaSeleccionadaInactiva(): boolean {
    const id: string | undefined = this.form['id_sitio'];
    if (!id) return false;
    return this.sitios.find((s) => s.id_sitio === id)?.estado === false;
  }

  /**
   * Unidades ofrecidas según la familia UNSPSC elegida (primeros 4 dígitos)
   * — ver UNIDADES_POR_FAMILIA. Si el producto ya tiene guardada una unidad
   * que la lista de su familia no contempla (dato viejo, o la familia
   * todavía no cubre ese caso), se antepone igual: <app-ss> en modo local
   * (sin `loadOptions`) no puede mostrar un valor que no está entre sus
   * opciones — sin esto, el selector se veía VACÍO al editar ese producto,
   * aunque el dato real siguiera ahí (bug real, 2026-09-17).
   */
  opcionesUnidadMedida(): OpcionSelect[] {
    const familia = (this.form['codigo_unspsc'] ?? '').slice(0, 4);
    const unidades = UNIDADES_POR_FAMILIA[familia] ?? TODAS_LAS_UNIDADES;
    const actual: string | undefined = this.form['unidad_medida'];
    const lista = actual && !unidades.includes(actual) ? [actual, ...unidades] : unidades;
    return lista.map((u) => ({ label: u, value: u }));
  }

  /** Estado del auto-fill de SKU al crear — ver docblock de la clase. */
  private skuEsAuto = true;
  private ultimoNombreVisto = '';
  private ultimaMarcaVista = '';
  private ultimoModeloVisto = '';
  private ultimoSkuAuto = '';

  /**
   * Pulido: al crear (no al editar), el SKU se previsualiza a partir de
   * nombre, marca y modelo (`NOM-MAR-MODELO-0001`). El backend asigna el
   * consecutivo definitivo; el valor se puede reemplazar a mano. Se
   * implementa con `ngDoCheck` comparando campos contra el último valor
   * visto, porque el template muta `form` por referencia en cada keystroke.
   */
  ngDoCheck(): void {
    if (!this.open || this.editando) return;
    const nombreActual: string = this.form['nombre'] ?? '';
    const marcaActual: string = this.form['marca'] ?? '';
    const modeloActual: string = this.form['modelo'] ?? '';
    const skuActual: string = this.form['SKU'] ?? '';

    // Si el SKU visible no coincide con el último que autogeneré, alguien lo tocó a mano.
    if (skuActual !== this.ultimoSkuAuto) {
      this.skuEsAuto = !skuActual.trim(); // vacío → vuelve al auto-fill; con texto → deja de autogenerar
    }

    if (this.skuEsAuto && (
      nombreActual !== this.ultimoNombreVisto
      || marcaActual !== this.ultimaMarcaVista
      || modeloActual !== this.ultimoModeloVisto
    )) {
      this.ultimoNombreVisto = nombreActual;
      this.ultimaMarcaVista = marcaActual;
      this.ultimoModeloVisto = modeloActual;
      const nuevoSku = this.generarSku(nombreActual, marcaActual, modeloActual);
      this.form['SKU'] = nuevoSku;
      this.ultimoSkuAuto = nuevoSku;
    }
  }

  /** Vista previa del SKU; el backend calcula el consecutivo definitivo. */
  private generarSku(nombre: string, marca: string, modelo: string): string {
    const abreviar = (valor: string, fallback: string) => {
      const palabras = valor.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().match(/[A-Z0-9]+/g) ?? [];
      if (palabras.length === 0) return fallback;
      return (palabras.length === 1 ? palabras[0] : palabras.map((p) => p[0]).join('')).slice(0, 3);
    };
    if (!nombre.trim()) return '';
    const modeloNormalizado = modelo.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || 'NA';
    const base = `${abreviar(nombre, 'MAT')}-${abreviar(marca, 'NA')}-${modeloNormalizado}`;
    const nums = this.productosExistentes
      .map((p) => {
        const sku = (p.SKU ?? '').toUpperCase();
        if (!sku.startsWith(base + '-')) return NaN;
        return parseInt(sku.split('-').pop() ?? '', 10);
      })
      .filter((n) => !isNaN(n) && n > 0);
    const siguiente = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `${base}-${String(siguiente).padStart(4, '0')}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open'] && !changes['editando']) return;
    if (!this.open) return;
    this.error = null;
    this.skuEsAuto = true;
    this.ultimoNombreVisto = '';
    this.ultimaMarcaVista = '';
    this.ultimoModeloVisto = '';
    this.ultimoSkuAuto = '';

    if (this.editando) {
      const p = this.editando;
      this.form = {
        nombre: p.nombre,
        descripcion: p.descripcion ?? '',
        codigo_unspsc: p.codigo_unspsc ?? '',
        SKU: p.SKU ?? '',
        marca: p.marca ?? '',
        modelo: p.modelo ?? '',
        tipo_material: p.tipo_material,
        usa_placa_sena: p.usa_placa_sena ?? true,
        unidad_medida: p.unidad_medida,
        unidad_peso_bulto: p.unidad_peso_bulto ?? '',
        peso_por_bulto: p.peso_por_bulto ?? '',
        id_categoria: p.id_categoria,
        id_sitio: p.id_sitio ?? '',
        stock_minimo: p.stock_minimo,
      };
    } else {
      this.form = {
        nombre: '', descripcion: '', codigo_unspsc: '', SKU: '', marca: '', modelo: '',
        tipo_material: 'CONSUMO', unidad_medida: '', usa_placa_sena: true,
        unidad_peso_bulto: '', peso_por_bulto: '',
        id_categoria: this.categorias[0]?.id_categoria ?? '',
        // Bodega por defecto: fija si el llamador ya trabaja en una sola (Mi
        // Bodega); si no, opcional y arranca vacía.
        id_sitio: this.sitioFijo ?? '',
        cantidad: 1, stock_minimo: 1,
      };
    }
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
          SKU: this.skuEsAuto ? undefined : form['SKU'] || undefined,
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
          // El SKU queda en el producto; cada unidad física necesita su placa.
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
      this.guardado.emit();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo guardar el producto.';
    } finally {
      this.saving = false;
    }
  }
}
