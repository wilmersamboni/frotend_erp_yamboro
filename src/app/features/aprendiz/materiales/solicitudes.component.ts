import { Component, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  MaterialesApiService,
  Lote,
  Producto,
  Sitio,
  Solicitud,
} from '../../../core/services/materiales/materiales-api.service';

/**
 * Solicitudes de préstamo para aprendiz: crear + ver propias + confirmar
 * recepción. El backend ya filtra `GET /solicitudes` por dueño para quien
 * no es admin ni responsable (`SolicitudesService.obtenerSolicitudes`), así
 * que acá no se filtra nada client-side.
 *
 * Multi-línea (Tier SigMat M4): el modal "Nueva solicitud" arma N líneas,
 * cada una de un PRODUCTO devolutivo o de un LOTE consumible, todas de la
 * misma bodega (el backend rechaza con 400 si se mezclan bodegas). El body
 * legacy de 1 línea sigue soportado — acá siempre mandamos `lineas[]`.
 */

interface LineaForm {
  /** `p:<id>` para producto devolutivo, `l:<id>` para lote consumible. */
  ref: string;
  cantidad: number;
}

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
                <th class="px-4 py-3 text-left font-medium">Solicitud</th>
                <th class="px-4 py-3 text-left font-medium">Ítems</th>
                <th class="px-4 py-3 text-left font-medium">Estado</th>
                <th class="px-4 py-3 text-left font-medium">Fecha</th>
                <th class="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
              @for (s of solicitudes; track s.id_solicitud) {
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ s.producto?.nombre ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ s.cantidad }} unidad(es)</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs"
                      [class.bg-amber-100]="s.estado === 'PENDIENTE'" [class.text-amber-700]="s.estado === 'PENDIENTE'"
                      [class.bg-blue-100]="s.estado === 'APROBADA' || s.estado === 'EN_ENTREGA'" [class.text-blue-700]="s.estado === 'APROBADA' || s.estado === 'EN_ENTREGA'"
                      [class.bg-green-100]="s.estado === 'ENTREGADA'" [class.text-green-700]="s.estado === 'ENTREGADA'"
                      [class.bg-gray-100]="s.estado === 'DEVUELTA' || s.estado === 'CANCELADA'" [class.text-gray-600]="s.estado === 'DEVUELTA' || s.estado === 'CANCELADA'"
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
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Nueva solicitud</h2>
            <button (click)="cerrarModal()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-4">
            @if (pasoBodega) {
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Bodega</label>
                <select [(ngModel)]="idSitioSeleccionado" (ngModelChange)="onSitioChange($event)"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                  <option [ngValue]="null">— Selecciona una bodega —</option>
                  @for (s of sitios; track s.id_sitio) {
                    <option [ngValue]="s.id_sitio">{{ s.nombre }} ({{ s.tipo }})</option>
                  }
                </select>
                <p class="text-[11px] text-gray-400 mt-1">Todas las líneas de una solicitud tienen que ser de la misma bodega.</p>
              </div>
            }

            @if (!pasoBodega || idSitioSeleccionado) {
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="block text-xs font-medium text-gray-600">Ítems a solicitar</label>
                  <button type="button" (click)="agregarLinea()"
                    [disabled]="opcionesDisponibles().length === 0"
                    class="text-xs font-medium text-[#39A900] hover:underline disabled:text-gray-300 disabled:no-underline">
                    + Agregar línea
                  </button>
                </div>

                @if (opciones().length === 0) {
                  <p class="text-xs text-gray-400 py-2">Esta bodega no tiene productos ni lotes disponibles.</p>
                }

                <div class="space-y-2">
                  @for (linea of lineas; track $index) {
                    <div class="flex gap-2 items-start">
                      <div class="flex-1">
                        <select [(ngModel)]="linea.ref" (ngModelChange)="onRefChange(linea)"
                          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                          <option value="">— Selecciona producto o lote —</option>
                          @for (o of opcionesParaLinea(linea); track o.ref) {
                            <option [value]="o.ref">{{ o.label }}</option>
                          }
                        </select>
                        @if (linea.ref) {
                          <p class="text-[11px] mt-0.5"
                            [class.text-red-500]="disponibleDe(linea) < linea.cantidad"
                            [class.text-gray-400]="disponibleDe(linea) >= linea.cantidad">
                            {{ disponibleDe(linea) }} disponible(s){{ disponibleDe(linea) < linea.cantidad ? ' — cantidad excede el stock' : '' }}
                          </p>
                        }
                      </div>
                      <input type="number" [(ngModel)]="linea.cantidad" min="1"
                        class="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                      <button type="button" (click)="quitarLinea($index)"
                        class="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 text-lg leading-none">×</button>
                    </div>
                  }
                </div>
              </div>

              @if (requiereFechaDevolucion()) {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Fecha de devolución <span class="text-red-500">*</span></label>
                  <input type="date" [(ngModel)]="fechaDevolucion"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                  <p class="text-[11px] text-gray-400 mt-1">Alguna línea es de un material devolutivo.</p>
                </div>
              }

              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Observación</label>
                <textarea [(ngModel)]="observacion" rows="2"
                  class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"></textarea>
              </div>
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
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Estado</dt><dd class="text-gray-800 text-right">{{ detalle.estado }}</dd></div>
            <div>
              <dt class="text-gray-500 mb-1">Ítems solicitados</dt>
              <dd>
                @if (detalleCargando) {
                  <span class="text-gray-400 text-xs">Cargando líneas...</span>
                } @else if (detalle.lineas?.length) {
                  <ul class="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                    @for (l of detalle.lineas; track l.id_detalle) {
                      <li class="px-3 py-2 flex justify-between gap-3">
                        <span class="text-gray-700">
                          {{ l.producto_nombre ?? l.lote_codigo ?? '—' }}
                          @if (l.id_lote) { <span class="text-[11px] text-gray-400">(lote)</span> }
                        </span>
                        <span class="text-gray-500 text-xs">{{ l.cantidad_entregada }}/{{ l.cantidad }}</span>
                      </li>
                    }
                  </ul>
                } @else {
                  <span class="text-gray-700">{{ detalle.producto?.nombre ?? '—' }} × {{ detalle.cantidad }}</span>
                }
              </dd>
            </div>
            <div><dt class="text-gray-500 mb-1">Observación</dt><dd class="text-gray-800">{{ detalle.observacion || '—' }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-500">Fecha</dt><dd class="text-gray-800 text-right">{{ detalle.fecha | date: 'medium' }}</dd></div>
            @if (detalle.fecha_devolucion) {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">Fecha de devolución</dt><dd class="text-gray-800 text-right">{{ detalle.fecha_devolucion | date: 'mediumDate' }}</dd></div>
            }
            @if (detalle.fecha_aprobacion) {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">Aprobada</dt><dd class="text-gray-800 text-right">{{ detalle.fecha_aprobacion | date: 'short' }}</dd></div>
            }
            @if (detalle.fecha_entrega) {
              <div class="flex justify-between gap-4"><dt class="text-gray-500">Entregada</dt><dd class="text-gray-800 text-right">{{ detalle.fecha_entrega | date: 'short' }}</dd></div>
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
  lotes: Lote[] = [];
  sitios: Sitio[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  modalOpen = false;

  /** Líneas del modal — al menos 1. */
  lineas: LineaForm[] = [];
  observacion = '';
  fechaDevolucion = '';

  detalleAbierto = false;
  detalle: Solicitud | null = null;
  detalleCargando = false;

  /** Bodega elegida en el paso 1 del modal. */
  idSitioSeleccionado: string | null = null;

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  esSolicitantePropio(s: Solicitud): boolean {
    return s.id_usuario === this.auth.user()?.id;
  }

  /** ¿Se muestra el paso "Bodega"? Solo si tenemos el catálogo de sitios. */
  get pasoBodega(): boolean {
    return this.sitios.length > 0;
  }

  // ── Opciones de línea (productos devolutivos + lotes consumibles) ─────

  private productosDeBodega(): Producto[] {
    if (this.pasoBodega && this.idSitioSeleccionado) {
      return this.productos.filter((p) => p.id_sitio === this.idSitioSeleccionado);
    }
    return this.pasoBodega ? [] : this.productos;
  }

  private lotesDeBodega(): Lote[] {
    return this.lotes.filter(
      (l) =>
        l.estado === 'ACTIVO' &&
        l.cantidad_disponible > 0 &&
        (!this.pasoBodega || !this.idSitioSeleccionado || l.id_sitio === this.idSitioSeleccionado),
    );
  }

  /** Todas las opciones seleccionables en esta bodega (para saber si hay algo que pedir). */
  opciones(): { ref: string; label: string }[] {
    const prods = this.productosDeBodega().map((p) => ({
      ref: `p:${p.id_producto}`,
      label: `${p.nombre}${p.marca ? ' · ' + p.marca : ''}`,
    }));
    const lotes = this.lotesDeBodega().map((l) => ({
      ref: `l:${l.id_lote}`,
      label: `${l.producto?.nombre ?? 'Lote'}${l.codigo_lote ? ' · ' + l.codigo_lote : ''} (lote, ${l.cantidad_disponible})`,
    }));
    return [...prods, ...lotes];
  }

  /** Opciones que todavía no fueron elegidas en otra línea. */
  opcionesDisponibles(): { ref: string; label: string }[] {
    const usadas = new Set(this.lineas.map((l) => l.ref).filter(Boolean));
    return this.opciones().filter((o) => !usadas.has(o.ref));
  }

  /** Para el `<select>` de una línea: las libres + la que ya tiene elegida. */
  opcionesParaLinea(linea: LineaForm): { ref: string; label: string }[] {
    const usadasEnOtras = new Set(
      this.lineas.filter((l) => l !== linea).map((l) => l.ref).filter(Boolean),
    );
    return this.opciones().filter((o) => !usadasEnOtras.has(o.ref));
  }

  disponibleDe(linea: LineaForm): number {
    if (!linea.ref) return 0;
    const [tipo, id] = linea.ref.split(':');
    if (tipo === 'l') {
      return this.lotes.find((l) => l.id_lote === id)?.cantidad_disponible ?? 0;
    }
    // Producto devolutivo — usamos el stock ya cargado en el mapa.
    return this.stockProd[id]?.disponibles ?? 0;
  }

  /** Stock de productos devolutivos, cacheado por id (se consulta al elegirlo). */
  stockProd: Record<string, { disponibles: number; total: number }> = {};

  async onRefChange(linea: LineaForm): Promise<void> {
    if (!linea.ref) return;
    const [tipo, id] = linea.ref.split(':');
    if (tipo === 'p' && !this.stockProd[id]) {
      try {
        this.stockProd[id] = await this.api.stockProducto(id);
      } catch {
        this.stockProd[id] = { disponibles: 0, total: 0 };
      }
    }
  }

  onSitioChange(idSitio: string | null): void {
    this.idSitioSeleccionado = idSitio;
    this.lineas = idSitio || !this.pasoBodega ? [{ ref: '', cantidad: 1 }] : [];
    this.fechaDevolucion = '';
  }

  agregarLinea(): void {
    this.lineas.push({ ref: '', cantidad: 1 });
  }

  quitarLinea(i: number): void {
    this.lineas.splice(i, 1);
    if (this.lineas.length === 0) this.lineas.push({ ref: '', cantidad: 1 });
  }

  /** ¿Alguna línea es de un producto devolutivo (no CONSUMO/PERECEDERO)? */
  requiereFechaDevolucion(): boolean {
    return this.lineas.some((l) => {
      if (!l.ref.startsWith('p:')) return false;
      const p = this.productos.find((x) => x.id_producto === l.ref.slice(2));
      const tipo = p?.tipo_material;
      return !!tipo && tipo !== 'CONSUMO' && tipo !== 'PERECEDERO';
    });
  }

  puedeGuardar(): boolean {
    const activas = this.lineas.filter((l) => l.ref && Number(l.cantidad) >= 1);
    if (activas.length === 0) return false;
    for (const l of activas) {
      if (Number(l.cantidad) > this.disponibleDe(l)) return false;
    }
    if (this.requiereFechaDevolucion() && !this.fechaDevolucion) return false;
    return true;
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const verSitios = this.auth.tieneServicio('materiales.sitios.ver');
      const [solicitudes, productos, lotes, sitios] = await Promise.all([
        this.api.listarSolicitudes(),
        this.api.listarProductos().catch(() => [] as Producto[]),
        this.api.listarLotes().catch(() => [] as Lote[]),
        verSitios ? this.api.listarSitios().catch(() => [] as Sitio[]) : Promise.resolve([] as Sitio[]),
      ]);
      this.solicitudes = solicitudes;
      this.productos = productos;
      this.lotes = lotes;
      this.sitios = sitios;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las solicitudes.');
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    if (this.productos.length === 0 && this.lotes.length === 0) {
      this.toast.warn('Faltan datos', 'Necesitás al menos un producto o lote para crear una solicitud.');
      return;
    }
    this.idSitioSeleccionado = null;
    this.lineas = this.pasoBodega ? [] : [{ ref: '', cantidad: 1 }];
    this.observacion = '';
    this.fechaDevolucion = '';
    this.stockProd = {};
    this.error = null;
    this.modalOpen = true;
  }

  cerrarModal(): void {
    this.modalOpen = false;
  }

  async verDetalle(s: Solicitud): Promise<void> {
    this.detalle = s;
    this.detalleAbierto = true;
    this.detalleCargando = true;
    try {
      this.detalle = await this.api.obtenerSolicitud(s.id_solicitud);
    } catch {
      // nos quedamos con la fila de la lista
    } finally {
      this.detalleCargando = false;
    }
  }

  async guardar(): Promise<void> {
    if (!this.puedeGuardar()) {
      this.error = this.requiereFechaDevolucion() && !this.fechaDevolucion
        ? 'Alguna línea es devolutiva: indicá la fecha de devolución.'
        : 'Revisá las líneas: cada una necesita producto/lote y una cantidad dentro del stock.';
      return;
    }
    this.saving = true;
    this.error = null;
    try {
      const lineas = this.lineas
        .filter((l) => l.ref && Number(l.cantidad) >= 1)
        .map((l) => {
          const [tipo, id] = l.ref.split(':');
          return tipo === 'l'
            ? { id_lote: id, cantidad: Number(l.cantidad) }
            : { id_producto: id, cantidad: Number(l.cantidad) };
        });
      await this.api.crearSolicitud({
        tipo: 'PRESTAMO',
        lineas,
        observacion: this.observacion || undefined,
        fecha_devolucion: this.fechaDevolucion || undefined,
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
