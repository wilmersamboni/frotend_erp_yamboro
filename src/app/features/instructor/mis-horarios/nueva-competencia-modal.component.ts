import { Component, EventEmitter, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { HorariosApiService } from '../../../core/services/horarios/horarios-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { durHorarioMin, Resultado } from '../../../core/utils/horarios.util';
import { TuiDay } from '@taiga-ui/cdk';
import { DateInputComponent } from '../../../shared/components/date-input.component';

/**
 * Modal "Añadir Competencia / Resultado" — extraído de instructor-mis-horarios.component.ts.
 * Incluye 2 mini-calendarios propios: uno para marcar los días de clase de la
 * competencia (rango fechaInicio–fechaFin), y uno solo reutilizado para asignar
 * fechas a los resultados — antes había un calendario aparte por cada resultado
 * (se abrían y cerraban en cascada); ahora hay uno único, y cada resultado
 * funciona como su propia "pestaña": lo seleccionas y el calendario compartido
 * pasa a editar sus fechas (ver resultadoActivo).
 */
@Component({
  selector: 'app-nueva-competencia-modal',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DateInputComponent],
  template: `
    @if (compModal()) {
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl comp-modal-wide" (click)="$event.stopPropagation()">
        <div class="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <h3>Añadir Competencia / Resultado</h3>
          <button class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" (click)="cerrar()"><lucide-icon name="x" [size]="18"></lucide-icon></button>
        </div>
        <div class="modal-body">
        <div class="form-group">
          <label class="block text-xs font-semibold text-gray-600 mb-1">Nombre</label>
          <input class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" [(ngModel)]="compForm.nombre">
        </div>

        <!-- Período primero: los días de clase y las fechas por resultado
             dependen de esto — antes iba después de "Resultados" y el botón
             "Elegir fechas" de cada resultado quedaba deshabilitado hasta
             llenar esto, obligando a subir y bajar por el formulario. -->
        <div class="grid grid-cols-2 mt-3 gap-3">
          <div class="form-group">
            <label class="block text-xs font-semibold text-gray-600 mb-1">Inicio de competencia</label>
            <app-date-input [ngModel]="dateVal(compForm.fechaInicio)"
                   (ngModelChange)="onCompFechaInicioChange(tuiDayToISO($event))"></app-date-input>
          </div>
          <div class="form-group">
            <label class="block text-xs font-semibold text-gray-600 mb-1">Fin de competencia</label>
            <app-date-input [ngModel]="dateVal(compForm.fechaFin)"
                   (ngModelChange)="onCompFechaFinChange(tuiDayToISO($event))"></app-date-input>
          </div>
        </div>

        @if (compForm.fechaInicio && compForm.fechaFin) {
          <div class="comp-cal-wrap mt-3">
            <div class="comp-cal-hint">
              <lucide-icon name="info" [size]="12"></lucide-icon>
              Marca los días de clase para esta competencia
            </div>
            <div class="comp-cal-header">
              <button class="comp-cal-nav" (click)="compCalPrevMes()" title="Mes anterior">&#8249;</button>
              <span class="comp-cal-title">{{ formatCompCalMes() }}</span>
              <button class="comp-cal-nav" (click)="compCalNextMes()" title="Mes siguiente">&#8250;</button>
            </div>
            <div class="comp-cal-grid">
              @for (lbl of ['Lu','Ma','Mi','Ju','Vi','Sá','Do']; track lbl; let di = $index) {
                <div class="comp-cal-dayhdr" [class.weekend]="di === 5 || di === 6">{{ lbl }}</div>
              }
              @for (cell of compCalCeldas(); track cell.iso) {
                <div class="comp-cal-cell"
                     [class.weekend]="isWeekendIso(cell.iso)"
                     [class.comp-cal-inrange]="cell.inRange && !cell.isIni && !cell.isFin"
                     [class.comp-cal-boundary]="cell.isIni || cell.isFin"
                     [class.comp-cal-sel]="cell.inRange && compDiasClase().includes(cell.iso)"
                     [class.comp-cal-other]="cell.otherMonth"
                     (click)="cell.inRange && toggleDiaClase(cell.iso)">
                  {{ cell.day }}
                </div>
              }
            </div>
            <div class="comp-cal-total">
              <lucide-icon name="clock" [size]="11"></lucide-icon>
              <strong>{{ compDiasClase().length }}</strong> día{{ compDiasClase().length !== 1 ? 's' : '' }} seleccionado{{ compDiasClase().length !== 1 ? 's' : '' }}
              @if (compDiasClase().length > 0) {
                &nbsp;·&nbsp;<strong>{{ calcHorasFormModal() }}h</strong> acumuladas
              }
            </div>
          </div>
        }

        <div class="form-group mt-3">
          <label class="block text-xs font-semibold text-gray-600 mb-1">Resultados</label>
          @for (r of compResultados(); track $index; let i = $index) {
            <div class="resultado-row" [class.resultado-activo]="resultadoActivo() === i">
              <div style="display:flex;gap:6px;align-items:center;">
                <input class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" style="flex:1;"
                       [ngModel]="r.texto" (ngModelChange)="setCompResultado(i, $event)"
                       placeholder="Resultado {{ i + 1 }}">
                <button type="button" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" (click)="removeCompResultado(i)" title="Quitar">
                  <lucide-icon name="x" [size]="14"></lucide-icon>
                </button>
              </div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
                <button type="button" class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 rounded-lg transition-all" style="font-size:11px;padding:3px 8px;"
                        [disabled]="compDiasClase().length === 0"
                        (click)="seleccionarResultado(i)">
                  <lucide-icon name="calendar" [size]="11" style="vertical-align:-2px;margin-right:4px;"></lucide-icon>
                  {{ resultadoActivo() === i ? 'Editando fechas ↓' : (r.fechaInicio ? 'Cambiar fechas' : 'Elegir fechas') }}
                </button>
                @if (r.fechaInicio) {
                  <span style="font-size:11px;color:var(--text-muted);">
                    {{ formatDiaClaseFull(r.fechaInicio) }} @if (r.fechaFin && r.fechaFin !== r.fechaInicio) { → {{ formatDiaClaseFull(r.fechaFin) }} }
                  </span>
                } @else if (compDiasClase().length === 0) {
                  <span style="font-size:11px;color:var(--text-muted);font-style:italic;">Primero marca los días de clase arriba</span>
                } @else {
                  <span style="font-size:11px;color:var(--text-muted);font-style:italic;">Sin fechas asignadas</span>
                }
              </div>
            </div>
          }
          <button type="button" class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 rounded-lg transition-all" style="font-size:12px;padding:5px 10px;" (click)="addCompResultado()">
            <lucide-icon name="plus" [size]="12" style="vertical-align:-2px;margin-right:4px;"></lucide-icon>Agregar resultado
          </button>

          <!-- Calendario único, reutilizado para el resultado seleccionado arriba
               (en vez de un calendario aparte por cada resultado). -->
          @if (compResultados().length > 0) {
            @if (compDiasClase().length > 0 && resultadoActivo() !== null) {
              <div class="comp-cal-wrap mt-2">
                <p class="comp-cal-hint" style="margin-bottom:8px;">
                  <lucide-icon name="calendar" [size]="12"></lucide-icon>
                  Fechas para: <strong>{{ resultadoActivoLabel() }}</strong>
                </p>
                <div class="comp-cal-header">
                  <button class="comp-cal-nav" (click)="rCalPrevMes()" title="Mes anterior">&#8249;</button>
                  <span class="comp-cal-title">{{ formatRCalMes() }}</span>
                  <button class="comp-cal-nav" (click)="rCalNextMes()" title="Mes siguiente">&#8250;</button>
                </div>
                <div class="comp-cal-grid">
                  @for (lbl of ['Lu','Ma','Mi','Ju','Vi','Sá','Do']; track lbl; let di = $index) {
                    <div class="comp-cal-dayhdr" [class.weekend]="di === 5 || di === 6">{{ lbl }}</div>
                  }
                  @for (cell of rCalCeldas(); track cell.iso) {
                    <div class="comp-cal-cell"
                         [class.weekend]="isWeekendIso(cell.iso)"
                         [class.r-cal-ocupado]="cell.ocupado"
                         [class.r-cal-allowed]="cell.allowed && !cell.inRange && !cell.isIni && !cell.isFin"
                         [class.r-cal-inrange]="cell.allowed && cell.inRange && !cell.isIni && !cell.isFin"
                         [class.r-cal-boundary]="cell.allowed && (cell.isIni || cell.isFin)"
                         [class.comp-cal-other]="(cell.otherMonth || !cell.allowed) && !cell.ocupado"
                         [title]="cell.ocupado ? 'Ya asignado a otro resultado' : ''"
                         (click)="cell.allowed && pickRCalDay(cell.iso)">
                      {{ cell.day }}
                    </div>
                  }
                </div>
                <p class="comp-cal-hint mt-2" style="margin-bottom:0;">
                  <lucide-icon name="info" [size]="11"></lucide-icon>
                  Los días tachados ya están asignados a otro resultado.
                </p>
              </div>
            } @else if (compDiasClase().length === 0) {
              <p class="comp-cal-hint mt-2">
                <lucide-icon name="info" [size]="12"></lucide-icon>
                Marca los días de clase de la competencia arriba para poder asignar fechas a los resultados.
              </p>
            }
          }
        </div>

        <div class="btn-row mt-4">
          <button class="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-2 transition-all" (click)="cerrar()">Cancelar</button>
          <button class="bg-sena-gradient hover:opacity-90 text-white font-semibold rounded-xl px-5 py-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed" [disabled]="!compFormValid()" (click)="saveComp()"
                  [title]="compFormValid() ? '' : 'Completa todos los campos antes de guardar'">
            Guardar
          </button>
        </div>
        </div>
      </div>
    </div>
    }
  `,
  styles: [`
    .comp-modal-wide { max-width: 440px; width: 100%; }

    /* .modal (global) no trae padding propio — sólo .modal-header lo tiene.
       Sin este wrapper, Nombre/Resultados/fechas quedaban pegados a los
       bordes del modal y Cancelar/Guardar sin margen inferior. */
    .modal-body { padding: 20px 24px 24px; }

    /* .btn-row tampoco existe globalmente. */
    .btn-row { display: flex; justify-content: flex-end; gap: 10px; }

    .comp-cal-wrap {
      border: 1px solid var(--border); border-radius: 12px; padding: 10px 12px;
      background: var(--surface2);
    }
    .comp-cal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .comp-cal-title { font-size: 12px; font-weight: 700; color: var(--text); }
    .comp-cal-nav {
      background: none; border: 1px solid var(--border); border-radius: 4px;
      width: 22px; height: 22px; cursor: pointer; font-size: 16px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      color: var(--text-muted); transition: all .15s; padding: 0;
    }
    .comp-cal-nav:hover { background: var(--tui-primary); color: white; border-color: var(--tui-primary); }
    .comp-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .comp-cal-dayhdr {
      text-align: center; font-size: 9px; font-weight: 700;
      color: var(--text-muted); padding: 3px 0 4px;
      text-transform: uppercase; letter-spacing: .03em;
    }
    .comp-cal-cell {
      text-align: center; font-size: 11px; padding: 5px 2px;
      border-radius: 8px; cursor: default; color: var(--text);
      transition: background .1s, color .1s; user-select: none;
    }
    .comp-cal-other { color: var(--text-muted); opacity: .3; }
    .comp-cal-dayhdr.weekend { color: #dc2626; }
    .comp-cal-cell.weekend { color: #dc2626; }
    .comp-cal-inrange { cursor: pointer; }
    .comp-cal-inrange:not(.comp-cal-sel):hover { background: rgba(57,169,0,.12); color: #2d8500; }
    /* Días de clase ya asignados a OTRO resultado — tachados y no clicables,
       para que no se puedan volver a elegir por error. */
    .r-cal-ocupado {
      text-decoration: line-through; cursor: not-allowed;
      color: var(--text-muted); background: var(--surface2); opacity: .6;
    }
    .r-cal-allowed { cursor: pointer; background: rgba(57,169,0,.08); font-weight: 600; color: #2d8500; }
    .r-cal-allowed:hover { background: rgba(57,169,0,.16); }
    .r-cal-inrange { cursor: pointer; background: rgba(57,169,0,.22); color: #226600; }
    .r-cal-boundary {
      cursor: pointer;
      background: var(--tui-primary) !important; color: white !important;
      font-weight: 700; border-radius: 8px;
    }
    .comp-cal-boundary {
      cursor: pointer;
      background: #fff7ed; color: #c2410c;
      font-weight: 700; outline: 2px solid #fed7aa; outline-offset: -2px;
      border-radius: 8px;
    }
    .comp-cal-boundary:hover:not(.comp-cal-sel) { background: #ffedd5; }
    .comp-cal-sel {
      background: var(--tui-primary) !important; color: white !important;
      font-weight: 700; box-shadow: 0 1px 4px rgba(57,169,0,.35);
      outline: none !important;
    }
    .comp-cal-total {
      display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
      font-size: 11px; color: var(--text-muted);
      border-top: 1px solid var(--border); padding-top: 7px; margin-top: 7px;
    }
    .comp-cal-total strong { color: var(--text); }

    .comp-cal-hint {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; color: var(--text-muted); font-style: italic;
      margin-bottom: 8px; padding: 5px 8px;
      border-radius: 6px; background: var(--surface2);
    }

    /* Cada resultado funciona como su propia "pestaña" del calendario único
       de fechas — se resalta el que está activo para que quede claro a cuál
       resultado se le están asignando los días marcados abajo. */
    .resultado-row {
      border: 1.5px solid var(--border); border-radius: 8px;
      padding: 8px; margin-bottom: 8px; transition: border-color .15s, background .15s;
    }
    .resultado-activo {
      border-color: var(--tui-primary);
      background: rgba(57,169,0,.05);
    }
  `],
})
export class NuevaCompetenciaModalComponent {
  @Output() guardado = new EventEmitter<void>();

  compModal = signal<any>(null);
  compForm: any = {};
  compResultados = signal<Resultado[]>([]);
  compDiasClase = signal<string[]>([]);
  compCalMes   = signal<Date>(new Date());
  /** Índice del resultado al que el calendario único de fechas está editando actualmente. */
  resultadoActivo = signal<number | null>(null);
  rCalMes     = signal<Date>(new Date());

  constructor(private horariosApi: HorariosApiService, private toast: ToastService) {}

  abrir(h: any) {
    this.compModal.set(h);
    this.compForm = { asignacionId: h.id };
    this.compResultados.set([{ texto: '', fechaInicio: null, fechaFin: null }]);
    this.compDiasClase.set([]);
    this.compCalMes.set(new Date());
    this.rCalMes.set(new Date());
    this.resultadoActivo.set(0);
  }

  cerrar() {
    this.compModal.set(null);
  }

  addCompResultado() {
    this.compResultados.set([...this.compResultados(), { texto: '', fechaInicio: null, fechaFin: null }]);
    // Selecciona automáticamente el resultado recién creado — es el que
    // normalmente se quiere editar a continuación.
    this.seleccionarResultado(this.compResultados().length - 1);
  }

  removeCompResultado(i: number) {
    const nuevos = this.compResultados().filter((_, idx) => idx !== i);
    this.compResultados.set(nuevos);
    const activo = this.resultadoActivo();
    if (activo === null) return;
    if (!nuevos.length) { this.resultadoActivo.set(null); return; }
    if (activo === i || activo >= nuevos.length) this.resultadoActivo.set(Math.min(activo, nuevos.length - 1));
  }

  resultadoActivoLabel(): string {
    const idx = this.resultadoActivo();
    if (idx === null) return '';
    const r = this.compResultados()[idx];
    return r?.texto?.trim() || `Resultado ${idx + 1}`;
  }

  setCompResultado(i: number, texto: string) {
    const arr = [...this.compResultados()];
    arr[i] = { ...arr[i], texto };
    this.compResultados.set(arr);
  }

  /** Días permitidos para las fechas de un resultado: los ya asignados a la competencia */
  resultadoDiasPermitidos(): string[] {
    return [...this.compDiasClase()].sort();
  }

  /** Selecciona qué resultado edita el calendario único de fechas y reubica el mes visible. */
  seleccionarResultado(i: number) {
    const permitidos = this.resultadoDiasPermitidos();
    const r = this.compResultados()[i];
    const ref = r?.fechaInicio ?? permitidos[0];
    if (ref) {
      const d = new Date(ref + 'T00:00:00');
      this.rCalMes.set(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    this.resultadoActivo.set(i);
  }

  formatRCalMes(): string {
    const m = this.rCalMes();
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${meses[m.getMonth()]} ${m.getFullYear()}`;
  }

  private _rCalLimites(): { min: Date; max: Date } | null {
    const permitidos = this.resultadoDiasPermitidos();
    if (!permitidos.length) return null;
    return {
      min: new Date(permitidos[0] + 'T00:00:00'),
      max: new Date(permitidos[permitidos.length - 1] + 'T00:00:00'),
    };
  }

  rCalPrevMes() {
    const lim = this._rCalLimites();
    const m = this.rCalMes();
    if (lim && m.getFullYear() === lim.min.getFullYear() && m.getMonth() === lim.min.getMonth()) return;
    this.rCalMes.set(new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }

  rCalNextMes() {
    const lim = this._rCalLimites();
    const m = this.rCalMes();
    if (lim && m.getFullYear() === lim.max.getFullYear() && m.getMonth() === lim.max.getMonth()) return;
    this.rCalMes.set(new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }

  /** Días de clase ya reservados por OTROS resultados (no el activo) — no deben poder volver a elegirse. */
  private diasOcupadosPorOtros(idxActivo: number): Set<string> {
    const ocupados = new Set<string>();
    const diasClase = this.compDiasClase();
    this.compResultados().forEach((r, idx) => {
      if (idx === idxActivo || !r.fechaInicio || !r.fechaFin) return;
      diasClase.forEach(iso => {
        if (iso >= r.fechaInicio! && iso <= r.fechaFin!) ocupados.add(iso);
      });
    });
    return ocupados;
  }

  rCalCeldas(): { day: number; iso: string; allowed: boolean; ocupado: boolean; inRange: boolean; isIni: boolean; isFin: boolean; otherMonth: boolean }[] {
    const i = this.resultadoActivo();
    const mes = this.rCalMes();
    const year = mes.getFullYear();
    const month = mes.getMonth();
    const permitidos = new Set(this.resultadoDiasPermitidos());
    const ocupados = i !== null ? this.diasOcupadosPorOtros(i) : new Set<string>();
    const r = i !== null ? this.compResultados()[i] : null;
    const ini = r?.fechaInicio ?? '';
    const fin = r?.fechaFin ?? '';
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const cells: ReturnType<typeof this.rCalCeldas> = [];

    const startDow = (firstDay.getDay() + 6) % 7;
    for (let d = startDow - 1; d >= 0; d--) {
      const date = new Date(year, month, -d);
      cells.push({ day: date.getDate(), iso: this._isoDate(date), allowed: false, ocupado: false, inRange: false, isIni: false, isFin: false, otherMonth: true });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const iso = this._isoDate(date);
      const ocupado = ocupados.has(iso);
      cells.push({
        day: d, iso, allowed: permitidos.has(iso) && !ocupado, ocupado,
        inRange: !!(ini && fin && iso >= ini && iso <= fin),
        isIni: iso === ini, isFin: iso === fin, otherMonth: false,
      });
    }
    let after = 1;
    while (cells.length < 42) {
      const date = new Date(year, month + 1, after++);
      cells.push({ day: date.getDate(), iso: this._isoDate(date), allowed: false, ocupado: false, inRange: false, isIni: false, isFin: false, otherMonth: true });
    }
    return cells;
  }

  pickRCalDay(iso: string) {
    const i = this.resultadoActivo();
    if (i === null) return;
    const arr = [...this.compResultados()];
    const actual = { ...arr[i] };
    if (!actual.fechaInicio || (actual.fechaInicio && actual.fechaFin)) {
      actual.fechaInicio = iso;
      actual.fechaFin = null;
    } else if (iso < actual.fechaInicio) {
      actual.fechaInicio = iso;
      actual.fechaFin = null;
    } else {
      actual.fechaFin = iso;
    }
    arr[i] = actual;
    this.compResultados.set(arr);
  }

  compFormValid(): boolean {
    const f = this.compForm;
    if (!f.nombre?.trim() || !f.fechaInicio || !f.fechaFin) return false;
    return this.compResultados().every(r => r.texto?.trim());
  }

  async saveComp() {
    if (!this.compFormValid()) return;
    const resultados = this.compResultados()
      .map(r => ({ ...r, texto: r.texto.trim() }))
      .filter(r => r.texto);
    const body = { ...this.compForm, resultados, diasClase: this.compDiasClase().length ? this.compDiasClase() : null };
    try {
      await this.horariosApi.createCompetencia(body);
      this.compModal.set(null);
      this.guardado.emit();
      this.toast.ok('Competencia registrada', 'La competencia fue añadida al horario correctamente.');
    } catch (e: any) {
      this.toast.error('Error al guardar competencia', e?.error?.message ?? 'No se pudo registrar la competencia.');
    }
  }

  onCompFechaInicioChange(val: string) {
    this.compForm = { ...this.compForm, fechaInicio: val };
    if (val) {
      const d = new Date(val + 'T00:00:00');
      this.compCalMes.set(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    this._limpiarDiasFueraRango();
  }

  onCompFechaFinChange(val: string) {
    this.compForm = { ...this.compForm, fechaFin: val };
    this._limpiarDiasFueraRango();
  }

  private _limpiarDiasFueraRango() {
    const ini = this.compForm.fechaInicio ?? '';
    const fin = this.compForm.fechaFin ?? '';
    if (!ini || !fin) return;
    this.compDiasClase.update(dias => dias.filter(d => d >= ini && d <= fin));
  }

  /** Celdas del mes actual para el mini-calendario */
  compCalCeldas(): { day: number; iso: string; inRange: boolean; isIni: boolean; isFin: boolean; otherMonth: boolean }[] {
    const mes   = this.compCalMes();
    const year  = mes.getFullYear();
    const month = mes.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const ini = this.compForm.fechaInicio ?? '';
    const fin = this.compForm.fechaFin   ?? '';
    const cells: { day: number; iso: string; inRange: boolean; isIni: boolean; isFin: boolean; otherMonth: boolean }[] = [];

    const startDow = (firstDay.getDay() + 6) % 7;
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      cells.push({ day: d.getDate(), iso: this._isoDate(d), inRange: false, isIni: false, isFin: false, otherMonth: true });
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const iso  = this._isoDate(date);
      const inRange = !!(ini && fin && iso >= ini && iso <= fin);
      cells.push({ day: d, iso, inRange, isIni: iso === ini, isFin: iso === fin, otherMonth: false });
    }
    let after = 1;
    while (cells.length < 42) {
      const d = new Date(year, month + 1, after++);
      cells.push({ day: d.getDate(), iso: this._isoDate(d), inRange: false, isIni: false, isFin: false, otherMonth: true });
    }
    return cells;
  }

  /* ── Helpers de fecha para <app-date-input> (trabaja con TuiDay, el form guarda ISO) ── */
  // Cacheado por string ISO: sin cachear, cada llamada devolvía un TuiDay NUEVO
  // para la misma fecha lógica y <app-date-input> lo trataba como un cambio
  // real, reemitiendo (ngModelChange) y disparando un loop infinito de CD que
  // congelaba la pestaña (mismo bug ya corregido en programador-eventos.component.ts).
  private readonly dateValCache = new Map<string, TuiDay>();

  dateVal(iso: string | null | undefined): TuiDay | null {
    if (!iso) return null;
    const key = iso.substring(0, 10);
    const parts = key.split('-');
    if (parts.length !== 3) return null;
    let day = this.dateValCache.get(key);
    if (!day) {
      day = new TuiDay(+parts[0], +parts[1] - 1, +parts[2]);
      this.dateValCache.set(key, day);
    }
    return day;
  }

  tuiDayToISO(day: TuiDay | null): string {
    if (!day) return '';
    const m = String(day.month + 1).padStart(2, '0');
    const d = String(day.day).padStart(2, '0');
    return `${day.year}-${m}-${d}`;
  }

  isWeekendIso(iso: string): boolean {
    const dow = new Date(iso + 'T00:00:00').getDay();
    return dow === 0 || dow === 6;
  }

  private _isoDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  formatCompCalMes(): string {
    const m = this.compCalMes();
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${meses[m.getMonth()]} ${m.getFullYear()}`;
  }

  compCalPrevMes() {
    const m   = this.compCalMes();
    const ini = this.compForm.fechaInicio;
    if (ini) {
      const iniD = new Date(ini + 'T00:00:00');
      if (m.getFullYear() === iniD.getFullYear() && m.getMonth() === iniD.getMonth()) return;
    }
    this.compCalMes.set(new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }

  compCalNextMes() {
    const m   = this.compCalMes();
    const fin = this.compForm.fechaFin;
    if (fin) {
      const finD = new Date(fin + 'T00:00:00');
      if (m.getFullYear() === finD.getFullYear() && m.getMonth() === finD.getMonth()) return;
    }
    this.compCalMes.set(new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }

  toggleDiaClase(iso: string) {
    this.compDiasClase.update(dias => {
      const arr = [...dias];
      const idx = arr.indexOf(iso);
      if (idx > -1) arr.splice(idx, 1);
      else arr.push(iso);
      arr.sort();
      return arr;
    });
  }

  private _formatHoras(totalMin: number): string {
    const h = totalMin / 60;
    return Number.isInteger(h) ? String(h) : h.toFixed(1);
  }

  /** Horas acumuladas en el formulario del modal (usa dias seleccionados + horario actual) */
  calcHorasFormModal(): string {
    const dias = this.compDiasClase().length;
    if (!dias) return '0';
    return this._formatHoras(dias * durHorarioMin(this.compModal()));
  }

  /** Formatea fecha ISO como "Viernes: 12/04" (nombre completo + fecha) */
  formatDiaClaseFull(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    return `${dias[date.getDay()]}: ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`;
  }
}
