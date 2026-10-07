import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { ToastService, mensajeDeError } from '../../../core/services/toast.service';
import { MaterialesApiService, Producto, Sitio, UnidadMedida } from '../data-access/materiales-api.service';
import { codigoLoteSugerido } from '../codigo-lote.util';

const ETIQUETA_TIPO: Record<string, { texto: string; clases: string }> = {
  CONSUMO: { texto: 'Consumo · se gasta', clases: 'bg-green-50 text-green-700 border-green-200' },
  DEVOLUTIVO: { texto: 'Devolutivo · se presta', clases: 'bg-blue-50 text-blue-700 border-blue-200' },
  PERECEDERO: { texto: 'Perecedero · se vence', clases: 'bg-amber-50 text-amber-700 border-amber-200' },
};

/** Hoy en hora local (AAAA-MM-DD) — `toISOString()` daría mañana después de las 7 pm en Colombia. */
function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * <app-agregar-existencias-modal> — "Agregar al inventario" (catálogo único,
 * 2026-10-02). La bodega elige una ficha del catálogo del centro y digita
 * cuántas unidades tiene:
 *  - DEVOLUTIVO → se generan N ítems DISPONIBLE en la bodega, con las placas
 *    SENA que se digiten (las que falten quedan listas para asignar después);
 *  - CONSUMO / PERECEDERO → un lote con esa cantidad (y vencimiento si es
 *    perecedero).
 * Si el producto no está en el catálogo, `crearFicha` le pide al padre abrir
 * el formulario de ficha nueva; al volver, el padre la pasa en `productoInicial`.
 */
@Component({
  selector: 'app-agregar-existencias-modal',
  standalone: true,
  imports: [DialogDirective, FormsModule, SearchableSelectComponent],
  template: `
    @if (open) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="closed.emit()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
            <div>
              <h2 class="text-lg font-bold text-gray-800">Agregar al inventario</h2>
              <p class="text-xs text-gray-400 mt-0.5">Elegí el producto del catálogo y digitá cuántas unidades tiene la bodega.</p>
            </div>
            <button aria-label="Cerrar" (click)="closed.emit()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6 space-y-4">
            <!-- Bodega -->
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Bodega <span class="text-red-500">*</span></label>
              @if (sitioFijo) {
                <div class="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700">{{ nombreSitio(sitioFijo) }}</div>
              } @else {
                <app-ss [options]="opcionesSitio" placeholder="— Selecciona la bodega —" [(ngModel)]="idSitio"></app-ss>
              }
            </div>

            <!-- Producto del catálogo -->
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Producto <span class="text-red-500">*</span></label>
              <app-ss [options]="opcionesProducto" [placeholder]="cargandoCatalogo ? 'Cargando catálogo…' : 'Buscar por nombre, marca o código UNSPSC…'"
                [ngModel]="idProducto" (ngModelChange)="elegirProducto($event)"></app-ss>
              @if (puedeCrearFicha) {
                <button type="button" (click)="crearFicha.emit()" class="mt-1.5 text-xs font-medium text-[#2d8000] hover:underline">
                  ¿No está en el catálogo? Crear ficha nueva
                </button>
              } @else if (!pidiendo) {
                <button type="button" (click)="abrirPedido()" class="mt-1.5 text-xs font-medium text-[#2d8000] hover:underline">
                  ¿No está en el catálogo? Pedir ficha nueva al líder
                </button>
              }
              @if (pidiendo) {
                <!-- Pedir ficha al líder: solo líderes de área / administrador crean fichas. -->
                <div class="mt-2 rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2.5">
                  <p class="text-xs text-gray-500">Tu líder de área recibe una notificación con estos datos; cuando cree la ficha te avisamos y la agregas aquí.</p>
                  <input type="text" [(ngModel)]="pedido.nombre" placeholder="Nombre del producto *"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                  <div class="grid grid-cols-2 gap-2">
                    <input type="text" [(ngModel)]="pedido.marca" placeholder="Marca"
                      class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                    <select [(ngModel)]="pedido.unidad_medida"
                      class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                      <option value="">Unidad…</option>
                      @for (u of unidades; track u.codigo) { <option [value]="u.codigo">{{ u.nombre }}</option> }
                    </select>
                  </div>
                  <div class="grid grid-cols-3 gap-1.5">
                    @for (t of tiposPedido; track t.value) {
                      <button type="button" (click)="pedido.tipo_material = t.value"
                        class="px-2 py-1.5 rounded-lg border text-xs font-medium"
                        [class]="pedido.tipo_material === t.value ? 'border-[#39A900] bg-[#39A900]/10 text-[#2d8000]' : 'border-gray-200 bg-white text-gray-500'">{{ t.label }}</button>
                    }
                  </div>
                  <textarea rows="2" [(ngModel)]="pedido.nota" placeholder="Nota para el líder (para qué es, cuántos llegaron…)"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"></textarea>
                  <div class="flex justify-end gap-2">
                    <button type="button" (click)="pidiendo = false" class="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
                    <button type="button" (click)="enviarPedido()" [disabled]="enviandoPedido || pedido.nombre.trim().length < 2"
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style="background-color: var(--accent-brand)">
                      {{ enviandoPedido ? 'Enviando…' : 'Enviar pedido' }}
                    </button>
                  </div>
                </div>
              }
            </div>

            @if (producto; as p) {
              <!-- Resumen de la ficha elegida -->
              <div class="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-gray-800 truncate">{{ p.nombre }}</p>
                    <p class="text-xs text-gray-500 mt-0.5">
                      {{ marcaModelo(p) }}
                    </p>
                  </div>
                  <span class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border" [class]="tipo(p).clases">{{ tipo(p).texto }}</span>
                </div>
                <dl class="grid grid-cols-3 gap-2 mt-2.5 text-xs">
                  <div><dt class="text-gray-400">UNSPSC</dt><dd class="text-gray-700 font-medium">{{ p.codigo_unspsc || '—' }}</dd></div>
                  <div><dt class="text-gray-400">Unidad</dt><dd class="text-gray-700 font-medium">{{ p.unidad_medida }}</dd></div>
                  <div><dt class="text-gray-400">Categoría</dt><dd class="text-gray-700 font-medium truncate">{{ p.categoria?.nombre || '—' }}</dd></div>
                </dl>
              </div>

              <!-- Cantidad -->
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">
                  {{ esDevolutivo ? 'Cantidad de unidades (ítems)' : 'Cantidad' }} <span class="text-red-500">*</span>
                </label>
                <div class="flex items-center rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-[#39A900]/30 focus-within:border-[#39A900]">
                  <input type="number" min="1" [max]="esDevolutivo ? 500 : null" [(ngModel)]="cantidad" placeholder="Ej: 12"
                    class="w-full px-3 py-2 rounded-l-lg text-sm focus:outline-none" />
                  <span class="px-3 text-xs text-gray-400 whitespace-nowrap">{{ p.unidad_medida }}</span>
                </div>
              </div>

              <!-- Stock mínimo POR BODEGA: la ficha es compartida y su mínimo no sirve igual para todas. -->
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Stock mínimo en esta bodega <span class="text-gray-400 font-normal">(opcional)</span></label>
                <input type="number" min="0" [(ngModel)]="minimoBodega" [placeholder]="'Si lo dejas vacío se usa el de la ficha: ' + p.stock_minimo"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                <p class="text-xs text-gray-400 mt-1">Cuando esta bodega quede por debajo, te avisamos «Stock bajo». Se cambia después en Mi Bodega → Mínimo.</p>
              </div>

              @if (esDevolutivo) {
                @if (p.usa_placa_sena !== false) {
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Placas SENA <span class="text-gray-400 font-normal">(opcional)</span></label>
                    <textarea rows="3" [(ngModel)]="placasTexto" placeholder="Una por línea o separadas por coma. Ej: 92110-0001, 92110-0002"
                      class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"></textarea>
                    <p class="text-xs mt-1" [class.text-red-500]="sobranPlacas" [class.text-gray-400]="!sobranPlacas">{{ resumenPlacas }}</p>
                  </div>
                } @else {
                  <p class="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5">Este producto no usa placa SENA: los ítems se identifican con el SKU de la ficha.</p>
                }
              } @else {
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Código del lote</label>
                    <input type="text" [(ngModel)]="codigoLote" maxlength="60" [placeholder]="'Automático: ' + sugerirCodigo(p.nombre)"
                      class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                    <p class="text-[11px] text-gray-400 mt-1">Déjalo vacío y se genera solo, o escribe el tuyo.</p>
                  </div>
                  @if (p.tipo_material === 'PERECEDERO') {
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Fecha de vencimiento <span class="text-red-500">*</span></label>
                      <input type="date" [min]="hoy" [(ngModel)]="fechaVencimiento"
                        class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                    </div>
                  }
                </div>
              }
            }

            @if (error) {
              <p class="text-red-600 text-xs p-2 bg-red-50 rounded-lg">{{ error }}</p>
            }
          </div>

          <div class="shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-gray-100 px-4 py-4 sm:px-6 mt-2">
            <button (click)="closed.emit()" class="w-full sm:w-auto px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardar()" [disabled]="saving || !producto"
              [style.opacity]="(saving || !producto) ? 0.6 : 1"
              [style.cursor]="(saving || !producto) ? 'not-allowed' : 'pointer'"
              class="w-full sm:w-auto px-5 py-2 text-white text-sm font-medium rounded-lg transition-colors"
              style="background-color: var(--accent-brand)">
              {{ saving ? 'Agregando…' : textoBoton }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AgregarExistenciasModalComponent implements OnChanges {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);

  @Input() open = false;
  /** Bodegas entre las que se puede elegir (las que el usuario gestiona). */
  @Input() sitios: Sitio[] = [];
  /** Bodega ya elegida por el llamador (Mi Bodega) — oculta el selector. */
  @Input() sitioFijo: string | null = null;
  /** Ficha preseleccionada (p. ej. recién creada, o "Usar esta" desde el formulario de ficha). */
  @Input() productoInicial: Producto | null = null;
  @Input() puedeCrearFicha = false;

  @Output() closed = new EventEmitter<void>();
  @Output() guardado = new EventEmitter<void>();
  @Output() crearFicha = new EventEmitter<void>();

  catalogo: Producto[] = [];
  cargandoCatalogo = false;
  idSitio = '';
  idProducto = '';
  cantidad: number | null = null;
  placasTexto = '';
  codigoLote = '';
  readonly sugerirCodigo = (nombre: string): string => codigoLoteSugerido(nombre);
  fechaVencimiento = '';
  saving = false;
  error: string | null = null;
  readonly hoy = hoyLocal();

  // ── Pedir ficha al líder (quien no puede crear fichas) ──
  readonly tiposPedido = [
    { value: 'DEVOLUTIVO', label: 'Devolutivo' },
    { value: 'CONSUMO', label: 'Consumo' },
    { value: 'PERECEDERO', label: 'Perecedero' },
  ];
  pidiendo = false;
  enviandoPedido = false;
  pedido = { nombre: '', marca: '', unidad_medida: '', tipo_material: 'DEVOLUTIVO', nota: '' };

  /** Unidades de la lista de la base (el pedido guarda el código). */
  unidades: UnidadMedida[] = [];

  abrirPedido(): void {
    this.pedido = { nombre: '', marca: '', unidad_medida: '', tipo_material: 'DEVOLUTIVO', nota: '' };
    this.pidiendo = true;
    if (!this.unidades.length) {
      void this.api.listarUnidadesMedida().then((u) => (this.unidades = u)).catch(() => (this.unidades = []));
    }
  }

  async enviarPedido(): Promise<void> {
    const nombre = this.pedido.nombre.trim();
    if (nombre.length < 2) return;
    this.enviandoPedido = true;
    this.error = null;
    try {
      await this.api.pedirFicha({
        nombre,
        marca: this.pedido.marca.trim() || undefined,
        unidad_medida: this.pedido.unidad_medida || undefined,
        tipo_material: this.pedido.tipo_material,
        nota: this.pedido.nota.trim() || undefined,
        id_sitio: this.sitioFijo ?? (this.idSitio || undefined),
      });
      this.toast.ok('Pedido enviado', 'Tu líder de área recibió la notificación. Te avisamos cuando la ficha esté creada.');
      this.pidiendo = false;
    } catch (e: any) {
      // 409: la ficha ya existe — se selecciona para que agregue sus unidades de una vez.
      const data = e?.status === 409 ? e?.error?.data : null;
      if (data?.id_producto && data.activo !== false) {
        if (!this.catalogo.some((p) => p.id_producto === data.id_producto)) await this.cargarCatalogo();
        this.elegirProducto(data.id_producto);
        this.pidiendo = false;
        this.toast.ok('Ya existe en el catálogo', `"${data.nombre}" ya estaba creada: quedó seleccionada.`);
      } else {
        this.error = mensajeDeError(e, 'No se pudo enviar el pedido.');
      }
    } finally {
      this.enviandoPedido = false;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.idSitio = this.sitioFijo ?? (this.opcionesSitio.length === 1 ? this.opcionesSitio[0].value : '');
      this.idProducto = this.productoInicial?.id_producto ?? '';
      this.pidiendo = false;
      this.limpiarCampos();
      void this.cargarCatalogo();
    } else if (changes['productoInicial'] && this.open && this.productoInicial) {
      this.idProducto = this.productoInicial.id_producto;
      void this.cargarCatalogo();
    }
  }

  /** Mínimo propio de la bodega para esta ficha (opcional; vacío = el de la ficha). */
  minimoBodega: number | null = null;

  private limpiarCampos(): void {
    this.minimoBodega = null;
    this.cantidad = null;
    this.placasTexto = '';
    this.codigoLote = '';
    this.fechaVencimiento = '';
    this.error = null;
  }

  private async cargarCatalogo(): Promise<void> {
    this.cargandoCatalogo = true;
    try {
      this.catalogo = await this.api.catalogoProductos();
      // Una ficha recién creada podría no haber llegado todavía: se agrega a mano.
      const ini = this.productoInicial;
      if (ini && !this.catalogo.some((p) => p.id_producto === ini.id_producto)) {
        this.catalogo = [ini, ...this.catalogo];
      }
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el catálogo de productos.');
    } finally {
      this.cargandoCatalogo = false;
    }
  }

  get opcionesSitio(): SSOption[] {
    // Una bodega inactiva no acepta existencias nuevas.
    return this.sitios.filter((s) => s.estado).map((s) => ({ label: s.nombre, value: s.id_sitio }));
  }

  get opcionesProducto(): SSOption[] {
    return this.catalogo.map((p) => ({
      value: p.id_producto,
      label: `${p.nombre}${p.marca ? ' · ' + p.marca : ''}${p.modelo ? ' ' + p.modelo : ''} — ${p.codigo_unspsc || 'sin UNSPSC'} (${p.unidad_medida})`,
    }));
  }

  get producto(): Producto | null {
    return this.catalogo.find((p) => p.id_producto === this.idProducto) ?? null;
  }

  get esDevolutivo(): boolean {
    return this.producto?.tipo_material === 'DEVOLUTIVO';
  }

  tipo(p: Producto) {
    return ETIQUETA_TIPO[p.tipo_material] ?? ETIQUETA_TIPO['CONSUMO'];
  }

  marcaModelo(p: Producto): string {
    return [p.marca, p.modelo].filter((v) => !!v).join(' · ') || 'Sin marca';
  }

  nombreSitio(id: string): string {
    return this.sitios.find((s) => s.id_sitio === id)?.nombre ?? 'Bodega seleccionada';
  }

  elegirProducto(id: string): void {
    if (id === this.idProducto) return;
    this.idProducto = id;
    this.limpiarCampos();
  }

  get placas(): string[] {
    return this.placasTexto.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  }

  get sobranPlacas(): boolean {
    return !!this.cantidad && this.placas.length > this.cantidad;
  }

  get resumenPlacas(): string {
    const n = this.placas.length;
    const c = Number(this.cantidad) || 0;
    if (!c) return 'Podés dejarlas para después: los ítems quedan listos para asignarles la placa.';
    if (n > c) return `Hay ${n} placas para ${c} ítem(s): sobran ${n - c}.`;
    if (n === 0) return `Los ${c} ítem(s) quedan listos para asignarles la placa SENA después.`;
    if (n === c) return `Las ${c} unidades quedan con su placa.`;
    return `${n} con placa · los otros ${c - n} quedan listos para asignarles la placa después.`;
  }

  get textoBoton(): string {
    const c = Number(this.cantidad) || 0;
    if (!this.producto || !c) return 'Agregar al inventario';
    return `Agregar ${c} ${this.esDevolutivo ? (c === 1 ? 'ítem' : 'ítems') : this.producto.unidad_medida.toLowerCase()}`;
  }

  async guardar(): Promise<void> {
    const p = this.producto;
    if (!p) return;
    const idSitio = this.sitioFijo ?? this.idSitio;
    const cantidad = Number(this.cantidad);
    if (!idSitio) { this.error = 'Elegí la bodega.'; return; }
    if (!Number.isInteger(cantidad) || cantidad < 1) { this.error = 'La cantidad debe ser un número entero de 1 en adelante.'; return; }
    if (this.esDevolutivo && cantidad > 500) { this.error = 'Se pueden agregar hasta 500 ítems por vez.'; return; }
    if (this.esDevolutivo && this.sobranPlacas) { this.error = this.resumenPlacas; return; }
    if (p.tipo_material === 'PERECEDERO' && !this.fechaVencimiento) { this.error = 'Un producto perecedero necesita la fecha de vencimiento.'; return; }

    this.saving = true;
    this.error = null;
    try {
      const placas = this.esDevolutivo ? this.placas : [];
      await this.api.agregarExistencias(p.id_producto, {
        id_sitio: idSitio,
        cantidad,
        placas_sena: placas.length ? placas : undefined,
        codigo_lote: !this.esDevolutivo && this.codigoLote.trim() ? this.codigoLote.trim() : undefined,
        fecha_vencimiento: p.tipo_material === 'PERECEDERO' ? this.fechaVencimiento : undefined,
      });
      // Mínimo de esta bodega, si lo escribió (no frena el ingreso si falla).
      if (this.minimoBodega !== null && `${this.minimoBodega}` !== '' && Number(this.minimoBodega) >= 0) {
        await this.api.fijarMinimoBodega(p.id_producto, idSitio, Math.trunc(Number(this.minimoBodega)))
          .catch(() => this.toast.warn('Mínimo no guardado', 'Las unidades se agregaron, pero no se pudo guardar el stock mínimo. Fíjalo en Mi Bodega → Mínimo.'));
      }
      const destino = this.nombreSitio(idSitio);
      if (this.esDevolutivo) {
        this.toast.ok('Agregado al inventario', `${cantidad} ítem(s) de "${p.nombre}" en ${destino}.`);
        const sinPlaca = cantidad - placas.length;
        if (p.usa_placa_sena !== false && sinPlaca > 0) {
          this.toast.warn('Falta la placa SENA', `${sinPlaca} ítem(s) quedaron listos para asignarles la placa (pestaña Ítems).`, 7000);
        }
      } else {
        this.toast.ok('Agregado al inventario', `${cantidad} ${p.unidad_medida.toLowerCase()} de "${p.nombre}" en ${destino}.`);
      }
      this.guardado.emit();
    } catch (e) {
      this.error = mensajeDeError(e, 'No se pudieron agregar las existencias.');
    } finally {
      this.saving = false;
    }
  }
}
