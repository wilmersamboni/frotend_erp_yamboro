import { Component, DoCheck, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import { OpcionSelect } from '../../tenant-administration/services/admin.service';
import { ToastService, mensajeDeError } from '../../../core/services/toast.service';
import { Categoria, MaterialesApiService, Producto } from '../data-access/materiales-api.service';
import { DialogDirective } from '../../../shared/directives/dialog.directive';

/** Minúsculas, sin tildes ni signos — mismo criterio que `normalizarFicha` del backend. */
export function normalizarFicha(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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
 * Catálogo único por centro (2026-10-02): el formulario edita la FICHA del
 * producto (nombre, UNSPSC obligatorio, unidad, categoría…), que no tiene
 * bodega ni cantidad. Las unidades las agrega cada bodega después con
 * `<app-agregar-existencias-modal>`. Antes acá se elegía una "bodega por
 * defecto" y la cantidad de ítems, y cada bodega terminaba creando su propia
 * copia del mismo producto.
 */
@Component({
  selector: 'app-producto-form-modal',
  standalone: true,
  imports: [DialogDirective, FormsModule, SearchableSelectComponent],
  template: `
    @if (open) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="closed.emit()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
            <div>
              <h2 class="text-lg font-bold text-gray-800">{{ editando ? 'Editar ficha del producto' : 'Nueva ficha de producto' }}</h2>
              <p class="text-xs text-gray-400 mt-0.5">Catálogo único del centro: la misma ficha la usan todas las bodegas.</p>
            </div>
            <button aria-label="Cerrar" (click)="closed.emit()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="producto-form-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6">
            <div class="space-y-4">
            <!-- Tipo de material: pills de color, primera decisión del form.
                 Inmutable al editar (M4): cambiar el tipo dejaba ítems/lotes huérfanos. -->
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1.5">Tipo de material <span class="text-red-500">*</span></label>
              <div class="grid grid-cols-3 gap-2">
                @for (t of opcionesTipoMaterial; track t.value) {
                  <button type="button" data-dirty (click)="!editando && (form['tipo_material'] = t.value)"
                    [disabled]="!!editando"
                    class="px-2 py-2 rounded-lg border text-sm font-medium text-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    [class]="form['tipo_material'] === t.value ? t.clases : 'border-gray-200 text-gray-500 hover:bg-gray-50'">
                    {{ t.label }}
                  </button>
                }
              </div>
              @if (editando) {
                <p class="text-xs text-gray-400 mt-1">El tipo no se puede cambiar. Si está mal, desactivá el producto y creá otro.</p>
              }
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Nombre <span class="text-red-500">*</span></label>
              <input type="text" [(ngModel)]="form['nombre']" placeholder="Ej: Taladro percutor, Guantes de nitrilo…"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
              <!-- Antes de crear otra ficha: ¿ya existe en el catálogo? -->
              @if (!editando && similares().length) {
                <div class="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
                  <p class="text-xs font-medium text-amber-800 mb-1.5">Ya hay fichas parecidas en el catálogo. Si es la misma, usala en vez de crear otra:</p>
                  <ul class="space-y-1">
                    @for (p of similares(); track p.id_producto) {
                      <li class="flex items-center justify-between gap-2 rounded-md bg-white/80 px-2 py-1.5">
                        <span class="min-w-0 text-xs text-gray-700">
                          <span class="font-medium">{{ p.nombre }}</span>
                          @if (p.marca) { <span class="text-gray-400"> · {{ p.marca }}</span> }
                          <span class="text-gray-400"> · {{ p.codigo_unspsc || 'sin UNSPSC' }} · {{ p.unidad_medida }}</span>
                        </span>
                        <button type="button" (click)="usarExistente.emit(p)"
                          class="shrink-0 text-xs font-semibold text-[#2d8000] hover:underline">Usar esta</button>
                      </li>
                    }
                  </ul>
                </div>
              }
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
              <label class="block text-xs font-medium text-gray-600 mb-1">Código UNSPSC <span class="text-red-500">*</span></label>
              <app-ss [loadOptions]="buscarUnspsc" placeholder="Buscar código o nombre (ej: martillo, 27111602)…" [(ngModel)]="form['codigo_unspsc']"></app-ss>
              <p class="text-xs text-gray-400 mt-1">Clasificación oficial de Colombia Compra Eficiente. Agrupa las fichas para los reportes y la trazabilidad.</p>
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

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Stock mínimo</label>
              <input type="number" min="0" [(ngModel)]="form['stock_minimo']" placeholder="Ej: 5"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
            </div>

            @if (!editando) {
              <p class="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5">
                La ficha no pertenece a ninguna bodega. Después de crearla, cada bodega que tenga este producto
                lo agrega con <span class="font-medium text-gray-700">Agregar al inventario</span> y digita cuántas unidades tiene.
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

          @if (error) {
            <div class="text-red-600 text-xs mt-3 p-2 bg-red-50 rounded-lg flex items-center justify-between gap-2">
              <span>{{ error }}</span>
              @if (duplicado && duplicado.activo !== false) {
                <button type="button" (click)="usarExistente.emit(duplicado)"
                  class="shrink-0 font-semibold text-[#2d8000] hover:underline">Usar esa ficha</button>
              }
            </div>
          }
          </div>

          <div class="shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-gray-100 px-4 py-4 sm:px-6">
            <button (click)="closed.emit()" class="w-full sm:w-auto px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardar()" [disabled]="saving"
              [style.opacity]="saving ? 0.6 : 1"
              [style.cursor]="saving ? 'not-allowed' : 'pointer'"
              class="w-full sm:w-auto px-5 py-2 text-white text-sm font-medium rounded-lg transition-colors"
              style="background-color: var(--accent-brand)">
              {{ saving ? 'Guardando...' : (editando ? 'Guardar' : 'Crear ficha') }}
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
  @Input() productosExistentes: Producto[] = [];
  /** Datos con los que arranca una ficha NUEVA (ej. lo que pidió un encargado en "Pedir ficha"). */
  @Input() prefill: Partial<{ nombre: string; marca: string; modelo: string; tipo_material: string; unidad_medida: string; codigo_unspsc: string; descripcion: string }> | null = null;

  @Output() closed = new EventEmitter<void>();
  /**
   * Se emite tras guardar con éxito — el padre cierra y recarga su lista. Al
   * crear trae la ficha nueva, para que el padre ofrezca agregarle existencias.
   */
  @Output() guardado = new EventEmitter<Producto | null>();
  /** "Usar esta": la ficha ya existía; el padre abre "Agregar al inventario" con ella. */
  @Output() usarExistente = new EventEmitter<Producto>();

  saving = false;
  error: string | null = null;
  form: Record<string, any> = {};
  /** Fichas de TODO el catálogo (sin recorte por bodega), para avisar de parecidas al crear. */
  private catalogo: Producto[] = [];
  /** Ficha que el backend reportó como duplicada (409), para ofrecer usarla. */
  duplicado: Producto | null = null;

  /**
   * Hasta 3 fichas del catálogo cuyo nombre contiene lo escrito (o al revés),
   * sin tildes ni mayúsculas. Desde 3 letras, para no sugerir de todo.
   */
  similares(): Producto[] {
    const q = normalizarFicha(this.form['nombre']);
    if (q.length < 3) return [];
    return this.catalogo
      .filter((p) => {
        const n = normalizarFicha(p.nombre);
        return n.includes(q) || q.includes(n);
      })
      .slice(0, 3);
  }

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
    this.duplicado = null;
    if (!this.editando) void this.cargarCatalogo();
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
        stock_minimo: p.stock_minimo,
      };
    } else {
      this.form = {
        nombre: '', descripcion: '', codigo_unspsc: '', SKU: '', marca: '', modelo: '',
        tipo_material: 'CONSUMO', unidad_medida: '', usa_placa_sena: true,
        unidad_peso_bulto: '', peso_por_bulto: '',
        id_categoria: this.categorias[0]?.id_categoria ?? '',
        stock_minimo: 1,
      };
      for (const [k, v] of Object.entries(this.prefill ?? {})) {
        if (v) this.form[k] = v;
      }
    }
  }

  /** Best-effort: si falla, simplemente no hay sugerencias (el backend igual rechaza el duplicado). */
  private async cargarCatalogo(): Promise<void> {
    try {
      this.catalogo = await this.api.catalogoProductos();
    } catch {
      this.catalogo = this.productosExistentes;
    }
  }

  async guardar(): Promise<void> {
    const form = this.form;
    if (!form['nombre']?.trim()) {
      this.error = 'El nombre es obligatorio.';
      return;
    }
    // Obligatorio al crear; al editar una ficha vieja sin código se permite
    // guardar igual (el backend solo valida el código si cambia).
    if (!this.editando && !form['codigo_unspsc']?.trim()) {
      this.error = 'El código UNSPSC es obligatorio.';
      return;
    }
    if (!form['unidad_medida']?.trim()) {
      this.error = 'La unidad de medida es obligatoria.';
      return;
    }
    // `min="0"` del <input> solo marca el campo: no impide teclear un negativo ni bloquea Guardar.
    const stockMinimo = Number(form['stock_minimo']);
    if (!Number.isInteger(stockMinimo) || stockMinimo < 0) {
      this.error = 'El stock mínimo debe ser un número entero de 0 en adelante.';
      return;
    }
    this.saving = true;
    this.error = null;
    this.duplicado = null;
    // Solo se mandan si el campo aplica y está visible — mismo criterio que SKU con gastronomía.
    // `fecha_vencimiento` ya NO se pide acá: vive en cada lote.
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
          stock_minimo: Number(form['stock_minimo']),
          ...camposCondicionales,
        });
        this.toast.ok('Ficha actualizada');
        this.guardado.emit(null);
      } else {
        // La ficha nace sin bodega y sin stock: las unidades se agregan
        // después desde la bodega ("Agregar al inventario").
        const { producto } = await this.api.crearProducto({
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
          cantidad: 0,
          stock_minimo: Number(form['stock_minimo']),
          ...camposCondicionales,
        });
        this.toast.ok('Ficha creada en el catálogo');
        this.guardado.emit(producto);
      }
    } catch (e: any) {
      this.error = mensajeDeError(e, 'No se pudo guardar el producto.');
      // 409 = ya existe una ficha igual: el backend la devuelve para ofrecer usarla.
      const data = e?.status === 409 ? e?.error?.data : null;
      if (data?.id_producto) {
        this.duplicado =
          this.catalogo.find((p) => p.id_producto === data.id_producto) ??
          ({ id_producto: data.id_producto, nombre: data.nombre, activo: data.activo } as Producto);
      }
    } finally {
      this.saving = false;
    }
  }
}
