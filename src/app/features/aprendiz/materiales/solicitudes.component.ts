import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { MaterialesApiService, Producto, Sitio, Solicitud } from '../../../core/services/materiales/materiales-api.service';

/**
 * Solicitudes de préstamo para aprendiz: crear + ver propias + confirmar
 * recepción. El backend ya filtra `GET /solicitudes` por dueño para quien
 * no es admin ni responsable (`SolicitudesService.obtenerSolicitudes`), así
 * que acá no se filtra nada client-side — la lista ya viene siendo "mis
 * solicitudes". Sin aprobar/rechazar/entregar: esas acciones son de
 * admin/responsable de bodega.
 *
 * Crear (Ronda 4, Fase 7): flujo de 2 pasos Bodega → Producto, con fecha de
 * devolución solo si aplica — ver docblock de la versión admin. Esta
 * versión nunca había pedido `fecha_devolucion` (omitida desde que se
 * construyó este componente, Ronda 3) — se agrega acá de una, ya que el
 * aprendiz es justo quien más necesita declarar cuándo lo devuelve.
 */
@Component({
  selector: 'app-aprendiz-materiales-solicitudes',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Mis solicitudes</h1>
        <button (click)="nuevo()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Nueva solicitud
        </button>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (solicitudes.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No tenés solicitudes registradas</p>
      } @else {
        <div class="overflow-x-auto rounded-xl border border-gray-100">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left font-medium">Producto</th>
                <th class="px-4 py-3 text-left font-medium">Cantidad</th>
                <th class="px-4 py-3 text-left font-medium">Estado</th>
                <th class="px-4 py-3 text-left font-medium">Fecha</th>
                <th class="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (s of solicitudes; track s.id_solicitud) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ s.producto?.nombre ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-700">{{ s.cantidad }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs"
                      [class.bg-amber-100]="s.estado === 'PENDIENTE'" [class.text-amber-700]="s.estado === 'PENDIENTE'"
                      [class.bg-blue-100]="s.estado === 'APROBADA' || s.estado === 'EN_ENTREGA'" [class.text-blue-700]="s.estado === 'APROBADA' || s.estado === 'EN_ENTREGA'"
                      [class.bg-green-100]="s.estado === 'ENTREGADA'" [class.text-green-700]="s.estado === 'ENTREGADA'"
                      [class.bg-red-100]="s.estado === 'RECHAZADA'" [class.text-red-700]="s.estado === 'RECHAZADA'">
                      {{ s.estado }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ s.fecha | date: 'short' }}</td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-1.5">
                      <button (click)="verDetalle(s)" class="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors">Ver</button>
                      @if (s.estado === 'EN_ENTREGA' && esSolicitantePropio(s)) {
                        <button (click)="confirmarRecepcion(s)"
                          class="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                          Confirmar recepción
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (modalOpen) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarModal()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Nueva solicitud</h2>
            <button (click)="cerrarModal()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Bodega</label>
              <select [(ngModel)]="idSitioSeleccionado" (ngModelChange)="onSitioChange($event)"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                <option [ngValue]="null">— Selecciona una bodega —</option>
                @for (s of sitios; track s.id_sitio) {
                  <option [value]="s.id_sitio">{{ s.nombre }} ({{ s.tipo }})</option>
                }
              </select>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Producto</label>
              <select [(ngModel)]="form['id_producto']" (ngModelChange)="onProductoChange($event)"
                [disabled]="!idSitioSeleccionado"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900] disabled:bg-gray-50 disabled:text-gray-400">
                @if (!idSitioSeleccionado) {
                  <option value="">Elegí primero una bodega</option>
                } @else if (productosFiltrados().length === 0) {
                  <option value="">Sin productos en esta bodega</option>
                } @else {
                  <option value="">— Selecciona —</option>
                  @for (p of productosFiltrados(); track p.id_producto) {
                    <option [value]="p.id_producto">{{ p.nombre }}</option>
                  }
                }
              </select>
            </div>

            @if (form['id_producto']) {
            <!-- Panel de stock: mismo criterio que el módulo hermano SGM (frontend-proyecto) -->
            <div class="rounded-lg border px-3 py-2 text-xs"
              [class.border-gray-100]="stock.cargando"
              [class.bg-gray-50]="stock.cargando"
              [class.border-red-200]="!stock.cargando && stock.disponibles === 0"
              [class.bg-red-50]="!stock.cargando && stock.disponibles === 0"
              [class.border-green-200]="!stock.cargando && stock.disponibles > 0"
              [class.bg-green-50]="!stock.cargando && stock.disponibles > 0">
              @if (stock.cargando) {
                <span class="text-gray-400">Consultando stock...</span>
              } @else if (stock.disponibles === 0) {
                <span class="text-red-600 font-medium">Sin unidades disponibles ({{ stock.total }} en total, todas prestadas/de baja)</span>
              } @else {
                <span class="text-green-700 font-medium">{{ stock.disponibles }} disponible(s)</span>
                <span class="text-gray-500"> de {{ stock.total }} unidad(es) totales</span>
              }
            </div>
            @if (!stock.cargando && form['cantidad'] > stock.disponibles) {
              <p class="text-red-500 text-xs -mt-1">No podés pedir más de las {{ stock.disponibles }} unidad(es) disponibles.</p>
            }

            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Cantidad</label>
              <input type="number" [(ngModel)]="form['cantidad']" min="1" [max]="stock.disponibles || 1"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
            </div>

            @if (requiereFechaDevolucion()) {
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Fecha de devolución <span class="text-red-500">*</span></label>
                <input type="date" [(ngModel)]="form['fecha_devolucion']"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
              </div>
            }
            }
          </div>

          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button (click)="cerrarModal()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardar()" [disabled]="saving || !puedeGuardar()"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ saving ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (detalleAbierto && detalle) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="detalleAbierto = false">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Detalle de la solicitud</h2>
            <button (click)="detalleAbierto = false" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <dl class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Producto</dt><dd class="text-gray-800 font-medium text-right">{{ detalle.producto?.nombre ?? '—' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Cantidad</dt><dd class="text-gray-800 text-right">{{ detalle.cantidad }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Estado</dt><dd class="text-gray-800 text-right">{{ detalle.estado }}</dd></div>
            <div><dt class="text-gray-500 mb-1">Observación</dt><dd class="text-gray-800">{{ detalle.observacion || '—' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Fecha</dt><dd class="text-gray-800 text-right">{{ detalle.fecha | date: 'medium' }}</dd></div>
            @if (detalle.fecha_devolucion) {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">Fecha de devolución</dt><dd class="text-gray-800 text-right">{{ detalle.fecha_devolucion | date: 'mediumDate' }}</dd></div>
            }
          </dl>
          <div class="flex justify-end mt-6">
            <button (click)="detalleAbierto = false" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cerrar</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AprendizMaterialesSolicitudesComponent implements OnInit {
  solicitudes: Solicitud[] = [];
  productos: Producto[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;
  form: Record<string, any> = {};

  /** "Ver detalles" (Fase 9). */
  detalleAbierto = false;
  detalle: Solicitud | null = null;

  /** Bodega elegida en el paso 1 del modal — filtra `productos` antes de mostrar el paso 2 (Fase 7). */
  idSitioSeleccionado: string | null = null;

  /** Stock del producto elegido — consultado en vivo, mismo endpoint que ya usa el módulo hermano SGM. */
  stock: { disponibles: number; total: number; cargando: boolean } = { disponibles: 0, total: 0, cargando: false };

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  /**
   * El backend ya filtra `GET /solicitudes` a "mis solicitudes" para
   * aprendiz, así que esto siempre da `true` en la práctica — se agrega de
   * todos modos por consistencia con admin/instructor (Ronda 4 Fase 5), sin
   * cambio de comportamiento real acá.
   */
  esSolicitantePropio(s: Solicitud): boolean {
    return s.id_usuario === this.auth.user()?.id;
  }

  /** Productos disponibles en la bodega elegida — paso 2 del modal (Fase 7). */
  productosFiltrados(): Producto[] {
    if (!this.idSitioSeleccionado) return [];
    return this.productos.filter((p) => p.id_sitio === this.idSitioSeleccionado);
  }

  onSitioChange(idSitio: string | null): void {
    this.idSitioSeleccionado = idSitio;
    this.form['id_producto'] = '';
    this.form['fecha_devolucion'] = '';
    this.stock = { disponibles: 0, total: 0, cargando: false };
  }

  productoSeleccionado(): Producto | undefined {
    return this.productos.find((p) => p.id_producto === this.form['id_producto']);
  }

  /** Solo los materiales que realmente vuelven piden fecha de devolución — mismo criterio que SGM. */
  requiereFechaDevolucion(): boolean {
    const tipo = this.productoSeleccionado()?.tipo_material;
    return !!tipo && tipo !== 'CONSUMO' && tipo !== 'PERECEDERO';
  }

  async onProductoChange(idProducto: string): Promise<void> {
    const id = idProducto;
    if (!id) { this.stock = { disponibles: 0, total: 0, cargando: false }; return; }
    this.stock = { disponibles: 0, total: 0, cargando: true };
    try {
      const { disponibles, total } = await this.api.stockProducto(id);
      this.stock = { disponibles, total, cargando: false };
    } catch {
      this.stock = { disponibles: 0, total: 0, cargando: false };
    }
  }

  puedeGuardar(): boolean {
    const cantidad = Number(this.form['cantidad']) || 0;
    const stockOk = !!this.form['id_producto'] && cantidad >= 1 && !this.stock.cargando &&
      this.stock.disponibles > 0 && cantidad <= this.stock.disponibles;
    if (!stockOk) return false;
    return !this.requiereFechaDevolucion() || !!this.form['fecha_devolucion'];
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [solicitudes, productos, sitios] = await Promise.all([
        this.api.listarSolicitudes(),
        this.api.listarProductos(),
        this.api.listarSitios(),
      ]);
      this.solicitudes = solicitudes;
      this.productos = productos;
      this.sitios = sitios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las solicitudes.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (this.productos.length === 0 || this.sitios.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos un producto y un sitio para crear una solicitud.');
      return;
    }
    this.idSitioSeleccionado = null;
    this.form = { id_producto: '', cantidad: 1, fecha_devolucion: '' };
    this.stock = { disponibles: 0, total: 0, cargando: false };
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  verDetalle(s: Solicitud): void {
    this.detalle = s;
    this.detalleAbierto = true;
  }

  async guardar(): Promise<void> {
    // Doble chequeo — no alcanza con deshabilitar el botón, ver Fase 1 del plan.
    if (!this.puedeGuardar()) {
      if (this.stock.disponibles === 0) {
        this.error = 'Ese producto no tiene unidades disponibles.';
      } else if (Number(this.form['cantidad']) > this.stock.disponibles) {
        this.error = 'La cantidad supera el stock disponible.';
      } else if (this.requiereFechaDevolucion() && !this.form['fecha_devolucion']) {
        this.error = 'Este producto requiere fecha de devolución.';
      } else {
        this.error = 'Completá los datos requeridos.';
      }
      return;
    }
    this.saving = true;
    this.error = null;
    try {
      await this.api.crearSolicitud({
        tipo: 'PRESTAMO',
        id_producto: this.form['id_producto'],
        cantidad: Number(this.form['cantidad']) || 1,
        fecha_devolucion: this.form['fecha_devolucion'] || undefined,
      });
      this.toast.ok('Solicitud creada');
      this.modalOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo crear la solicitud.';
    } finally {
      this.saving = false;
    }
  }

  async confirmarRecepcion(s: Solicitud): Promise<void> {
    try {
      await this.api.confirmarRecepcionSolicitud(s.id_solicitud);
      this.toast.ok('Recepción confirmada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo confirmar la recepción.');
    }
  }
}
