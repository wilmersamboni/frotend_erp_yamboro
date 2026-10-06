import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent, TableRowLink } from '../../shared/components/admin-table.component';
import { DialogDirective } from '../../shared/directives/dialog.directive';
import { ToastService, mensajeDeError } from '../../core/services/toast.service';
import { ExportColumn, TableExportService } from '../../shared/services/table-export.service';
import { IngresoMaterial, IngresoMaterialDetalle, MaterialesApiService, Sitio, SoporteIngreso } from './data-access/materiales-api.service';
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

/**
 * Ingresos de material a la sede (2026-10-05). Cada ingreso es un documento
 * (ING-000001) con proveedor, soporte, bodega y quién recibió; sus líneas
 * crean las unidades o lotes en la bodega. Desde el detalle se ve qué placas
 * o lote generó cada línea y se puede anular mientras nada se haya movido.
 */
@Component({
  selector: 'app-materiales-ingresos',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, DialogDirective, IngresoFormModalComponent],
  template: `
    <div class="p-6">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Llegada de material<span class="block text-xs font-normal text-gray-400">antes «Ingresos»</span></h1>
          <p class="text-sm text-gray-500 mt-0.5">Lo que llega a la sede: de qué proveedor, con qué soporte, quién lo recibió y en qué bodega quedó.</p>
        </div>
        <div class="flex gap-2">
          <button type="button" (click)="exportar('excel')" class="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-[#39A900] hover:text-[#267700]">Excel</button>
          <button type="button" (click)="exportar('pdf')" class="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:border-[#39A900] hover:text-[#267700]">PDF</button>
        </div>
      </div>

      <app-admin-table
        addLabel="Nuevo ingreso"
        (add)="formOpen = true"
        [rows]="filas"
        [searchable]="true"
        searchPlaceholder="Buscar por número, proveedor, soporte, bodega…"
        [columns]="['codigo', 'fecha_ingreso', 'tipo_txt', 'proveedor_nombre', 'soporte_txt', 'sitio_nombre', 'cantidad_total', 'valor_txt', 'estado_txt']"
        [columnLabels]="{ codigo: 'N.º', fecha_ingreso: 'Llegó', tipo_txt: 'Tipo', proveedor_nombre: 'Proveedor', soporte_txt: 'Soporte', sitio_nombre: 'Bodega', cantidad_total: 'Cantidad', valor_txt: 'Valor', estado_txt: 'Estado' }"
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

    @if (detalle; as d) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="detalle = null">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
            <div>
              <h2 class="text-lg font-bold text-gray-800">
                Ingreso {{ d.codigo }}
                @if (d.estado === 'ANULADO') { <span class="ml-2 align-middle text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">Anulado</span> }
              </h2>
              <p class="text-xs text-gray-400 mt-0.5">Registrado el {{ d.fecha_registro.slice(0, 10) }} por {{ d.registra_nombre || '—' }}</p>
            </div>
            <button aria-label="Cerrar" (click)="detalle = null" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6 space-y-4">
            <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
              <div><dt class="text-xs text-gray-400">Tipo</dt><dd class="text-gray-800">{{ tipoTxt(d.tipo_ingreso) }}</dd></div>
              <div><dt class="text-xs text-gray-400">Proveedor</dt><dd class="text-gray-800">{{ d.proveedor_nombre || '—' }}@if (d.proveedor_documento) { <span class="text-gray-400"> · {{ d.proveedor_documento }}</span> }</dd></div>
              <div><dt class="text-xs text-gray-400">Bodega</dt><dd class="text-gray-800">{{ d.sitio_nombre || '—' }}</dd></div>
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
                    <th class="px-3 py-2 text-right font-semibold">Cantidad</th>
                    <th class="px-3 py-2 text-right font-semibold">Valor unit.</th>
                    <th class="px-3 py-2 text-left font-semibold">Quedó como</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of d.lineas; track l.id_linea) {
                    <tr class="border-t border-gray-100 align-top">
                      <td class="px-3 py-2">
                        <p class="font-medium text-gray-800">{{ l.producto_nombre }}</p>
                        <p class="text-xs text-gray-400">{{ subtitulo(l) }}</p>
                      </td>
                      <td class="px-3 py-2 text-right whitespace-nowrap">{{ l.cantidad }} <span class="text-xs text-gray-400">{{ l.unidad_medida }}</span></td>
                      <td class="px-3 py-2 text-right whitespace-nowrap">{{ l.valor_unitario !== null ? pesos(l.valor_unitario) : '—' }}</td>
                      <td class="px-3 py-2 text-xs text-gray-600">
                        @if (l.tipo_material === 'DEVOLUTIVO') {
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
                  Sin archivos. {{ d.estado === 'REGISTRADO' ? 'Adjunta la foto o el PDF de la factura o remisión que respalda este ingreso.' : '' }}
                </p>
              }
            </div>

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
              <button type="button" (click)="anulando = true; motivo = ''" class="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">Anular</button>
            } @else { <span></span> }
            <button (click)="detalle = null" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cerrar</button>
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
  formOpen = false;

  detalle: IngresoMaterialDetalle | null = null;
  anulando = false;
  motivo = '';
  trabajando = false;

  readonly acciones: TableRowLink[] = [{ label: 'Ver', onClick: (row) => void this.abrir(row.id_ingreso) }];

  private readonly exportColumns: ExportColumn<any>[] = [
    { label: 'N.º', value: (r) => r.codigo },
    { label: 'Llegó', value: (r) => r.fecha_ingreso },
    { label: 'Tipo', value: (r) => r.tipo_txt },
    { label: 'Proveedor', value: (r) => r.proveedor_nombre },
    { label: 'Documento proveedor', value: (r) => r.proveedor_documento },
    { label: 'Soporte', value: (r) => r.soporte_txt },
    { label: 'Bodega', value: (r) => r.sitio_nombre },
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
      if (this.route.snapshot.queryParamMap.get('nuevo') === '1') this.formOpen = true;
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
      this.bodegas = (await this.api.accesoIngresos()).bodegas;
    } catch {
      this.bodegas = [];
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
        tipo_txt: this.tipoTxt(i.tipo_ingreso),
        soporte_txt: this.soporteTxt(i) || '—',
        proveedor_nombre: i.proveedor_nombre ?? '—',
        valor_txt: i.valor_total !== null ? this.pesos(i.valor_total) : '—',
        estado_txt: i.estado === 'ANULADO' ? 'Anulado' : 'Registrado',
      }));
  }

  async abrir(id: string): Promise<void> {
    this.anulando = false;
    try {
      this.detalle = await this.api.obtenerIngreso(id);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo abrir el ingreso.');
    }
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
