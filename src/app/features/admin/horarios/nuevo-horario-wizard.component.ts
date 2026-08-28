import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { HorariosApiService } from '../../../core/services/horarios/horarios-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { TimeInputComponent } from '../../../shared/components/time-input.component';
import { DIAS_SEMANA, DIAS_LABELS } from '../../../core/utils/horarios.util';

const JORNADAS = [
  { key: 'manana', label: 'Mañana (07:00–12:00)', inicio: '07:00', fin: '12:00' },
  { key: 'tarde', label: 'Tarde (13:00–17:00)', inicio: '13:00', fin: '17:00' },
  { key: 'noche', label: 'Noche (18:00–20:00)', inicio: '18:00', fin: '20:00' },
];

interface DiaConfig {
  areaFiltro: string;
  fichaId: string | number;
  ambienteId: string | number;
  instructorId: string | number;
}

/**
 * Modal "Nuevo Horario" — extraído de horarios.component.ts. Es agnóstico
 * del tab activo (instructor/ficha/ambiente): siempre crea un horario con
 * instructor+ficha+ambiente juntos vía POST /horarios/batch.
 * Se abre vía referencia de plantilla: `<app-nuevo-horario-wizard #wiz />`
 * y `(click)="wiz.abrir()"` (o `wiz.abrir(prefill)` desde disponibilidad).
 */
@Component({
  selector: 'app-nuevo-horario-wizard',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, SearchableSelectComponent, TimeInputComponent],
  template: `
    @if (showModal()) {
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="wizard-modal" (click)="$event.stopPropagation()">

        <!-- Cabecera -->
        <div class="wiz-header">
          <div>
            <h3 class="wiz-title">Nuevo Horario</h3>
            <p class="wiz-subtitle">Selecciona los días y configura ficha, instructor y ambiente para cada uno</p>
          </div>
          <button class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" (click)="showModal.set(false)">
            <lucide-icon name="x" [size]="20"></lucide-icon>
          </button>
        </div>

        <!-- Fila global: jornada + horas -->
        <div class="wiz-top-bar">
          <div class="wiz-top-field" style="min-width:220px; flex:1.2;">
            <label class="block text-xs font-semibold text-gray-600 mb-1">Jornada *</label>
            <app-ss [options]="jornadaOpts" placeholder="Seleccionar jornada..."
                    [(ngModel)]="wizardForm.jornada"
                    (ngModelChange)="onWizardJornadaChange()"></app-ss>
          </div>
          <div class="wiz-top-field" style="min-width:130px;">
            <label class="block text-xs font-semibold text-gray-600 mb-1">Hora inicio</label>
            <app-time-input [(ngModel)]="wizardForm.horaInicio"
                   (ngModelChange)="onHoraInicioChange($event)"></app-time-input>
          </div>
          <div class="wiz-top-field" style="min-width:130px;">
            <label class="block text-xs font-semibold text-gray-600 mb-1">Hora fin</label>
            <app-time-input [(ngModel)]="wizardForm.horaFin"
                   (ngModelChange)="onHoraFinChange()"></app-time-input>
          </div>
          <!-- Indicador de jornada detectada por horas -->
          @if (wizardForm.horaInicio) {
            <div [class]="'jornada-det-badge ' + (abarcaDosJornadas() ? 'jornada-det-span' : 'jornada-det-ok')">
              <lucide-icon [name]="abarcaDosJornadas() ? 'alert-triangle' : 'clock'" [size]="12"></lucide-icon>
              <div>
                <div>Jornada: <strong>{{ jornadaDetectadaLabel() }}</strong></div>
                @if (abarcaDosJornadas()) {
                  <div style="font-size:10px;opacity:.85;">El horario abarca dos jornadas</div>
                }
              </div>
            </div>
          }
          <!-- Resumen de días seleccionados -->
          <div class="wiz-dias-badge" style="margin-left:auto; align-self:flex-end; padding-bottom:2px;">
            @if (wizardForm.dias.length > 0) {
              <span class="wiz-sel-count">{{ wizardForm.dias.length }} día{{ wizardForm.dias.length !== 1 ? 's' : '' }} seleccionado{{ wizardForm.dias.length !== 1 ? 's' : '' }}</span>
            } @else {
              <span class="wiz-sel-hint">Activa los días en la tabla</span>
            }
          </div>
        </div>

        <!-- Tabla de días -->
        <div class="wiz-table-wrap">
          <table class="wiz-table">
            <thead>
              <tr>
                <th class="wt-th-dia">Día</th>
                <th class="wt-th-area">
                  <span>Área <span class="wt-th-hint">(filtro)</span></span>
                  <label class="wt-apply-all">
                    <input type="checkbox" [checked]="applyAll.area" (change)="onToggleApplyAll('area', $event)">
                    <span>Aplicar a todos</span>
                  </label>
                </th>
                <th class="wt-th-ficha">
                  <span>Ficha</span>
                  <label class="wt-apply-all">
                    <input type="checkbox" [checked]="applyAll.ficha" (change)="onToggleApplyAll('ficha', $event)">
                    <span>Aplicar a todos</span>
                  </label>
                </th>
                <th class="wt-th-inst">
                  <span>Instructor</span>
                  <label class="wt-apply-all">
                    <input type="checkbox" [checked]="applyAll.instructor" (change)="onToggleApplyAll('instructor', $event)">
                    <span>Aplicar a todos</span>
                  </label>
                </th>
                <th class="wt-th-amb">
                  <span>Ambiente</span>
                  <label class="wt-apply-all">
                    <input type="checkbox" [checked]="applyAll.ambiente" (change)="onToggleApplyAll('ambiente', $event)">
                    <span>Aplicar a todos</span>
                  </label>
                </th>
              </tr>
            </thead>
            <tbody>
              @for (d of dias; track d) {
              @let activo = wizardForm.dias.includes(d);
              <tr class="wt-row" [class.wt-row-on]="activo" [class.wt-row-off]="!activo">
                <!-- Día -->
                <td class="wt-td-dia">
                  <label class="wt-day-label" [class.wt-day-on]="activo">
                    <input type="checkbox" class="wt-checkbox"
                           [checked]="activo"
                           (change)="toggleWizardDay(d)">
                    <span class="wt-day-name">{{ LABELS[d] }}</span>
                  </label>
                </td>
                @if (activo) {
                <!-- Área filtro -->
                <td class="wt-td">
                  <app-ss [options]="fichaAreasOpts()"
                          placeholder="Todas las áreas"
                          [(ngModel)]="wizardForm.diasConfig[d].areaFiltro"
                          (ngModelChange)="onWizardAreaChange(d)"></app-ss>
                </td>
                <!-- Ficha -->
                <td class="wt-td">
                  <app-ss [options]="getFichasOpts(d)"
                          placeholder="Seleccionar ficha..."
                          [(ngModel)]="wizardForm.diasConfig[d].fichaId"
                          (ngModelChange)="onFichaChange(d, $event)"></app-ss>
                </td>
                <!-- Instructor -->
                <td class="wt-td">
                  <app-ss [options]="instructoresOpts()"
                          placeholder="Seleccionar instructor..."
                          [(ngModel)]="wizardForm.diasConfig[d].instructorId"
                          (ngModelChange)="onInstructorChange(d, $event)"></app-ss>
                </td>
                <!-- Ambiente -->
                <td class="wt-td">
                  @if (!isInstructorTransversal(d)) {
                    <app-ss [options]="getAmbientesOpts(d)"
                            placeholder="Seleccionar ambiente..."
                            [(ngModel)]="wizardForm.diasConfig[d].ambienteId"
                            (ngModelChange)="onAmbienteChange(d, $event)"></app-ss>
                  } @else {
                    <div class="wt-transversal-pill">
                      <lucide-icon name="shuffle" [size]="11"></lucide-icon>
                      Transversal — se asigna al iniciar
                    </div>
                  }
                </td>
                } @else {
                <!-- Fila desactivada -->
                <td class="wt-td-off" colspan="4">
                  <span class="wt-off-hint">Activa el día para configurar</span>
                </td>
                }
              </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Error + botones -->
        @if (formError()) { <div class="error-msg" style="margin:12px 24px 0;">{{ formError() }}</div> }
        <div class="wiz-footer">
          <button class="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-2 transition-all" (click)="showModal.set(false)">Cancelar</button>
          <button class="bg-sena-gradient hover:opacity-90 text-white font-semibold rounded-xl px-5 py-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2" (click)="saveWizardHorarios()" [disabled]="saving() || !esWizardValido()">
            @if (saving()) { <lucide-icon name="loader" [size]="14" class="spin"></lucide-icon> Guardando... }
            @else { <lucide-icon name="save" [size]="14"></lucide-icon> Guardar Horarios }
          </button>
        </div>
      </div>
    </div>
    }
  `,
  styleUrls: ['./nuevo-horario-wizard.component.css'],
})
export class NuevoHorarioWizardComponent {
  @Input() fichas: any[] = [];
  @Input() ambientes: any[] = [];
  @Input() instructores: any[] = [];
  @Input() horarios: any[] = [];
  @Output() guardado = new EventEmitter<void>();

  readonly dias = [...DIAS_SEMANA] as string[];
  readonly LABELS = DIAS_LABELS;

  showModal = signal(false);
  saving = signal(false);
  formError = signal('');

  /** Controla qué columnas del wizard se "aplican a todos los días" */
  applyAll = { area: false, ficha: false, instructor: false, ambiente: false };

  wizardForm: {
    jornada: string;
    horaInicio: string;
    horaFin: string;
    dias: string[];
    diasConfig: Record<string, DiaConfig>;
  } = { jornada: '', horaInicio: '', horaFin: '', dias: [], diasConfig: {} };

  constructor(
    private horariosApi: HorariosApiService,
    private toast: ToastService,
  ) {
    this.resetForm();
  }

  /** Jornadas disponibles */
  readonly jornadaOpts: SSOption[] = [
    { value: 'manana', label: 'Mañana (07:00–12:00)' },
    { value: 'tarde',  label: 'Tarde (13:00–17:00)' },
    { value: 'noche',  label: 'Noche (18:00–20:00)' },
  ];

  /** Áreas de ficha con opción "Todas" */
  fichaAreasOpts = computed<SSOption[]>(() => [
    { value: '', label: 'Todas las áreas' },
    ...this.fichaAreas().map(a => ({ value: a, label: a })),
  ]);

  /** Instructores */
  instructoresOpts = computed<SSOption[]>(() =>
    (this.instructores ?? []).map(i => ({
      value: i.id,
      label: `${i.nombre} ${i.apellido}${i.esTransversal ? ' · Transversal' : ''}`,
    }))
  );

  /** Fichas filtradas por área para un día del wizard */
  getFichasOpts(dia: string): SSOption[] {
    return this.getFichasFiltradas(dia).map(f => ({
      value: f.id,
      label: `${f.codigo} — ${f.programa}`,
    }));
  }

  /** Ambientes filtrados para un día del wizard (con disabled si ocupado) */
  getAmbientesOpts(dia: string): SSOption[] {
    return this.getAmbientesFiltrados(dia).map(a => ({
      value: a.id,
      label: a.nombre,
      disabled: this.isWizardAmbienteOcupado(a.id, dia),
    }));
  }

  /**
   * Áreas disponibles para el filtro del wizard (ficha + ambiente).
   * No existe endpoint /formativo/areas (getAreas()) — se deriva 100% del
   * cliente combinando el campo `.area` de erpCatalogo.getFichas() y de
   * erpCatalogo.getAmbientes().
   */
  fichaAreas = computed(() => {
    const areas = new Set<string>();
    (this.fichas ?? []).forEach((f: any) => { if (f.area) areas.add(f.area); });
    (this.ambientes ?? []).forEach((a: any) => { if (a.area) areas.add(a.area); });
    return [...areas].sort() as string[];
  });

  getFichasFiltradas(dia: string): any[] {
    const cfg = this.wizardForm.diasConfig[dia];
    if (!cfg?.areaFiltro) return this.fichas ?? [];
    return (this.fichas ?? []).filter((f: any) => f.area === cfg.areaFiltro);
  }

  getAmbientesFiltrados(dia: string): any[] {
    const cfg = this.wizardForm.diasConfig[dia];
    if (!cfg?.areaFiltro) return this.ambientes ?? [];
    return (this.ambientes ?? []).filter((a: any) => a.area === cfg.areaFiltro);
  }

  onWizardAreaChange(dia: string) {
    const cfg = this.wizardForm.diasConfig[dia];
    if (cfg) {
      cfg.fichaId   = '';
      cfg.ambienteId = '';
    }
    // Propagar a todos los días activos si "Aplicar a todos" está marcado
    if (this.applyAll.area) {
      const val = cfg?.areaFiltro ?? '';
      this.wizardForm.dias.forEach(d => {
        if (d !== dia) {
          this.wizardForm.diasConfig[d].areaFiltro  = val;
          this.wizardForm.diasConfig[d].fichaId      = '';
          this.wizardForm.diasConfig[d].ambienteId   = '';
        }
      });
    }
  }

  onFichaChange(dia: string, val: any) {
    if (this.applyAll.ficha) {
      this.wizardForm.dias.forEach(d => {
        this.wizardForm.diasConfig[d].fichaId = val;
      });
    }
  }

  onAmbienteChange(dia: string, val: any) {
    if (this.applyAll.ambiente) {
      this.wizardForm.dias.forEach(d => {
        if (!this.isInstructorTransversal(d)) {
          this.wizardForm.diasConfig[d].ambienteId = val;
        }
      });
    }
  }

  /** Activa/desactiva "Aplicar a todos" para una columna y propaga el valor del primer día activo */
  onToggleApplyAll(field: 'area' | 'ficha' | 'instructor' | 'ambiente', event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.applyAll[field] = checked;
    if (!checked || !this.wizardForm.dias.length) return;

    const firstDay = this.wizardForm.dias[0];
    const cfg = this.wizardForm.diasConfig[firstDay];
    if (!cfg) return;

    switch (field) {
      case 'area': {
        const val = cfg.areaFiltro;
        this.wizardForm.dias.forEach(d => {
          this.wizardForm.diasConfig[d].areaFiltro  = val;
          this.wizardForm.diasConfig[d].fichaId      = '';
          this.wizardForm.diasConfig[d].ambienteId   = '';
        });
        break;
      }
      case 'ficha': {
        const val = cfg.fichaId;
        if (!val) break;
        this.wizardForm.dias.forEach(d => { this.wizardForm.diasConfig[d].fichaId = val; });
        break;
      }
      case 'instructor': {
        const val = cfg.instructorId;
        if (!val) break;
        // UUID string — NO usar +val (produciría NaN)
        const instr = (this.instructores ?? []).find(i => String(i.id) === String(val));
        this.wizardForm.dias.forEach(d => {
          this.wizardForm.diasConfig[d].instructorId = val;
          if (instr?.esTransversal) this.wizardForm.diasConfig[d].ambienteId = '';
        });
        break;
      }
      case 'ambiente': {
        const val = cfg.ambienteId;
        if (!val) break;
        this.wizardForm.dias.forEach(d => {
          if (!this.isInstructorTransversal(d)) {
            this.wizardForm.diasConfig[d].ambienteId = val;
          }
        });
        break;
      }
    }
  }

  // Wizard Logic
  onWizardJornadaChange() {
    const j = JORNADAS.find(x => x.key === this.wizardForm.jornada);
    if (j) {
      this.wizardForm.horaInicio = j.inicio;
      this.wizardForm.horaFin = j.fin;
    }
  }

  /**
   * Infiere la jornada a partir de horaInicio:
   *   06:00–12:59 → manana  |  13:00–17:59 → tarde  |  18:00+ → noche
   */
  detectarJornada(hora: string): string {
    if (!hora) return '';
    const [hh, mm] = hora.split(':').map(Number);
    const min = hh * 60 + (mm || 0);
    if (min >= 6 * 60  && min < 13 * 60) return 'manana';
    if (min >= 13 * 60 && min < 18 * 60) return 'tarde';
    if (min >= 18 * 60)                   return 'noche';
    return '';
  }

  jornadaDetectadaLabel(): string {
    const j = this.detectarJornada(this.wizardForm.horaInicio);
    return ({ manana: 'Mañana (6 am – 1 pm)', tarde: 'Tarde (1 pm – 6 pm)', noche: 'Noche (6 pm – 6 am)' } as any)[j] ?? '—';
  }

  abarcaDosJornadas(): boolean {
    const ini = this.detectarJornada(this.wizardForm.horaInicio);
    if (!ini || !this.wizardForm.horaFin) return false;
    const [hh, mm] = this.wizardForm.horaFin.split(':').map(Number);
    const finMin = hh * 60 + (mm || 0);
    // "Dos jornadas" solo cuando horaFin SUPERA ESTRICTAMENTE el límite de la jornada actual
    // Mañana  → límite 13:00 (tarde empieza a las 13:00)
    // Tarde   → límite 18:00 (noche empieza a las 18:00)
    // Noche   → el rango cruza medianoche; es dos jornadas si horaFin entra en zona de día (06:00-17:59)
    if (ini === 'manana') return finMin > 13 * 60;
    if (ini === 'tarde')  return finMin > 18 * 60;
    if (ini === 'noche')  return finMin >= 6 * 60 && finMin < 18 * 60; // 06:00-17:59 = cruzó a mañana/tarde
    return false;
  }

  /** Cuando el usuario cambia la hora de inicio → auto-actualiza la jornada */
  onHoraInicioChange(val: string) {
    const detected = this.detectarJornada(val ?? this.wizardForm.horaInicio);
    if (detected) this.wizardForm.jornada = detected;
  }

  /** Cuando cambia la hora de fin → solo re-evalúa si abarca dos jornadas (badge en template) */
  onHoraFinChange() {
    // La detección de jornada siempre viene del inicio; aquí solo forzamos re-renderizado
    // del badge de advertencia. Angular detecta el cambio automáticamente.
  }

  toggleWizardDay(d: string) {
    const idx = this.wizardForm.dias.indexOf(d);
    if (idx > -1) {
      // Desmarcar: solo quita del array, conserva la config por si el usuario lo reactiva
      this.wizardForm.dias.splice(idx, 1);
    } else {
      this.wizardForm.dias.push(d);
      if (!this.wizardForm.diasConfig[d]) {
        this.wizardForm.diasConfig[d] = { areaFiltro: '', fichaId: '', ambienteId: '', instructorId: '' };
      }
      // Auto-rellenar desde otro día activo si "Aplicar a todos" está activado en alguna columna
      const refDay = this.wizardForm.dias.find(dd => dd !== d);
      if (refDay) {
        const refCfg = this.wizardForm.diasConfig[refDay];
        const dCfg   = this.wizardForm.diasConfig[d];
        if (this.applyAll.area)       { dCfg.areaFiltro   = refCfg.areaFiltro; }
        if (this.applyAll.ficha)      { dCfg.fichaId       = refCfg.fichaId; }
        if (this.applyAll.instructor) { dCfg.instructorId  = refCfg.instructorId; }
        if (this.applyAll.ambiente && !this.isInstructorTransversal(d)) {
          dCfg.ambienteId = refCfg.ambienteId;
        }
      }
    }
  }

  isWizardAmbienteOcupado(ambienteId: string, dia: string): boolean {
    if (!this.wizardForm.jornada) return false;
    // UUID string — NO usar +ambienteId (produciría NaN)
    return (this.horarios ?? []).some(h =>
      String(h.ambienteId) === String(ambienteId) &&
      h.diaSemana === dia &&
      h.jornada === this.wizardForm.jornada
    );
  }

  /** Devuelve true si el instructor seleccionado para ese día es transversal */
  isInstructorTransversal(dia: string): boolean {
    const cfg = this.wizardForm.diasConfig[dia];
    if (!cfg?.instructorId) return false;
    const instr = (this.instructores ?? []).find(i => String(i.id) === String(cfg.instructorId));
    return !!instr?.esTransversal;
  }

  /** Al cambiar instructor, limpia ambiente si el nuevo es transversal; propaga si applyAll.instructor */
  onInstructorChange(dia: string, instructorId: any) {
    const instr = (this.instructores ?? []).find(i => String(i.id) === String(instructorId));
    if (instr?.esTransversal) {
      this.wizardForm.diasConfig[dia].ambienteId = '';
    }
    if (this.applyAll.instructor) {
      this.wizardForm.dias.forEach(d => {
        if (d !== dia) {
          this.wizardForm.diasConfig[d].instructorId = instructorId;
          if (instr?.esTransversal) this.wizardForm.diasConfig[d].ambienteId = '';
        }
      });
    }
  }

  esWizardValido(): boolean {
    if (!this.wizardForm.jornada || this.wizardForm.dias.length === 0) return false;
    for (const d of this.wizardForm.dias) {
      const config = this.wizardForm.diasConfig[d];
      if (!config || !config.fichaId || !config.instructorId) return false;
      // Ambiente requerido sólo para instructores no-transversales
      if (!this.isInstructorTransversal(d) && !config.ambienteId) return false;
    }
    return true;
  }

  /**
   * Abre el modal. `prefill` viene del panel de disponibilidad de ambientes
   * (click en un ambiente disponible) — precarga jornada/día/ambiente/área.
   */
  abrir(prefill?: { dia: string; jornada: string; ambienteId: string; areaFiltro: string }): void {
    this.resetForm();
    this.formError.set('');
    if (prefill) {
      this.wizardForm.jornada = prefill.jornada;
      this.onWizardJornadaChange();
      if (prefill.dia) {
        this.wizardForm.dias = [prefill.dia];
        this.wizardForm.diasConfig[prefill.dia] = {
          areaFiltro: prefill.areaFiltro ?? '',   // pre-rellena área → filtra fichas y ambientes automáticamente
          fichaId: '',
          ambienteId: prefill.ambienteId,
          instructorId: ''
        };
      }
    }
    this.showModal.set(true);
  }

  resetForm() {
    // Resetear "aplicar a todos"
    this.applyAll = { area: false, ficha: false, instructor: false, ambiente: false };
    // Pre-inicializar config para todos los días (necesario para la tabla)
    const diasConfig: Record<string, DiaConfig> = {};
    this.dias.forEach(d => {
      diasConfig[d] = { areaFiltro: '', fichaId: '', ambienteId: '', instructorId: '' };
    });
    this.wizardForm = {
      jornada: '',
      horaInicio: '',
      horaFin: '',
      dias: [],
      diasConfig,
    };
  }

  /** Usa el endpoint dedicado POST /horarios/batch (horariosApi.createHorariosBatch). */
  async saveWizardHorarios() {
    if (!this.esWizardValido()) return;

    this.saving.set(true);
    this.formError.set('');

    // Obtener las horas por defecto de la jornada seleccionada
    const jornadaData = JORNADAS.find(j => j.key === this.wizardForm.jornada);

    const diasPayload = this.wizardForm.dias.map(d => {
      const transversal = this.isInstructorTransversal(d);
      const cfg = this.wizardForm.diasConfig[d];
      return {
        diaSemana: d,
        jornada:    this.wizardForm.jornada,
        // Si el wizard no tiene hora manual, usar la hora predefinida de la jornada
        horaInicio: this.wizardForm.horaInicio || jornadaData?.inicio || '07:00',
        horaFin:    this.wizardForm.horaFin    || jornadaData?.fin    || '12:00',
        // UUIDs: NO usar + (convertiría a NaN), pasar como string o null
        fichaId:      cfg.fichaId      || null,
        ambienteId:   transversal ? null : (cfg.ambienteId || null),
        instructorId: cfg.instructorId || null,
      };
    });

    const count = this.wizardForm.dias.length;
    try {
      await this.horariosApi.createHorariosBatch(diasPayload);
      this.saving.set(false);
      this.showModal.set(false);
      this.guardado.emit();
      this.toast.ok(
        'Horarios creados',
        `Se registraron ${count} horario${count !== 1 ? 's' : ''} correctamente.`,
      );
    } catch (e: any) {
      this.saving.set(false);
      const msg: string = e?.error?.message ?? 'No se pudo guardar el horario. Verifica los datos e intenta de nuevo.';
      this.toast.error('Error al crear horarios', msg);
    }
  }
}
