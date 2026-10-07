import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent, TableRowLink } from '../../shared/components/admin-table.component';
import { DialogDirective } from '../../shared/directives/dialog.directive';
import { ToastService, mensajeDeError } from '../../core/services/toast.service';
import { ExportColumn, TableExportService } from '../../shared/services/table-export.service';
import {
  AreaIngreso,
  IngresoMaterial,
  IngresoMaterialDetalle,
  LineaIngresoMaterial,
  MaterialesApiService,
  RepartoLineaDto,
  Sitio,
  SoporteIngreso,
} from './data-access/materiales-api.service';
import { FormatoGilModalComponent } from './ui/formato-gil-modal.component';
import { ConfirmService } from '../../core/services/confirm.service';
import {
  ACEPTA_SOPORTE,
  IngresoFormModalComponent,
  MAX_SOPORTES,
  TIPOS_INGRESO,
  TIPOS_SOPORTE,
  filtrarSoportes,
  tamanoLegible,
} from './ui/ingreso-form-modal.component';

const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const etiqueta = (lista: { value: string; label: string }[], v: string | null) => lista.find((x) => x.value === v)?.label ?? v ?? '';

/** Una fila del reparto: cuánto de una línea va a qué bodega del área. */
interface FilaReparto {
  id_sitio: string;
  cantidad: number | null;
  placasTexto: string;
  codigo_lote: string;
}

const ESTADO_REPARTO: Record<string, string> = { POR_REPARTIR: 'Por repartir', PARCIAL: 'Repartido en parte', REPARTIDO: 'Repartido' };

/**
 * Ingresos de material a la sede (2026-10-05). Cada ingreso es un documento
 * (ING-20261006-001) con proveedor, soporte, bodega y quién recibió; sus líneas
 * crean las unidades o lotes en la bodega. Desde el detalle se ve qué placas
 * o lote generó cada línea y se puede anular mientras nada se haya movido.
 *
 * Formato GIL-F-014 (2026-10-06): en Yamboro el material llega a un ÁREA, no a
 * una bodega. Se registra el formato (sin existencias) y desde el detalle el
 * líder lo reparte a las bodegas del área, todo o por partes.
 */
@Component({
  selector: 'app-materiales-ingresos',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, DialogDirective, IngresoFormModalComponent, FormatoGilModalComponent],
  template: `
    <div class="p-6">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Llegada de Material<span class="block text-xs font-normal text-gray-400">antes «Ingresos»</span></h1>
          <p class="text-sm text-gray-500 mt-0.5">Lo que llega a la sede: de qué proveedor, con qué soporte, quién lo recibió y en qué bodega quedó.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          @if (areas.length) {
            <button type="button" (click)="formatoOpen = true" class="px-3 py-2 rounded-lg text-sm font-semibold text-white" style="background-color: var(--accent-brand)">+ Formato GIL-F-014 (por área)</button>
          }
          <button type="button" (click)="exportar('excel')" class="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-[#39A900] hover:text-[#267700]">Excel</button>
          <button type="button" (click)="exportar('pdf')" class="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-[#39A900] hover:text-[#267700]">PDF</button>
        </div>
      </div>

      <app-admin-table
        addLabel="Compra o donación a bodega"
        (add)="formOpen = true"
        [rows]="filas"
        [searchable]="true"
        searchPlaceholder="Buscar por número, área, proveedor, soporte, bodega…"
        [columns]="['codigo', 'fecha_ingreso', 'tipo_txt', 'origen_txt', 'soporte_txt', 'destino_txt', 'cantidad_total', 'valor_txt', 'estado_txt']"
        [columnLabels]="{ codigo: 'N.º', fecha_ingreso: 'Llegó', tipo_txt: 'Tipo', origen_txt: 'De', soporte_txt: 'Soporte', destino_txt: 'Para', cantidad_total: 'Cantidad', valor_txt: 'Valor', estado_txt: 'Estado' }"
        [filterOptions]="opcionesEstado"
        [filterValue]="filtroEstado"
        filterLabel="Estado"
        (filterValueChange)="filtroEstado = $event; armarFilas()"
        [loading]="loading"
        [canEdit]="false"
        [canDelete]="false"
        [rowLinks]="acciones" />
    </div>

    <app-ingreso-form-modal [open]="formOpen" [sitios]="bodegas" (closed)="formOpen = false" (guardado)="onGuardado($event)" />
    <app-formato-gil-modal [open]="formatoOpen" [areas]="areas" (closed)="formatoOpen = false" (guardado)="onFormatoGuardado($event)" />

    @if (detalle; as d) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="detalle = null">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
            <div>
              <h2 class="text-lg font-bold text-gray-800">
                {{ d.modalidad === 'FORMATO_AREA' ? 'Formato GIL-F-014 ·' : 'Ingreso' }} {{ d.codigo }}
                @if (d.estado_reparto && d.estado === 'REGISTRADO') {
                  <span class="ml-2 align-middle text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                    [class]="d.estado_reparto === 'REPARTIDO' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'">{{ estadoRepartoTxt(d) }}</span>
                }
                @if (d.estado === 'ANULADO') { <span class="ml-2 align-middle text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">Anulado</span> }
              </h2>
              <p class="text-xs text-gray-400 mt-0.5">Registrado el {{ d.fecha_registro.slice(0, 10) }} por {{ d.registra_nombre || '—' }}</p>
            </div>
            <button aria-label="Cerrar" (click)="detalle = null" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6 space-y-4">
            <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
              @if (d.modalidad === 'FORMATO_AREA') {
                <div><dt class="text-xs text-gray-400">Área</dt><dd class="text-gray-800 font-semibold">{{ d.area_nombre || '—' }}</dd></div>
                <div><dt class="text-xs text-gray-400">Coordinador de área</dt><dd class="text-gray-800">{{ d.coordinador_nombre || '—' }}</dd></div>
                <div><dt class="text-xs text-gray-400">Cuentadante</dt><dd class="text-gray-800">{{ d.cuentadante_nombre || '—' }}</dd></div>
                @if (d.ficha_codigo) { <div><dt class="text-xs text-gray-400">Ficha</dt><dd class="text-gray-800">{{ d.ficha_codigo }}</dd></div> }
              } @else {
                <div><dt class="text-xs text-gray-400">Tipo</dt><dd class="text-gray-800">{{ tipoTxt(d.tipo_ingreso) }}</dd></div>
                <div><dt class="text-xs text-gray-400">Proveedor</dt><dd class="text-gray-800">{{ d.proveedor_nombre || '—' }}@if (d.proveedor_documento) { <span class="text-gray-400"> · {{ d.proveedor_documento }}</span> }</dd></div>
                <div><dt class="text-xs text-gray-400">Bodega</dt><dd class="text-gray-800">{{ d.sitio_nombre || '—' }}</dd></div>
              }
              <div><dt class="text-xs text-gray-400">Soporte</dt><dd class="text-gray-800">{{ soporteTxt(d) || '—' }}</dd></div>
              <div><dt class="text-xs text-gray-400">Fecha del soporte</dt><dd class="text-gray-800">{{ d.fecha_soporte || '—' }}</dd></div>
              <div><dt class="text-xs text-gray-400">Llegó</dt><dd class="text-gray-800">{{ d.fecha_ingreso }}</dd></div>
              <div><dt class="text-xs text-gray-400">Recibió</dt><dd class="text-gray-800">{{ d.recibido_por || d.recibe_nombre || '—' }}</dd></div>
              <div><dt class="text-xs text-gray-400">Valor total</dt><dd class="text-gray-800 font-semibold">{{ d.valor_total !== null ? pesos(d.valor_total) : '—' }}</dd></div>
              @if (d.observaciones) { <div class="col-span-2 sm:col-span-3"><dt class="text-xs text-gray-400">Observaciones</dt><dd class="text-gray-800">{{ d.observaciones }}</dd></div> }
              @if (d.estado === 'ANULADO') {
                <div class="col-span-2 sm:col-span-3 rounded-lg bg-red-50 p-2.5">
                  <dt class="text-xs text-red-500">Motivo de la anulación ({{ d.fecha_anulacion?.slice(0, 10) }})</dt><dd class="text-red-800">{{ d.motivo_anulacion }}</dd>
                </div>
              }
            </dl>

            <div class="overflow-x-auto rounded-xl border border-gray-200">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th class="px-3 py-2 text-left font-semibold">Producto</th>
                    @if (d.modalidad === 'FORMATO_AREA') { <th class="px-3 py-2 text-right font-semibold">Solicitada</th> }
                    <th class="px-3 py-2 text-right font-semibold">{{ d.modalidad === 'FORMATO_AREA' ? 'Entregada' : 'Cantidad' }}</th>
                    <th class="px-3 py-2 text-right font-semibold">Valor unit.</th>
                    <th class="px-3 py-2 text-left font-semibold">Quedó como</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of d.lineas; track l.id_linea) {
                    <tr class="border-t border-gray-100 align-top">
                      <td class="px-3 py-2">
                        <p class="font-medium text-gray-800">{{ l.producto_nombre }}</p>
                        <p class="text-xs text-gray-400">{{ subtitulo(l) }}{{ l.codigo_sena ? ' · cód. SENA ' + l.codigo_sena : '' }}</p>
                      </td>
                      @if (d.modalidad === 'FORMATO_AREA') {
                        <td class="px-3 py-2 text-right whitespace-nowrap text-gray-500">{{ l.cantidad_solicitada ?? '—' }}</td>
                      }
                      <td class="px-3 py-2 text-right whitespace-nowrap">{{ l.cantidad }} <span class="text-xs text-gray-400">{{ l.unidad_medida }}</span></td>
                      <td class="px-3 py-2 text-right whitespace-nowrap">{{ l.valor_unitario !== null ? pesos(l.valor_unitario) : '—' }}</td>
                      <td class="px-3 py-2 text-xs text-gray-600">
                        @if (d.modalidad === 'FORMATO_AREA') {
                          @for (r of l.repartos; track r.id_reparto) {
                            <p>{{ r.cantidad }} → {{ r.sitio_nombre }} <span class="text-gray-400">({{ r.fecha.slice(0, 10) }})</span></p>
                          }
                          @if (l.cantidad - l.cantidad_repartida > 0 && d.estado === 'REGISTRADO') {
                            <p class="font-semibold text-amber-700">Faltan {{ l.cantidad - l.cantidad_repartida }} por repartir</p>
                          }
                          @if (l.tipo_material === 'DEVOLUTIVO' && l.unidades.length) { <p class="text-gray-400">{{ placasTxt(l.unidades).replace(' · ', '') }}</p> }
                          @for (lo of l.lotes; track lo.id_lote) { <p class="text-gray-400">Lote {{ lo.codigo_lote }} · quedan {{ lo.cantidad_disponible }}</p> }
                          @if (d.estado === 'ANULADO' && !l.repartos.length) { <span class="text-gray-400">Retirado al anular</span> }
                        } @else if (l.tipo_material === 'DEVOLUTIVO') {
                          @if (l.unidades.length) {
                            {{ l.unidades.length }} unidad(es){{ placasTxt(l.unidades) }}
                          } @else { <span class="text-gray-400">{{ d.estado === 'ANULADO' ? 'Retiradas al anular' : '—' }}</span> }
                        } @else {
                          @if (l.lote) {
                            Lote {{ l.lote.codigo_lote || 'sin código' }} · quedan {{ l.lote.cantidad_disponible }}
                            @if (l.fecha_vencimiento) { · vence {{ l.fecha_vencimiento }} }
                          } @else { <span class="text-gray-400">{{ d.estado === 'ANULADO' ? 'Retirado al anular' : '—' }}</span> }
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- Soportes: foto o PDF de la factura, remisión… -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-bold text-gray-700">Soportes <span class="font-normal text-gray-400">({{ d.soportes.length }}/{{ maxSoportes }})</span></h3>
                @if (d.estado === 'REGISTRADO' && d.soportes.length < maxSoportes) {
                  <label class="text-xs font-semibold text-[#2d8000] hover:underline cursor-pointer" [class.opacity-50]="subiendo">
                    {{ subiendo ? 'Subiendo…' : '📎 Adjuntar' }}
                    <input type="file" multiple [accept]="aceptaSoporte" class="hidden" [disabled]="subiendo" (change)="adjuntar(d, $event)" />
                  </label>
                }
              </div>
              @if (d.soportes.length) {
                <ul class="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  @for (s of d.soportes; track s.id_soporte) {
                    <li class="flex items-center gap-3 px-3 py-2 text-sm">
                      <span class="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border"
                        [class]="s.mime === 'application/pdf' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'">
                        {{ s.mime === 'application/pdf' ? 'PDF' : 'IMG' }}
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-gray-800">{{ s.nombre_original }}</p>
                        <p class="text-xs text-gray-400">{{ tamano(s.tamano) }} · {{ s.fecha.slice(0, 10) }}{{ s.subido_por ? ' · ' + s.subido_por : '' }}</p>
                      </div>
                      <button type="button" (click)="descargar(d, s)" class="text-xs font-medium text-[#2d8000] hover:underline">Descargar</button>
                      @if (d.estado === 'REGISTRADO') {
                        <button type="button" (click)="quitar(d, s)" class="text-xs font-medium text-gray-400 hover:text-red-600">Quitar</button>
                      }
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-xs text-gray-400 rounded-xl border border-dashed border-gray-200 p-3">
                  Sin archivos. {{ d.estado !== 'REGISTRADO' ? '' : d.modalidad === 'FORMATO_AREA' ? 'Adjunta el PDF o la foto del formato GIL-F-014 firmado.' : 'Adjunta la foto o el PDF de la factura o remisión que respalda este ingreso.' }}
                </p>
              }
            </div>

            @if (repartiendo) {
              <div class="rounded-xl border border-[#39A900]/30 bg-[#39A900]/5 p-3 space-y-3">
                <div>
                  <h3 class="text-sm font-bold text-gray-800">Repartir a las bodegas de {{ d.area_nombre }}</h3>
                  <p class="text-xs text-gray-500">Puedes repartir solo una parte y terminar después. Los equipos quedan a cargo del cuentadante del formato.</p>
                </div>
                @if (!bodegasDelArea(d).length) {
                  <p class="text-xs text-red-600">El área no tiene bodegas activas. Crea una en Sitios antes de repartir.</p>
                }
                @for (l of lineasPendientes(d); track l.id_linea) {
                  <div class="rounded-lg bg-white border border-gray-200 p-2.5 space-y-2">
                    <p class="text-sm font-medium text-gray-800">{{ l.producto_nombre }}
                      <span class="text-xs font-normal text-gray-500">· faltan {{ l.cantidad - l.cantidad_repartida }} {{ l.unidad_medida }} · {{ l.tipo_material === 'DEVOLUTIVO' ? 'equipo' : 'consumo' }}</span></p>
                    @for (f of reparto[l.id_linea]; track $index; let j = $index) {
                      <div class="grid grid-cols-1 sm:grid-cols-[1fr_6rem_auto] gap-2 items-start">
                        <select [(ngModel)]="f.id_sitio" [class]="campoChico" [attr.aria-label]="'Bodega para ' + l.producto_nombre">
                          <option value="">— Bodega —</option>
                          @for (b of bodegasDelArea(d); track b.id_sitio) { <option [value]="b.id_sitio">{{ b.nombre }}</option> }
                        </select>
                        <input type="number" min="1" [(ngModel)]="f.cantidad" [class]="campoChico" [attr.aria-label]="'Cantidad para ' + l.producto_nombre" />
                        <button type="button" (click)="quitarFila(l, j)" class="text-xs text-gray-400 hover:text-red-600 px-2 py-2">Quitar</button>
                        @if (l.tipo_material === 'DEVOLUTIVO') {
                          <textarea rows="1" [(ngModel)]="f.placasTexto" placeholder="Placas SENA (una por línea o separadas por coma; opcional)" class="sm:col-span-3 {{ campoChico }}"></textarea>
                        } @else {
                          <input type="text" [(ngModel)]="f.codigo_lote" maxlength="60" placeholder="Código de lote (vacío = automático)" class="sm:col-span-3 {{ campoChico }}" />
                        }
                      </div>
                    }
                    <button type="button" (click)="agregarFila(l)" class="text-xs font-medium text-[#2d8000] hover:underline">+ Otra bodega</button>
                  </div>
                }
                <div class="flex justify-end gap-2">
                  <button type="button" (click)="repartiendo = false" class="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
                  <button type="button" (click)="guardarReparto(d)" [disabled]="trabajando"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style="background-color: var(--accent-brand)">{{ trabajando ? 'Guardando…' : 'Guardar reparto' }}</button>
                </div>
              </div>
            }

            @if (anulando) {
              <div class="rounded-xl border border-red-200 bg-red-50/60 p-3 space-y-2">
                <p class="text-xs text-red-700">Anular retira de la bodega todo lo que entró con este ingreso. Solo se puede si nada se ha movido todavía.</p>
                <textarea rows="2" [(ngModel)]="motivo" placeholder="Motivo (ej. se registró dos veces la misma factura)"
                  class="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-300"></textarea>
                <div class="flex justify-end gap-2">
                  <button type="button" (click)="anulando = false" class="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
                  <button type="button" (click)="anular(d)" [disabled]="trabajando || motivo.trim().length < 5"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 disabled:opacity-50">{{ trabajando ? 'Anulando…' : 'Anular ingreso' }}</button>
                </div>
              </div>
            }
          </div>

          <div class="shrink-0 flex justify-between gap-2 border-t border-gray-100 px-4 py-4 sm:px-6 mt-2">
            @if (d.estado === 'REGISTRADO' && !anulando) {
              <button type="button" (click)="anulando = true; repartiendo = false; motivo = ''" class="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">Anular</button>
            } @else { <span></span> }
            <div class="flex gap-2">
              @if (d.modalidad === 'FORMATO_AREA' && d.estado === 'REGISTRADO' && d.estado_reparto !== 'REPARTIDO' && !repartiendo) {
                <button type="button" (click)="abrirReparto(d)" class="px-4 py-2 text-sm font-semibold text-white rounded-lg" style="background-color: var(--accent-brand)">Repartir a bodegas</button>
              }
              <button (click)="detalle = null" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cerrar</button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class MaterialesIngresosComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);
  private readonly exporter = inject(TableExportService);

  readonly pesos = (v: number) => pesos.format(v);
  readonly tamano = tamanoLegible;
  readonly maxSoportes = MAX_SOPORTES;
  readonly aceptaSoporte = ACEPTA_SOPORTE;
  private readonly confirm = inject(ConfirmService);
  subiendo = false;
  readonly opcionesEstado = [
    { value: '', label: 'Todos' },
    { value: 'REGISTRADO', label: 'Registrados' },
    { value: 'ANULADO', label: 'Anulados' },
  ];

  ingresos: IngresoMaterial[] = [];
  filas: any[] = [];
  filtroEstado = 'REGISTRADO';
  loading = false;
  bodegas: Sitio[] = [];
  /** Áreas donde puede registrar formatos GIL-F-014 (con sus bodegas). */
  areas: AreaIngreso[] = [];
  formOpen = false;
  formatoOpen = false;
  repartiendo = false;
  reparto: Record<string, FilaReparto[]> = {};
  readonly campoChico = 'w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]';

  detalle: IngresoMaterialDetalle | null = null;
  anulando = false;
  motivo = '';
  trabajando = false;

  readonly acciones: TableRowLink[] = [{ label: 'Ver', onClick: (row) => void this.abrir(row.id_ingreso) }];

  private readonly exportColumns: ExportColumn<any>[] = [
    { label: 'N.º', value: (r) => r.codigo },
    { label: 'Llegó', value: (r) => r.fecha_ingreso },
    { label: 'Tipo', value: (r) => r.tipo_txt },
    { label: 'De', value: (r) => r.origen_txt },
    { label: 'Documento proveedor', value: (r) => r.proveedor_documento },
    { label: 'Soporte', value: (r) => r.soporte_txt },
    { label: 'Para', value: (r) => r.destino_txt },
    { label: 'Cuentadante', value: (r) => r.cuentadante_nombre },
    { label: 'Recibió', value: (r) => r.recibido_por || r.recibe_nombre },
    { label: 'Productos', value: (r) => r.lineas_count },
    { label: 'Cantidad', value: (r) => r.cantidad_total },
    { label: 'Valor', value: (r) => r.valor_total },
    { label: 'Estado', value: (r) => r.estado_txt },
  ];

  private readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    void this.cargar();
    // Desde el Inicio ("Llegó material"): `?nuevo=1` abre el asistente de una vez.
    void this.cargarBodegas().then(() => {
      // Si gestiona áreas, lo normal en Yamboro es el formato GIL-F-014.
      if (this.route.snapshot.queryParamMap.get('nuevo') === '1') {
        if (this.areas.length) this.formatoOpen = true;
        else this.formOpen = true;
      }
    });
  }

  tipoTxt(v: string): string {
    return etiqueta(TIPOS_INGRESO, v);
  }

  soporteTxt(i: IngresoMaterial): string {
    return [etiqueta(TIPOS_SOPORTE, i.tipo_soporte), i.numero_soporte].filter(Boolean).join(' ');
  }

  subtitulo(l: { marca: string | null; modelo: string | null; codigo_unspsc: string | null }): string {
    return [l.marca, l.modelo, l.codigo_unspsc ? `UNSPSC ${l.codigo_unspsc}` : null].filter(Boolean).join(' · ');
  }

  placasTxt(unidades: { placa_sena: string | null }[]): string {
    const placas = unidades.map((u) => u.placa_sena).filter(Boolean) as string[];
    if (!placas.length) return ' · sin placa todavía';
    const muestra = placas.slice(0, 6).join(', ');
    return ` · placas ${muestra}${placas.length > 6 ? ` y ${placas.length - 6} más` : ''}${placas.length < unidades.length ? ` (${unidades.length - placas.length} sin placa)` : ''}`;
  }

  private async cargarBodegas(): Promise<void> {
    try {
      // Las que el backend deja usar: todas (admin ERP / permiso personal) o las del área del líder.
      const acceso = await this.api.accesoIngresos();
      this.bodegas = acceso.bodegas;
      this.areas = acceso.areas ?? [];
    } catch {
      this.bodegas = [];
      this.areas = [];
    }
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.ingresos = await this.api.listarIngresos();
      this.armarFilas();
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los ingresos.');
    } finally {
      this.loading = false;
    }
  }

  armarFilas(): void {
    this.filas = this.ingresos
      .filter((i) => !this.filtroEstado || i.estado === this.filtroEstado)
      .map((i) => ({
        ...i,
        tipo_txt: i.modalidad === 'FORMATO_AREA' ? 'Formato GIL-F-014' : this.tipoTxt(i.tipo_ingreso),
        soporte_txt: this.soporteTxt(i) || '—',
        origen_txt: i.modalidad === 'FORMATO_AREA' ? (i.proveedor_nombre ?? 'Sede central') : (i.proveedor_nombre ?? '—'),
        destino_txt: i.modalidad === 'FORMATO_AREA' ? `Área ${i.area_nombre ?? '—'}` : (i.sitio_nombre ?? '—'),
        valor_txt: i.valor_total !== null ? this.pesos(i.valor_total) : '—',
        estado_txt: i.estado === 'ANULADO' ? 'Anulado' : i.estado_reparto ? this.estadoRepartoTxt(i) : 'Registrado',
      }));
  }

  async abrir(id: string): Promise<void> {
    this.anulando = false;
    this.repartiendo = false;
    try {
      this.detalle = await this.api.obtenerIngreso(id);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo abrir el ingreso.');
    }
  }

  estadoRepartoTxt(i: IngresoMaterial): string {
    if (!i.estado_reparto) return '';
    const base = ESTADO_REPARTO[i.estado_reparto] ?? i.estado_reparto;
    return i.estado_reparto === 'PARCIAL' ? `${base} (${i.cantidad_repartida}/${i.cantidad_total})` : base;
  }

  bodegasDelArea(d: IngresoMaterial): { id_sitio: string; nombre: string }[] {
    return this.areas.find((a) => a.id_area === d.id_area)?.bodegas ?? [];
  }

  lineasPendientes(d: IngresoMaterialDetalle): LineaIngresoMaterial[] {
    return d.lineas.filter((l) => l.cantidad - l.cantidad_repartida > 0);
  }

  abrirReparto(d: IngresoMaterialDetalle): void {
    const bodegas = this.bodegasDelArea(d);
    this.reparto = {};
    for (const l of this.lineasPendientes(d)) {
      this.reparto[l.id_linea] = [
        { id_sitio: bodegas.length === 1 ? bodegas[0].id_sitio : '', cantidad: l.cantidad - l.cantidad_repartida, placasTexto: '', codigo_lote: '' },
      ];
    }
    this.anulando = false;
    this.repartiendo = true;
  }

  agregarFila(l: LineaIngresoMaterial): void {
    this.reparto[l.id_linea] = [...(this.reparto[l.id_linea] ?? []), { id_sitio: '', cantidad: null, placasTexto: '', codigo_lote: '' }];
  }

  quitarFila(l: LineaIngresoMaterial, j: number): void {
    this.reparto[l.id_linea] = this.reparto[l.id_linea].filter((_, i) => i !== j);
  }

  async guardarReparto(d: IngresoMaterialDetalle): Promise<void> {
    const repartos: (RepartoLineaDto & { id_linea: string })[] = [];
    for (const l of this.lineasPendientes(d)) {
      const filas = (this.reparto[l.id_linea] ?? []).filter((f) => f.id_sitio && Number(f.cantidad) > 0);
      const suma = filas.reduce((t, f) => t + Number(f.cantidad), 0);
      const pendiente = l.cantidad - l.cantidad_repartida;
      if (suma > pendiente) {
        this.toast.warn('Revisa las cantidades', `De «${l.producto_nombre}» faltan ${pendiente}; estás repartiendo ${suma}.`);
        return;
      }
      for (const f of filas) {
        const placas = f.placasTexto.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
        repartos.push({
          id_linea: l.id_linea,
          id_sitio: f.id_sitio,
          cantidad: Number(f.cantidad),
          ...(l.tipo_material === 'DEVOLUTIVO' ? { placas_sena: placas } : { codigo_lote: f.codigo_lote.trim() || null }),
        });
      }
    }
    if (!repartos.length) {
      this.toast.warn('Nada que repartir', 'Elige una bodega y la cantidad en al menos un bien.');
      return;
    }
    this.trabajando = true;
    try {
      this.detalle = await this.api.repartirIngreso(d.id_ingreso, repartos);
      this.repartiendo = false;
      this.toast.ok('Reparto registrado', this.detalle.estado_reparto === 'REPARTIDO' ? 'Todo el formato quedó en las bodegas.' : 'Lo que falta queda pendiente.');
      await this.cargar();
    } catch (e) {
      this.toast.error('No se pudo repartir', mensajeDeError(e, 'Intenta de nuevo.'));
    } finally {
      this.trabajando = false;
    }
  }

  async onFormatoGuardado(det: IngresoMaterialDetalle): Promise<void> {
    this.formatoOpen = false;
    await this.cargar();
    this.detalle = det;
    this.abrirReparto(det);
  }

  async onGuardado(det: IngresoMaterialDetalle): Promise<void> {
    this.formOpen = false;
    await this.cargar();
    this.detalle = det;
  }

  async anular(d: IngresoMaterialDetalle): Promise<void> {
    this.trabajando = true;
    try {
      this.detalle = await this.api.anularIngreso(d.id_ingreso, this.motivo.trim());
      this.anulando = false;
      this.toast.ok(`Ingreso ${d.codigo} anulado`, 'Lo que había entrado se retiró de la bodega.');
      await this.cargar();
    } catch (e) {
      this.toast.error('No se pudo anular', mensajeDeError(e, 'Intenta de nuevo.'));
    } finally {
      this.trabajando = false;
    }
  }

  async adjuntar(d: IngresoMaterialDetalle, ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const { validos, aviso } = filtrarSoportes(Array.from(input.files ?? []), d.soportes.length);
    input.value = '';
    if (aviso) this.toast.warn('Algunos archivos no se adjuntaron', aviso, 7000);
    if (!validos.length) return;
    this.subiendo = true;
    try {
      d.soportes = await this.api.subirSoportesIngreso(d.id_ingreso, validos);
      this.toast.ok(validos.length === 1 ? 'Soporte adjuntado' : `${validos.length} soportes adjuntados`);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo adjuntar el soporte.');
    } finally {
      this.subiendo = false;
    }
  }

  async descargar(d: IngresoMaterialDetalle, s: SoporteIngreso): Promise<void> {
    try {
      const blob = await this.api.descargarSoporteIngreso(d.id_ingreso, s.id_soporte);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = s.nombre_original;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo descargar el soporte.');
    }
  }

  async quitar(d: IngresoMaterialDetalle, s: SoporteIngreso): Promise<void> {
    if (!(await this.confirm.ask(`¿Quitar el soporte "${s.nombre_original}" de ${d.codigo}?`))) return;
    try {
      d.soportes = await this.api.quitarSoporteIngreso(d.id_ingreso, s.id_soporte);
      this.toast.ok('Soporte quitado');
    } catch (e) {
      this.toast.httpError(e, 'No se pudo quitar el soporte.');
    }
  }

  exportar(formato: 'excel' | 'pdf'): void {
    if (formato === 'excel') void this.exporter.excel('ingresos', 'Ingresos', this.exportColumns, this.filas);
    else void this.exporter.pdf('ingresos', 'Ingresos de material', this.exportColumns, this.filas);
  }
}
