import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MaterialesLiveService } from '../../../core/services/realtime/materiales-live.service';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast.service';
import { StatusBadgeComponent } from '../../../shared/components/status-badge.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import {
  CreateDevolucionConsumibleDto,
  CreateDevolucionDto,
  Devolucion,
  EstadoDevolucion,
  Item,
  ItemPendienteDevolucion,
  LineaConsumiblePendiente,
  Lote,
  MaterialesApiService,
  Solicitud,
  Chequeo,
  ItemChequeo
} from '../../../core/services/materiales/materiales-api.service';

const ESTADOS_DEVOLUCION: { value: EstadoDevolucion; label: string; desc: string }[] = [
  { value: 'BUENO', label: 'Bueno', desc: 'Sin daños visibles' },
  { value: 'REGULAR', label: 'Regular', desc: 'Desgaste normal de uso' },
  { value: 'DAÑADO', label: 'Dañado', desc: 'Requiere reparación' },
  { value: 'PERDIDO', label: 'Perdido', desc: 'No fue devuelto' },
];

interface FilaDevolucion extends ItemPendienteDevolucion {
  estadoDev: EstadoDevolucion;
  /** M9 — ¿esta unidad volvió? Destildar = queda pendiente (devolución parcial). */
  volvio: boolean;
}

/**
 * Registro de devoluciones de material prestado (M10a — devolución por unidad).
 *
 * Un préstamo entrega N unidades; esta pantalla cierra la devolución de TODAS
 * las unidades pendientes de una sola vez: se elige un "estado general" que se
 * aplica a todas, y solo se toca fila por fila la placa de las 1-2 unidades que
 * vuelven en otro estado. El backend crea una fila `devolucion` por unidad,
 * restaura el stock (BUENO/REGULAR → DISPONIBLE, DAÑADO/PERDIDO → ese estado),
 * cierra la solicitud (→ DEVUELTA) y crea el `Chequeo` de auditoría cuando ya
 * volvieron todas las unidades. No hay botones de fila: es alta + listado.
 */
@Component({
  selector: 'app-materiales-devoluciones',
  standalone: true,
  imports: [FormsModule, DatePipe, StatusBadgeComponent, SearchableSelectComponent],
  template: `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h1 class="text-xl font-bold text-gray-800">Devoluciones</h1>
        <button (click)="abrirCrear()"
          class="px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors"
          style="background-color: #39A900">
          + Registrar devolución
        </button>
      </div>

      @if (loading) {
        <div class="flex justify-center py-12">
          <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        </div>
      } @else if (devoluciones.length === 0) {
        <p class="text-center text-gray-400 text-sm py-10">No hay devoluciones registradas</p>
      } @else {
        <div class="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50/80 text-gray-500 text-[11px] uppercase tracking-wide">
              <tr>
                <th class="px-4 py-3 text-left font-semibold">Producto</th>
                <th class="px-4 py-3 text-left font-semibold">Ítem</th>
                <th class="px-4 py-3 text-left font-semibold">Estado</th>
                <th class="px-4 py-3 text-left font-semibold">Observación</th>
                <th class="px-4 py-3 text-left font-semibold">Fecha</th>
                <th class="px-4 py-3 text-left font-semibold">Chequeo</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (d of devoluciones; track d.id_devolucion) {
                <tr class="hover:bg-gray-50/80 transition-colors">
                  <td class="px-4 py-3 text-gray-700">{{ nombreProducto(d) }}</td>
                  <td class="px-4 py-3 text-gray-700">
                    @if (d.id_item) {
                      {{ nombreItem(d.id_item) }}
                    } @else {
                      <span class="text-gray-500">Sobrante: {{ d.cantidad }} {{ unidadDeLote(d) }}</span>
                    }
                  </td>
                  <td class="px-4 py-3"><app-status-badge [value]="d.estado" /></td>
                  <td class="px-4 py-3 text-gray-500 max-w-[220px] truncate">{{ d.observacion ?? '—' }}</td>
                  <td class="px-4 py-3 text-gray-500 text-xs">{{ d.fecha | date: 'short' }}</td>
                  <td class="px-4 py-3 ">
                  @if (!d.id_item) {
                    <span class="text-gray-300 text-xs">—</span>
                  } @else if(itemChequeoDe(d);as ic){
                    <app-status-badge [value]= "ic.estado ? 'BUENO' : 'DAÑADO'" [labelOverride]="ic.estado ? 'pasa' : 'No pasa'" />

                  }@else {
                    <span class= "text-gray-400 text-xs"> Pendiente</span>
                  }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          </div>
        </div>
      }
    </div>

    @if (crearOpen) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarCrear()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">Registrar devolución</h2>
            <button (click)="cerrarCrear()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Préstamo a devolver</label>
              <app-ss [options]="opcionesSolicitud()" placeholder="— Selecciona —"
                [(ngModel)]="idSolicitud" (ngModelChange)="onSolicitudChange()"></app-ss>
            </div>

            @if (idSolicitud) {
              @if (cargandoPendientes) {
                <p class="text-gray-400 text-xs">Cargando unidades…</p>
              } @else if (filas.length === 0) {
                <p class="rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-xs px-3 py-2">
                  No quedan unidades pendientes de devolución para este préstamo.
                </p>
              } @else {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Estado de las unidades que volvieron</label>
                  <select [(ngModel)]="estadoGeneral" (ngModelChange)="aplicarATodas()"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]">
                    @for (op of estadosDevolucion; track op.value) {
                      <option [ngValue]="op.value">{{ op.label }} — {{ op.desc }}</option>
                    }
                  </select>
                  <p class="text-[11px] text-gray-400 mt-1">
                    Destildá las unidades que <b>todavía no volvieron</b>: el préstamo queda abierto hasta registrarlas.
                    Cambiá el estado fila por fila solo si alguna vuelve distinto.
                  </p>
                </div>

                <div class="rounded-lg border border-gray-100 divide-y divide-gray-50 max-h-56 overflow-y-auto">
                  @for (f of filas; track f.id_item) {
                    <div class="flex items-center gap-3 px-3 py-2" [class.opacity-40]="!f.volvio">
                      <input type="checkbox" [(ngModel)]="f.volvio"
                        class="w-4 h-4 accent-[#39A900] flex-none" title="¿Volvió esta unidad?" />
                      <div class="flex-1 min-w-0">
                        <p class="text-xs font-semibold text-gray-800 truncate">{{ f.producto_nombre || 'Unidad' }}</p>
                        <p class="font-mono text-[11px] text-gray-400 truncate">
                          {{ f.placa_sena || f.codigo_sku || '' }}{{ f.placa_sena && f.codigo_sku ? ' · ' + f.codigo_sku : '' }}
                        </p>
                      </div>
                      <select [(ngModel)]="f.estadoDev" [disabled]="!f.volvio"
                        class="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900] disabled:opacity-50"
                        [class.border-red-300]="f.estadoDev === 'DAÑADO' || f.estadoDev === 'PERDIDO'"
                        [class.border-amber-300]="f.estadoDev === 'REGULAR'">
                        @for (op of estadosDevolucion; track op.value) {
                          <option [ngValue]="op.value">{{ op.label }}</option>
                        }
                      </select>
                    </div>
                  }
                </div>
                @if (marcadas.length && marcadas.length < filas.length) {
                  <p class="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                    Devolución parcial: {{ marcadas.length }} de {{ filas.length }}. El préstamo sigue ENTREGADO hasta que vuelvan todas.
                  </p>
                }

                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Observación general (opcional)</label>
                  <input type="text" [(ngModel)]="observacion"
                    placeholder="Estado físico, daños, detalles del chequeo..."
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                </div>
              }

              <!-- Sobrante de consumible/perecedero (2026-09-11): un consumible
                   mayormente NO vuelve, pero a veces sí un sobrante parcial (ej.
                   de 250kg de abono prestados, 1-2kg). Independiente de la
                   grilla por unidad de arriba: no cierra ni exige nada de la
                   solicitud, cada línea se registra por separado. -->
              @if (cargandoConsumibles) {
                <p class="text-gray-400 text-xs">Revisando sobrantes…</p>
              } @else if (lineasConsumibles.length > 0) {
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Sobrante a devolver</label>
                  <p class="text-[11px] text-gray-400 mb-2">
                    Un consumible/perecedero normalmente NO vuelve. Si sobró algo sin usar, registralo acá.
                  </p>
                  <div class="space-y-2">
                    @for (l of lineasConsumibles; track l.id_lote) {
                      <div class="rounded-lg border border-gray-100 p-2.5">
                        <div class="flex items-center justify-between mb-1.5 gap-2">
                          <p class="text-xs font-semibold text-gray-800 truncate">
                            {{ l.producto_nombre || 'Lote' }}{{ l.codigo_lote ? ' · ' + l.codigo_lote : '' }}
                          </p>
                          <span class="text-[11px] text-gray-400 flex-none">{{ l.cantidad_pendiente }} {{ l.unidad_medida || '' }} pendiente(s)</span>
                        </div>
                        <div class="flex gap-2">
                          <input type="number" min="1" [max]="l.cantidad_pendiente"
                            [(ngModel)]="formConsumible[l.id_lote].cantidad"
                            placeholder="Cantidad"
                            class="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                          <input type="text" [(ngModel)]="formConsumible[l.id_lote].observacion"
                            placeholder="Observación (opcional)"
                            class="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                          <button type="button" (click)="registrarSobrante(l)"
                            [disabled]="guardandoConsumible[l.id_lote] || !formConsumible[l.id_lote].cantidad"
                            class="px-3 py-1.5 text-white text-xs font-medium rounded-lg disabled:opacity-60 transition-colors flex-none"
                            style="background-color: #39A900">
                            {{ guardandoConsumible[l.id_lote] ? 'Guardando…' : 'Registrar' }}
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            }
          </div>

          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }

          <div class="flex justify-end gap-2 mt-6">
            <button (click)="cerrarCrear()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
            <button (click)="guardarDevolucion()" [disabled]="saving || !idSolicitud || filas.length === 0"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ saving ? 'Guardando...' : 'Registrar devolución' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MaterialesDevolucionesComponent implements OnInit {
  devoluciones: Devolucion[] = [];
  solicitudes: Solicitud[] = [];
  items: Item[] = [];
  lotes: Lote[] = [];
  chequeo: Chequeo[]=[];
  item_chequeo: ItemChequeo[]=[]
  loading = false;
  saving = false;
  error: string | null = null;

  readonly estadosDevolucion = ESTADOS_DEVOLUCION;

  crearOpen = false;
  idSolicitud: string | null = null;
  cargandoPendientes = false;
  filas: FilaDevolucion[] = [];
  estadoGeneral: EstadoDevolucion = 'BUENO';
  observacion = '';

  // ── Sobrante de consumible/perecedero (2026-09-11) — ver docblock del componente ──
  lineasConsumibles: LineaConsumiblePendiente[] = [];
  cargandoConsumibles = false;
  formConsumible: Record<string, { cantidad: number | null; observacion: string }> = {};
  guardandoConsumible: Record<string, boolean> = {};

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private live: MaterialesLiveService,
    private destroyRef: DestroyRef,
  ) {}

  /**
   * Préstamos en estado ENTREGADA. El backend cierra la solicitud (→ DEVUELTA)
   * cuando ya volvieron todas las unidades, así que basta con el estado; si
   * quedan filas `devolucion` pero la solicitud sigue ENTREGADA (parciales /
   * datos viejos), el endpoint de pendientes devuelve solo lo que falta.
   */
  get solicitudesEntregadas(): Solicitud[] {
    return this.solicitudes.filter((s) => s.estado === 'ENTREGADA');
  }

  opcionesSolicitud(): { value: string; label: string }[] {
    return this.solicitudesEntregadas.map((s) => ({
      value: s.id_solicitud,
      label: `${s.producto?.nombre ?? 'Material'} — Cant. ${s.cantidad} — ${new Date(s.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}`,
    }));
  }

  ngOnInit(): void {
    this.cargar();
    this.live.eventos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargar());
  }

  nombreItem(id: string | null): string {
    if (!id) return '—';
    const item = this.items.find((i) => i.id_item === id);
    return item ? `${item.codigo_sku}${item.placa_sena ? ' — ' + item.placa_sena : ''}` : '—';
  }

  /** Unidad del lote de una devolución de sobrante — para la tabla de historial. */
  unidadDeLote(d: Devolucion): string {
    if (!d.id_lote) return '';
    const lote = this.lotes.find((l) => l.id_lote === d.id_lote);
    return lote?.producto?.unidad_medida ?? lote?.unidad_medida ?? '';
  }

  nombreProducto(d: Devolucion): string {
    // El producto real de la unidad/lote devuelto — una solicitud multi-línea
    // mezcla varios, así que no sirve el `producto` de la solicitud.
    const item = this.items.find((i) => i.id_item === d.id_item);
    const lote = d.id_lote ? this.lotes.find((l) => l.id_lote === d.id_lote) : undefined;
    return (
      item?.producto?.nombre ??
      lote?.producto?.nombre ??
      this.solicitudes.find((s) => s.id_solicitud === d.id_solicitud)?.producto?.nombre ??
      '—'
    );
  }

  itemChequeoDe(d: Devolucion): ItemChequeo | undefined{
    const chq = this.chequeo.find((c)=>c.id_solicitud === d.id_solicitud);
    if(!chq){
      return undefined;
      
    }
    return this.item_chequeo.find((ic)=> ic.id_chequeo === chq.id_chequeo && ic.id_item === d.id_item)
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      // M9 — solo `listarDevoluciones()` es crítico; si una secundaria da 403
      // (excepción personal) no debe tumbar la tabla entera.
      const [devoluciones, solicitudes, items, lotes, chequeo, item_chequeo] = await Promise.all([
        this.api.listarDevoluciones(),
        this.api.listarSolicitudes().catch(() => [] as Solicitud[]),
        this.api.listarItems().catch(() => [] as Item[]),
        this.api.listarLotes().catch(() => [] as Lote[]),
        this.api.listarChequeos().catch(()=>[] as Chequeo[]),
        this.api.listarItemsChequeo().catch(()=> [] as ItemChequeo[]),
      ]);
      this.devoluciones = devoluciones;
      this.solicitudes = solicitudes;
      this.items = items;
      this.lotes = lotes;
      this.chequeo = chequeo;
      this.item_chequeo = item_chequeo;
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las devoluciones.');
    } finally {
      this.loading = false;
    }
  }

  abrirCrear(): void {
    if (this.solicitudesEntregadas.length === 0) {
      this.toast.warn('Nada que devolver', 'No hay préstamos en estado ENTREGADA pendientes de devolución.');
      return;
    }
    this.idSolicitud = null;
    this.filas = [];
    this.estadoGeneral = 'BUENO';
    this.observacion = '';
    this.lineasConsumibles = [];
    this.formConsumible = {};
    this.guardandoConsumible = {};
    this.error = null;
    this.crearOpen = true;
  }

  cerrarCrear(): void {
    this.crearOpen = false;
  }

  async onSolicitudChange(): Promise<void> {
    this.filas = [];
    this.lineasConsumibles = [];
    this.error = null;
    if (!this.idSolicitud) return;
    this.cargandoPendientes = true;
    this.cargandoConsumibles = true;
    try {
      const [pendientes, consumibles] = await Promise.all([
        this.api.itemsPendientesDevolucion(this.idSolicitud),
        this.api.lineasConsumiblesPendientes(this.idSolicitud).catch(() => [] as LineaConsumiblePendiente[]),
      ]);
      this.filas = pendientes.map((p) => ({ ...p, estadoDev: this.estadoGeneral, volvio: true }));
      this.lineasConsumibles = consumibles;
      for (const l of consumibles) {
        this.formConsumible[l.id_lote] ??= { cantidad: null, observacion: '' };
      }
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudieron cargar las unidades del préstamo.';
    } finally {
      this.cargandoPendientes = false;
      this.cargandoConsumibles = false;
    }
  }

  /** Registra el sobrante de UNA línea de lote — independiente del resto del
   *  formulario: no cierra ni exige nada de la solicitud. */
  async registrarSobrante(linea: LineaConsumiblePendiente): Promise<void> {
    if (!this.idSolicitud) return;
    const f = this.formConsumible[linea.id_lote];
    const cantidad = Number(f?.cantidad) || 0;
    if (cantidad <= 0) return;
    if (cantidad > linea.cantidad_pendiente) {
      this.toast.warn('Cantidad inválida', `Como máximo podés devolver ${linea.cantidad_pendiente} ${linea.unidad_medida ?? ''}.`);
      return;
    }
    this.guardandoConsumible[linea.id_lote] = true;
    try {
      const dto: CreateDevolucionConsumibleDto = {
        id_solicitud: this.idSolicitud,
        id_lote: linea.id_lote,
        cantidad,
        observacion: f?.observacion?.trim() || undefined,
      };
      await this.api.registrarDevolucionConsumible(dto);
      this.toast.ok(`Se registraron ${cantidad} ${linea.unidad_medida ?? ''} devueltos de "${linea.producto_nombre ?? 'material'}"`);
      delete this.formConsumible[linea.id_lote];
      await this.onSolicitudChange();
      await this.cargar();
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo registrar el sobrante.');
    } finally {
      this.guardandoConsumible[linea.id_lote] = false;
    }
  }

  aplicarATodas(): void {
    for (const f of this.filas) if (f.volvio) f.estadoDev = this.estadoGeneral;
  }

  /** Unidades tildadas como "volvió" — usado por el template y el submit. */
  get marcadas(): any[] {
    return this.filas.filter((f) => f.volvio);
  }

  async guardarDevolucion(): Promise<void> {
    if (!this.idSolicitud || this.filas.length === 0) return;
    const marcadas = this.marcadas;
    if (marcadas.length === 0) {
      this.error = 'Marcá al menos una unidad que haya vuelto.';
      return;
    }
    const parcial = marcadas.length < this.filas.length;
    this.saving = true;
    this.error = null;
    try {
      const dto: CreateDevolucionDto = parcial
        ? {
            // M9 — devolución parcial: solo las unidades marcadas, cada una con su estado.
            id_solicitud: this.idSolicitud,
            observacion: this.observacion.trim() || undefined,
            items: marcadas.map((f) => ({ id_item: f.id_item, estado: f.estadoDev })),
          }
        : {
            // Cierre total: estado general + solo las excepciones en `items`.
            id_solicitud: this.idSolicitud,
            estado_general: this.estadoGeneral,
            observacion: this.observacion.trim() || undefined,
            items: (() => {
              const exc = marcadas
                .filter((f) => f.estadoDev !== this.estadoGeneral)
                .map((f) => ({ id_item: f.id_item, estado: f.estadoDev }));
              return exc.length > 0 ? exc : undefined;
            })(),
          };
      await this.api.crearDevolucion(dto);
      this.toast.ok(
        parcial
          ? `Devolución parcial registrada — quedan ${this.filas.length - marcadas.length} unidad(es)`
          : 'Devolución registrada',
      );
      this.crearOpen = false;
      await this.cargar();
    } catch (e: any) {
      this.error = e?.error?.message ?? 'No se pudo registrar la devolución.';
    } finally {
      this.saving = false;
    }
  }
}
