import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { TuiDay } from '@taiga-ui/cdk';
import { FormsModule } from '@angular/forms';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { DateInputComponent } from '../../../shared/components/date-input.component';
import { TuiDayCache } from '../../../shared/utils/tui-day.util';
import { ToastService, mensajeDeError } from '../../../core/services/toast.service';
import { PersonaService } from '../../../core/services/persona.service';
import { ErpCatalogoService } from '../../schedules/data-access/erp-catalogo.service';
import { hoyLocal } from '../../../shared/utils/informe-pdf';
import { AreaIngreso, IngresoMaterialDetalle, MaterialesApiService, Producto } from '../data-access/materiales-api.service';
import { ACEPTA_SOPORTE, filtrarSoportes, tamanoLegible } from './ingreso-form-modal.component';

interface LineaFormato {
  key: number;
  id_producto: string;
  codigo_sena: string;
  cantidad_solicitada: number | null;
  cantidad: number | null;
  fecha_vencimiento: string;
  /** Uno por línea: un TuiDayCache compartido alternaría fechas y recrearía el TuiDay en cada render. */
  cacheVence: TuiDayCache;
}

/**
 * Registro del formato GIL-F-014 (2026-10-06): "Formato de solicitud de salida
 * de bienes para el uso de los cuentadantes" del SENA, con el que la sede
 * central despacha a un ÁREA de Yamboro. Los campos siguen el papel: área,
 * fecha, coordinador, servidor público (cuentadante), ficha y, por bien,
 * código SENA, cantidad solicitada y entregada. No suma a ninguna bodega: el
 * material queda "por repartir" y se reparte desde el detalle de la llegada.
 */
@Component({
  selector: 'app-formato-gil-modal',
  standalone: true,
  imports: [FormsModule, DialogDirective, SearchableSelectComponent, DateInputComponent],
  template: `
    @if (open) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="cerrar()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
            <div>
              <h2 class="text-lg font-bold text-gray-800">Formato GIL-F-014 recibido</h2>
              <p class="text-xs text-gray-500 mt-0.5">Lo que la sede central despachó a un área. Queda <strong>por repartir</strong>: todavía no suma a ninguna bodega.</p>
            </div>
            <button aria-label="Cerrar" (click)="cerrar()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6 space-y-5">
            <section class="space-y-3">
              <h3 class="text-xs font-bold uppercase tracking-wide text-gray-400">Datos del formato</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Área <span class="text-red-500">*</span></label>
                  <app-ss [options]="opcionesArea" placeholder="— Elige el área —" [(ngModel)]="idArea"></app-ss>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Número o referencia del formato</label>
                  <input type="text" [(ngModel)]="numeroSoporte" maxlength="80" placeholder="Ej: consecutivo de SIGA" [class]="campo" />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Fecha de la solicitud (en el formato)</label>
                  <app-date-input placeholder="DD/MM/AAAA" [clearable]="true" [max]="cacheLimite.get(fechaIngreso || hoy)"
                    [ngModel]="cacheSoporte.get(fechaSoporte)" (ngModelChange)="fechaSoporte = aIso($event)"></app-date-input>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Día en que llegó a Yamboro <span class="text-red-500">*</span></label>
                  <app-date-input placeholder="DD/MM/AAAA" [max]="hoyTuiDay"
                    [ngModel]="cacheIngreso.get(fechaIngreso)" (ngModelChange)="fechaIngreso = aIso($event)"></app-date-input>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Jefe de oficina o coordinador de área</label>
                  <app-ss [options]="opcionesPersona" placeholder="— Buscar persona —" [(ngModel)]="idCoordinador"></app-ss>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Servidor público a quien se asigna (cuentadante)</label>
                  <app-ss [options]="opcionesCuentadante" placeholder="— Buscar persona —" [(ngModel)]="idCuentadante"></app-ss>
                  <p class="text-[11px] text-gray-400 mt-1">Opcional. Responde solo por los equipos que se repartan con placa SENA (si se ponen placas, se pide al repartir). Instructores o habilitados en Usuarios.</p>
                </div>
                <div class="sm:col-span-2">
                  <label class="block text-xs font-medium text-gray-600 mb-1">Código de grupo o ficha de caracterización (si lo trae)</label>
                  <app-ss [options]="opcionesFicha" placeholder="— Sin ficha —" [(ngModel)]="idCurso"></app-ss>
                </div>
              </div>
            </section>

            <section class="space-y-2">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-bold uppercase tracking-wide text-gray-400">Bienes del formato</h3>
                <button type="button" (click)="agregarLinea()" class="text-xs font-medium text-[#2d8000] hover:underline">+ Agregar bien</button>
              </div>
              @for (l of lineas; track l.key; let i = $index) {
                <div class="rounded-xl border border-gray-200 p-3 space-y-2">
                  <div class="flex items-start gap-2">
                    <span class="mt-2 text-xs font-semibold text-gray-400 w-5 shrink-0">{{ i + 1 }}</span>
                    <div class="flex-1 min-w-0">
                      <app-ss [options]="opcionesProducto" [placeholder]="cargando ? 'Cargando catálogo…' : 'Descripción del bien (buscar en el catálogo)…'" [(ngModel)]="l.id_producto"></app-ss>
                    </div>
                    <button type="button" aria-label="Quitar bien" (click)="quitarLinea(i)" class="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 text-lg leading-none">×</button>
                  </div>
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-7">
                    <div>
                      <label class="block text-[11px] font-medium text-gray-500 mb-0.5">Código SENA</label>
                      <input type="text" [(ngModel)]="l.codigo_sena" maxlength="40" placeholder="N/A" [class]="campoChico" />
                    </div>
                    <div>
                      <label class="block text-[11px] font-medium text-gray-500 mb-0.5">Cantidad solicitada</label>
                      <input type="number" min="0" [(ngModel)]="l.cantidad_solicitada" [class]="campoChico" />
                    </div>
                    <div>
                      <label class="block text-[11px] font-medium text-gray-500 mb-0.5">Cantidad entregada <span class="text-red-500">*</span></label>
                      <input type="number" min="1" [(ngModel)]="l.cantidad" [class]="campoChico" />
                    </div>
                    @if (ficha(l)?.tipo_material === 'PERECEDERO') {
                      <div>
                        <label class="block text-[11px] font-medium text-gray-500 mb-0.5">Vence <span class="text-red-500">*</span></label>
                        <app-date-input placeholder="DD/MM/AAAA" [min]="cacheLimite.get(fechaIngreso || hoy)"
                          [ngModel]="l.cacheVence.get(l.fecha_vencimiento)" (ngModelChange)="l.fecha_vencimiento = aIso($event)"></app-date-input>
                      </div>
                    }
                  </div>
                  @if (ficha(l); as p) {
                    <p class="pl-7 text-[11px] text-gray-400">
                      {{ p.tipo_material === 'DEVOLUTIVO' ? 'Equipo: las placas se ponen al repartir.' : 'Consumo: al repartir se crea un lote por bodega.' }} Unidad: {{ p.unidad_medida }}.
                      @if (l.cantidad && l.cantidad_solicitada && l.cantidad < l.cantidad_solicitada) {
                        <span class="text-amber-600"> Llegó menos de lo solicitado ({{ l.cantidad }} de {{ l.cantidad_solicitada }}).</span>
                      }
                    </p>
                  }
                </div>
              }
            </section>

            <section class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Observaciones (objeto, código SIIF…)</label>
                <textarea rows="3" [(ngModel)]="observaciones" maxlength="2000" [class]="campo"></textarea>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">PDF o foto del formato firmado</label>
                <label class="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 cursor-pointer hover:border-[#39A900]">
                  📎 Adjuntar
                  <input type="file" multiple [accept]="aceptaSoporte" class="hidden" (change)="elegirSoportes($event)" />
                </label>
                @for (f of soportes; track f.name) {
                  <p class="mt-1 text-xs text-gray-600 truncate">{{ f.name }} <span class="text-gray-400">· {{ tamano(f.size) }}</span></p>
                }
              </div>
            </section>

            @if (error) { <p class="text-red-600 text-xs p-2 bg-red-50 rounded-lg">{{ error }}</p> }
          </div>

          <div class="shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-gray-100 px-4 py-4 sm:px-6 mt-2">
            <button (click)="cerrar()" class="w-full sm:w-auto px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
            <button (click)="guardar()" [disabled]="guardando"
              class="w-full sm:w-auto px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60" style="background-color: var(--accent-brand)">
              {{ guardando ? 'Registrando…' : 'Registrar formato' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class FormatoGilModalComponent implements OnChanges {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);
  private readonly personaApi = inject(PersonaService);
  private readonly erpCatalogo = inject(ErpCatalogoService);

  @Input() open = false;
  /** Áreas que el usuario gestiona (de `accesoIngresos`). */
  @Input() areas: AreaIngreso[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() guardado = new EventEmitter<IngresoMaterialDetalle>();

  readonly campo = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]';
  readonly campoChico = 'w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]';
  readonly hoy = hoyLocal();
  // <app-date-input> (calendario de Taiga) trabaja con TuiDay; el formulario sigue en 'yyyy-MM-dd'.
  readonly hoyTuiDay = TuiDayCache.fromIso(this.hoy);
  readonly cacheSoporte = new TuiDayCache();
  readonly cacheIngreso = new TuiDayCache();
  readonly cacheLimite = new TuiDayCache();
  aIso(day: TuiDay | null): string {
    return TuiDayCache.toIso(day);
  }
  readonly aceptaSoporte = ACEPTA_SOPORTE;
  readonly tamano = tamanoLegible;

  idArea = '';
  numeroSoporte = '';
  fechaSoporte = '';
  fechaIngreso = hoyLocal();
  idCoordinador = '';
  idCuentadante = '';
  idCurso = '';
  observaciones = '';
  lineas: LineaFormato[] = [];
  soportes: File[] = [];
  private siguienteKey = 1;

  catalogo: Producto[] = [];
  opcionesPersona: SSOption[] = [];
  /** Misma regla que la pantalla de cuentadante: instructor o habilitado en Usuarios (`puedeSerCuentadante`). */
  opcionesCuentadante: SSOption[] = [];
  opcionesFicha: SSOption[] = [];
  cargando = false;
  guardando = false;
  error: string | null = null;

  get opcionesArea(): SSOption[] {
    return this.areas.map((a) => ({ value: a.id_area, label: `${a.nombre} (${a.bodegas.length} bodega${a.bodegas.length === 1 ? '' : 's'})` }));
  }

  get opcionesProducto(): SSOption[] {
    return this.catalogo.map((p) => ({
      value: p.id_producto,
      label: `${p.nombre}${p.marca ? ' · ' + p.marca : ''}${p.modelo ? ' ' + p.modelo : ''} (${p.unidad_medida})`,
    }));
  }

  ficha(l: LineaFormato): Producto | null {
    return this.catalogo.find((p) => p.id_producto === l.id_producto) ?? null;
  }

  ngOnChanges(c: SimpleChanges): void {
    if (c['open'] && this.open) this.reiniciar();
  }

  private reiniciar(): void {
    this.idArea = this.areas.length === 1 ? this.areas[0].id_area : '';
    this.numeroSoporte = '';
    this.fechaSoporte = '';
    this.fechaIngreso = hoyLocal();
    this.idCoordinador = '';
    this.idCuentadante = '';
    this.idCurso = '';
    this.observaciones = '';
    this.lineas = [];
    this.soportes = [];
    this.error = null;
    this.agregarLinea();
    void this.cargarListas();
  }

  private async cargarListas(): Promise<void> {
    this.cargando = true;
    const [catalogo, personas, fichas] = await Promise.all([
      this.api.catalogoProductos().catch(() => [] as Producto[]),
      this.personaApi.listarResponsablesBodega().catch(() => [] as any[]),
      this.erpCatalogo.getFichas().catch(() => [] as any[]),
    ]);
    this.catalogo = catalogo.filter((p) => p.activo !== false);
    const opcion = (u: any): SSOption => ({
      value: u.idUsuario,
      label: [`${u.persona?.nombre ?? ''} ${u.persona?.apellido ?? ''}`.trim(), u.persona?.documento ?? u.persona?.cedula, u.persona?.cargo]
        .filter(Boolean)
        .join(' — '),
    });
    this.opcionesPersona = personas.map(opcion);
    this.opcionesCuentadante = personas
      .filter((u: any) => u.persona?.cargo === 'instructor' || u.puedeSerCuentadante === true)
      .map(opcion);
    this.opcionesFicha = fichas.map((f: any) => ({ value: f.idCurso, label: `${f.codigo}${f.programa ? ' — ' + f.programa : ''}` }));
    this.cargando = false;
  }

  agregarLinea(): void {
    this.lineas = [...this.lineas, { key: this.siguienteKey++, id_producto: '', codigo_sena: '', cantidad_solicitada: null, cantidad: null, fecha_vencimiento: '', cacheVence: new TuiDayCache() }];
  }

  quitarLinea(i: number): void {
    this.lineas = this.lineas.filter((_, idx) => idx !== i);
    if (this.lineas.length === 0) this.agregarLinea();
  }

  elegirSoportes(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const { validos, aviso } = filtrarSoportes(Array.from(input.files ?? []), this.soportes.length);
    input.value = '';
    if (aviso) this.toast.warn('Algunos archivos no se adjuntaron', aviso, 7000);
    this.soportes = [...this.soportes, ...validos];
  }

  cerrar(): void {
    this.closed.emit();
  }

  private validar(): string | null {
    if (!this.idArea) return 'Elige el área a la que llegó el formato.';
    if (!this.fechaIngreso) return 'Escribe el día en que llegó.';
    if (this.fechaIngreso > this.hoy) return 'El día de llegada no puede ser futuro.';
    if (this.fechaSoporte && this.fechaSoporte > this.fechaIngreso) return 'La fecha del formato no puede ser posterior a la llegada.';
    const llenas = this.lineas.filter((l) => l.id_producto);
    if (!llenas.length) return 'Agrega al menos un bien del formato.';
    for (const [i, l] of llenas.entries()) {
      const pos = `Bien ${i + 1}`;
      if (!l.cantidad || l.cantidad < 1 || !Number.isInteger(Number(l.cantidad))) return `${pos}: escribe la cantidad entregada.`;
      if (this.ficha(l)?.tipo_material === 'PERECEDERO' && !l.fecha_vencimiento) return `${pos}: es perecedero, falta la fecha de vencimiento.`;
    }
    return null;
  }

  async guardar(): Promise<void> {
    this.error = this.validar();
    if (this.error) return;
    this.guardando = true;
    try {
      const det = await this.api.registrarIngreso({
        modalidad: 'FORMATO_AREA',
        tipo_ingreso: 'TRASLADO_CENTRO',
        tipo_soporte: 'GIL_F_014',
        id_area: this.idArea,
        id_coordinador: this.idCoordinador || undefined,
        id_cuentadante: this.idCuentadante || undefined,
        id_curso: this.idCurso || undefined,
        numero_soporte: this.numeroSoporte.trim() || null,
        fecha_soporte: this.fechaSoporte || null,
        fecha_ingreso: this.fechaIngreso,
        observaciones: this.observaciones.trim() || null,
        lineas: this.lineas
          .filter((l) => l.id_producto)
          .map((l) => ({
            id_producto: l.id_producto,
            cantidad: Number(l.cantidad),
            cantidad_solicitada: l.cantidad_solicitada !== null && l.cantidad_solicitada !== undefined && String(l.cantidad_solicitada) !== '' ? Number(l.cantidad_solicitada) : null,
            codigo_sena: l.codigo_sena.trim() || null,
            fecha_vencimiento: this.ficha(l)?.tipo_material === 'PERECEDERO' ? l.fecha_vencimiento : null,
          })),
      });
      if (this.soportes.length) {
        try {
          det.soportes = await this.api.subirSoportesIngreso(det.id_ingreso, this.soportes);
        } catch (e) {
          this.toast.httpError(e, 'El formato se registró, pero no se pudo adjuntar el archivo. Adjúntalo desde el detalle.');
        }
      }
      this.toast.ok(`Formato registrado como ${det.codigo}`, 'Ahora repártelo a las bodegas del área.');
      this.guardado.emit(det);
    } catch (e) {
      this.error = mensajeDeError(e, 'No se pudo registrar el formato.');
    } finally {
      this.guardando = false;
    }
  }
}
