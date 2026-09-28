import { Component, EventEmitter, Output, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { HorariosApiService } from '../data-access/horarios-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { TimeInputComponent } from '../../../shared/components/time-input.component';
import { DIAS_SEMANA, DIAS_LABELS, to12h, nombreCompleto } from '../../../core/utils/horarios.util';

const JORNADA_LABELS: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };

/** Misma regla que el wizard de creación: 06:00–12:59 mañana, 13:00–17:59 tarde, 18:00+ noche. */
function detectarJornada(hora: string): string {
  if (!hora) return '';
  const [hh, mm] = hora.split(':').map(Number);
  const min = hh * 60 + (mm || 0);
  if (min >= 6 * 60 && min < 13 * 60) return 'manana';
  if (min >= 13 * 60 && min < 18 * 60) return 'tarde';
  if (min >= 18 * 60) return 'noche';
  return '';
}

function aMinutos(hora: string): number {
  const [hh, mm] = (hora ?? '').split(':').map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

interface EditForm {
  diaSemana: string;
  horaInicio: string;
  horaFin: string;
  fichaId: string;
  instructorId: string;
  ambienteId: string;
}

/**
 * Modal "Editar Horario" — se abre con el lápiz de cada tarjeta de la matriz.
 * El backend ya soportaba la edición (PUT /horarios/:id) pero la pantalla no
 * la exponía: antes había que borrar y volver a crear.
 *
 * PUT /horarios/:id NO corre las validaciones de conflicto que sí corre
 * POST (existeConflictoFicha/Ambiente) — solo lo frena el índice único
 * parcial (ficha y ambiente por día+jornada). Por eso los conflictos se
 * validan aquí en el cliente contra la lista de horarios ya cargada, y se
 * suma el cruce de horas del instructor, que el backend no valida en ningún caso.
 */
@Component({
  selector: 'app-editar-horario-modal',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, SearchableSelectComponent, TimeInputComponent],
  template: `
    @if (horario(); as h) {
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="edit-modal" (click)="$event.stopPropagation()">

        <div class="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h3 class="text-lg font-extrabold text-gray-900">Editar Horario</h3>
            <p class="text-xs text-gray-500 mt-0.5">
              {{ diaLabel(h.diaSemana) }} · {{ fmt(h.horaInicio) }} – {{ fmt(h.horaFin) }} · Ficha {{ h.ficha?.codigo ?? '—' }}
            </p>
          </div>
          <button class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" (click)="cerrar()">
            <lucide-icon name="x" [size]="18"></lucide-icon>
          </button>
        </div>

        <div class="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Día *</label>
            <app-ss [options]="diaOpts" [(ngModel)]="form.diaSemana" (ngModelChange)="tocar()"></app-ss>
          </div>
          <div class="flex items-end">
            <span class="jornada-badge">
              <lucide-icon name="clock" [size]="12"></lucide-icon>
              Jornada: <strong>{{ jornadaLabel(jornadaForm()) }}</strong>
            </span>
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Hora inicio *</label>
            <app-time-input [(ngModel)]="form.horaInicio" (ngModelChange)="tocar()"></app-time-input>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Hora fin *</label>
            <app-time-input [(ngModel)]="form.horaFin" (ngModelChange)="tocar()"></app-time-input>
          </div>

          <div class="sm:col-span-2">
            <label class="block text-xs font-semibold text-gray-600 mb-1">Ficha *</label>
            <app-ss [options]="fichaOpts()" placeholder="Seleccionar ficha..." [(ngModel)]="form.fichaId" (ngModelChange)="tocar()"></app-ss>
          </div>

          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Instructor *</label>
            <app-ss [options]="instructorOpts()" placeholder="Seleccionar instructor..." [(ngModel)]="form.instructorId" (ngModelChange)="onInstructorChange()"></app-ss>
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Ambiente {{ esTransversal() ? '' : '*' }}</label>
            @if (!esTransversal()) {
              <app-ss [options]="ambienteOpts()" placeholder="Seleccionar ambiente..." [(ngModel)]="form.ambienteId" (ngModelChange)="tocar()"></app-ss>
            } @else {
              <div class="transversal-pill">
                <lucide-icon name="shuffle" [size]="11"></lucide-icon>
                Transversal — se asigna al iniciar
              </div>
            }
          </div>
        </div>

        @if (errores().length) {
          <div class="error-box">
            <lucide-icon name="alert-triangle" [size]="15"></lucide-icon>
            <ul>
              @for (e of errores(); track e) { <li>{{ e }}</li> }
            </ul>
          </div>
        }

        <div class="edit-footer">
          <button class="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-2 transition-all" [disabled]="guardando()" (click)="cerrar()">Cancelar</button>
          <button class="bg-sena-gradient hover:opacity-90 text-white font-semibold rounded-xl px-5 py-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                  [disabled]="guardando() || errores().length > 0" (click)="guardar(h)">
            @if (guardando()) { <lucide-icon name="loader" [size]="14" class="spin"></lucide-icon> Guardando... }
            @else { <lucide-icon name="save" [size]="14"></lucide-icon> Guardar cambios }
          </button>
        </div>
      </div>
    </div>
    }
  `,
  styles: [`
    .edit-modal {
      background: var(--surface); border-radius: 16px; width: 95vw; max-width: 640px;
      max-height: 92vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,.2);
    }
    .jornada-badge {
      display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px;
      background: rgba(57,169,0,.08); color: var(--accent-text); font-size: 12px; border: 1px solid rgba(57,169,0,.25);
    }
    .transversal-pill {
      display: inline-flex; align-items: center; gap: 5px; padding: 8px 10px; border-radius: 8px;
      background: var(--warn-bg); color: var(--warn-text); border: 1px solid var(--warn-border); font-size: 12px; font-weight: 600;
    }
    .error-box {
      display: flex; gap: 8px; align-items: flex-start; margin: 0 24px 16px;
      background: var(--err-bg); color: var(--err-text); border: 1px solid var(--err-border); border-radius: 8px;
      padding: 10px 12px; font-size: 12px;
    }
    .error-box ul { margin: 0; padding-left: 14px; }
    .edit-footer {
      display: flex; align-items: center; justify-content: flex-end; gap: 12px;
      padding: 16px 24px; border-top: 1px solid var(--border); background: var(--surface2);
      border-radius: 0 0 16px 16px;
    }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class EditarHorarioModalComponent {
  fichas = input<any[]>([]);
  ambientes = input<any[]>([]);
  instructores = input<any[]>([]);
  /** Horarios ya enriquecidos (con ficha/instructor/ambiente) — se usan para validar conflictos. */
  horarios = input<any[]>([]);
  @Output() guardado = new EventEmitter<void>();

  private horariosApi = inject(HorariosApiService);
  private toast = inject(ToastService);

  horario = signal<any | null>(null);
  guardando = signal(false);

  form: EditForm = { diaSemana: '', horaInicio: '', horaFin: '', fichaId: '', instructorId: '', ambienteId: '' };
  /** Se incrementa en cada cambio del formulario para recalcular los computed que leen `form`. */
  private formVersion = signal(0);

  readonly diaOpts: SSOption[] = DIAS_SEMANA.map(d => ({ value: d, label: DIAS_LABELS[d] }));

  fichaOpts = computed<SSOption[]>(() =>
    this.fichas().map(f => ({ value: f.id, label: `${f.codigo} — ${f.programa ?? ''}` })));

  instructorOpts = computed<SSOption[]>(() =>
    this.instructores().map(i => ({
      value: i.id,
      label: `${nombreCompleto(i)}${i.esTransversal ? ' · Transversal' : ''}`,
    })));

  ambienteOpts = computed<SSOption[]>(() => {
    this.formVersion();
    const jornada = this.jornadaForm();
    const ocupados = new Set(this.otrosHorarios()
      .filter(o => o.diaSemana === this.form.diaSemana && o.jornada === jornada && o.ambienteId)
      .map(o => String(o.ambienteId)));
    return this.ambientes().map(a => ({
      value: a.id,
      label: ocupados.has(String(a.id)) ? `${a.nombre} (ocupado)` : a.nombre,
      disabled: ocupados.has(String(a.id)),
    }));
  });

  jornadaForm = computed(() => {
    this.formVersion();
    return detectarJornada(this.form.horaInicio) || this.horario()?.jornada || '';
  });

  esTransversal = computed(() => {
    this.formVersion();
    return this.esTransversalId(this.form.instructorId);
  });

  errores = computed<string[]>(() => {
    this.formVersion();
    if (!this.horario()) return [];
    const f = this.form;
    const errs: string[] = [];
    if (!f.diaSemana) errs.push('Elige el día.');
    if (!f.horaInicio || !f.horaFin) errs.push('Indica la hora de inicio y de fin.');
    else if (this.jornadaForm() !== 'noche' && aMinutos(f.horaFin) <= aMinutos(f.horaInicio)) {
      errs.push('La hora de fin debe ser posterior a la de inicio.');
    }
    if (!f.fichaId) errs.push('Elige la ficha.');
    if (!f.instructorId) errs.push('Elige el instructor.');
    if (!f.ambienteId && !this.esTransversal()) errs.push('Elige el ambiente.');
    if (errs.length) return errs;

    const jornada = this.jornadaForm();
    const mismoTurno = this.otrosHorarios().filter(o => o.diaSemana === f.diaSemana && o.jornada === jornada);
    if (mismoTurno.some(o => String(o.fichaId) === String(f.fichaId))) {
      errs.push(`La ficha ya tiene otro horario el ${this.diaLabel(f.diaSemana).toLowerCase()} en la jornada de la ${this.jornadaLabel(jornada).toLowerCase()}.`);
    }
    if (f.ambienteId && mismoTurno.some(o => String(o.ambienteId) === String(f.ambienteId))) {
      errs.push('El ambiente ya está ocupado ese día en esa jornada.');
    }
    const ini = aMinutos(f.horaInicio), fin = aMinutos(f.horaFin);
    const cruce = this.otrosHorarios().find(o =>
      o.diaSemana === f.diaSemana &&
      String(o.instructorId) === String(f.instructorId) &&
      o.horaInicio && o.horaFin &&
      ini < aMinutos(o.horaFin) && aMinutos(o.horaInicio) < fin);
    if (cruce) {
      errs.push(`El instructor ya tiene clase de ${this.fmt(cruce.horaInicio)} a ${this.fmt(cruce.horaFin)} ese día (ficha ${cruce.ficha?.codigo ?? '—'}).`);
    }
    return errs;
  });

  private otrosHorarios(): any[] {
    const id = this.horario()?.id;
    return this.horarios().filter(o => o.id !== id);
  }

  abrir(h: any): void {
    this.form = {
      diaSemana: h.diaSemana ?? '',
      horaInicio: (h.horaInicio ?? '').slice(0, 5),
      horaFin: (h.horaFin ?? '').slice(0, 5),
      fichaId: h.fichaId ?? '',
      instructorId: h.instructorId ?? '',
      ambienteId: h.ambienteId ?? '',
    };
    this.horario.set(h);
    this.tocar();
  }

  cerrar(): void {
    if (this.guardando()) return;
    this.horario.set(null);
  }

  tocar(): void { this.formVersion.update(v => v + 1); }

  onInstructorChange(): void {
    // Igual que el wizard: un instructor transversal no lleva ambiente fijo.
    if (this.esTransversalId(this.form.instructorId)) this.form.ambienteId = '';
    this.tocar();
  }

  private esTransversalId(id: string): boolean {
    return !!this.instructores().find(i => String(i.id) === String(id))?.esTransversal;
  }

  async guardar(h: any): Promise<void> {
    if (this.errores().length) return;
    this.guardando.set(true);
    const f = this.form;
    try {
      await this.horariosApi.updateHorario(h.id, {
        diaSemana: f.diaSemana,
        jornada: this.jornadaForm(),
        horaInicio: f.horaInicio,
        horaFin: f.horaFin,
        fichaId: f.fichaId,
        instructorId: f.instructorId,
        ambienteId: f.ambienteId || null,
      });
      this.toast.ok('Horario actualizado', 'Los cambios se guardaron correctamente.');
      this.guardando.set(false);
      this.cerrar();
      this.guardado.emit();
    } catch (e: any) {
      this.guardando.set(false);
      this.toast.error('No se pudo guardar', e?.error?.message ?? 'Verifica los datos e intenta de nuevo.');
    }
  }

  diaLabel(d: string): string { return DIAS_LABELS[d] ?? d ?? ''; }
  jornadaLabel(j: string): string { return JORNADA_LABELS[j] ?? '—'; }
  fmt(t: string): string { return to12h(t); }
}
