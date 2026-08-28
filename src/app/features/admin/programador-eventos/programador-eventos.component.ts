import { Component, OnInit, ViewChild, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { ToastService } from '../../../core/services/toast.service';
import { HorariosApiService } from '../../../core/services/horarios/horarios-api.service';
import { ErpCatalogoService } from '../../../core/services/horarios/erp-catalogo.service';
import { to12h as to12hUtil } from '../../../core/utils/horarios.util';
import { CalendarioEventosComponent } from './calendario-eventos.component';
import { EventoModalComponent } from './evento-modal.component';

const TIPO_COLORS: Record<string, { bg: string; text: string }> = {
  formativo:     { bg: '#dbeafe', text: '#1d4ed8' },
  institucional: { bg: '#dcfce7', text: '#166534' },
  evaluacion:    { bg: '#fed7aa', text: '#92400e' },
  festivo:       { bg: '#fee2e2', text: '#991b1b' },
};

@Component({
  selector: 'app-programador-eventos',
  imports: [FormsModule, LucideAngularModule, ConfirmDialogModule, SearchableSelectComponent, CalendarioEventosComponent, EventoModalComponent],
  providers: [ConfirmationService],
  template: `
    <p-confirmdialog />

    <div class="page-header">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 tracking-tight">Programador de Eventos</h2>
        <p class="text-muted text-sm">Gestiona eventos especiales del calendario académico</p>
      </div>
      <button class="bg-sena-gradient hover:opacity-90 text-white font-semibold rounded-xl px-5 py-2 transition-all flex items-center gap-2" (click)="evento.abrirNuevo()">
        <lucide-icon name="plus" [size]="16"></lucide-icon>
        Nuevo Evento
      </button>
    </div>

    <!-- Filtros -->
    <div class="card p-4 mt-4">
      <div class="flex items-center gap-3" style="flex-wrap:wrap">
        <div class="form-group" style="min-width:180px">
          <label class="block text-xs font-semibold text-gray-600 mb-1">Buscar evento</label>
          <input class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" [ngModel]="searchQ()" (ngModelChange)="searchQ.set($event)" placeholder="Nombre del evento...">
        </div>
        <div class="form-group" style="min-width:140px">
          <label class="block text-xs font-semibold text-gray-600 mb-1">Tipo</label>
          <app-ss [options]="tipoOpts" placeholder="Todos los tipos"
                  [ngModel]="filterTipo()" (ngModelChange)="filterTipo.set($event)"></app-ss>
        </div>
        <div class="form-group" style="min-width:160px">
          <label class="block text-xs font-semibold text-gray-600 mb-1">Mes</label>
          <app-ss [options]="mesOpts" placeholder="Todos los meses"
                  [ngModel]="filterMes()" (ngModelChange)="onFilterMesChange($event)"></app-ss>
        </div>
      </div>
    </div>

    <!-- Calendario Visual — extraído a su propio componente -->
    <app-calendario-eventos #calendario
      [eventos]="filteredEventos()"
      (diaClick)="evento.abrirNuevo($event)"
      (eventoClick)="evento.abrirEditar($event)" />

    <!-- Lista de Eventos -->
    <div class="card mt-4 table-wrap">
      <div class="flex items-center justify-between p-4" style="border-bottom:1px solid var(--border)">
        <h3 class="text-sm font-semibold text-gray-700">Eventos — <span class="font-normal text-gray-400">{{ filteredEventos().length }} registros</span></h3>
      </div>
      <table class="data-table">
        <thead><tr>
          <th>Evento</th><th>Tipo</th><th>Fecha</th><th>Horario</th><th>Lugar</th>
          <th class="col-fichas">Fichas invitadas</th><th class="col-desc">Descripción</th><th>Acciones</th>
        </tr></thead>
        <tbody>
          @if (filteredEventos().length === 0) {
            <tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">
              Sin eventos registrados
            </td></tr>
          }
          @for (ev of filteredEventos(); track ev.id) {
          <tr>
            <td>
              <div [class]="'ev-badge ev-tipo-' + ev.tipo" [title]="ev.nombre">
                <lucide-icon [name]="tipoIcon(ev.tipo)" [size]="13"></lucide-icon>
                <strong>{{ ev.nombre }}</strong>
              </div>
            </td>
            <td><span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold" [class]="'tipo-badge-' + ev.tipo">{{ tipoLabel(ev.tipo) }}</span></td>
            <td style="white-space:nowrap">
              {{ formatFecha(ev.fechaInicio) }}
              @if (ev.fechaFin && ev.fechaFin !== ev.fechaInicio) {
                <br><span class="text-xs text-muted">→ {{ formatFecha(ev.fechaFin) }}</span>
              }
            </td>
            <td style="white-space:nowrap;font-size:12px;">
              @if (ev.horaInicio) {
                {{ to12h(ev.horaInicio) }} — {{ to12h(ev.horaFin) }}
              } @else { — }
            </td>
            <td>
              @if (ev.lugar) {
                <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;">
                  <lucide-icon name="map-pin" [size]="11"></lucide-icon>{{ ev.lugar }}
                </span>
              } @else { <span class="text-muted text-sm">—</span> }
            </td>
            <td class="col-fichas">
              <span class="fichas-count-chip">{{ (ev.fichasParticipantes ?? []).length }} ficha{{ (ev.fichasParticipantes ?? []).length !== 1 ? 's' : '' }}</span>
            </td>
            <td class="col-desc"><span class="ev-desc-cell text-sm text-muted" [title]="ev.descripcion ?? ''">{{ ev.descripcion ?? '—' }}</span></td>
            <td>
              <div class="flex gap-2">
                <button class="btn btn-icon" [disabled]="evento.esEventoPasado(ev)"
                        (click)="evento.abrirEditar(ev)"
                        [title]="evento.esEventoPasado(ev) ? 'Este evento ya pasó y no se puede editar' : 'Editar'">
                  <lucide-icon name="pencil" [size]="14"></lucide-icon>
                </button>
                <button class="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-red-50 text-red-600 transition-colors" (click)="remove(ev.id)" title="Eliminar">
                  <lucide-icon name="trash-2" [size]="14"></lucide-icon>
                </button>
              </div>
            </td>
          </tr>
          }
        </tbody>
      </table>
    </div>

    <!-- Modal crear/editar — extraído a su propio componente -->
    <app-evento-modal #evento
      [fichas]="fichas()" [horarios]="horarios()" [eventos]="eventos()"
      (guardado)="load()" />
  `,
  styleUrls: ['./programador-eventos.component.css'],
})
export class ProgramadorEventosComponent implements OnInit {
  @ViewChild('calendario') private calendarioRef!: CalendarioEventosComponent;

  // ── Datos ──────────────────────────────────────────────────────
  eventos   = signal<any[]>([]);
  fichas    = signal<any[]>([]);
  horarios  = signal<any[]>([]);

  // ── Filtros de lista (signals → computed reactivo) ─────────────
  searchQ   = signal('');
  filterTipo = signal('');
  filterMes  = signal('');

  meses = [
    { val: '01', label: 'Enero' }, { val: '02', label: 'Febrero' },
    { val: '03', label: 'Marzo' }, { val: '04', label: 'Abril' },
    { val: '05', label: 'Mayo' }, { val: '06', label: 'Junio' },
    { val: '07', label: 'Julio' }, { val: '08', label: 'Agosto' },
    { val: '09', label: 'Septiembre' }, { val: '10', label: 'Octubre' },
    { val: '11', label: 'Noviembre' }, { val: '12', label: 'Diciembre' },
  ];

  filteredEventos = computed(() => {
    let list = this.eventos();
    const q = this.searchQ().toLowerCase();
    const t = this.filterTipo();
    const m = this.filterMes();
    if (q) list = list.filter(e => e.nombre?.toLowerCase().includes(q));
    if (t) list = list.filter(e => e.tipo === t);
    if (m) list = list.filter(e => e.fechaInicio?.slice(5, 7) === m);
    return list;
  });

  // ── Opciones SearchableSelect ────────────────────────────────────
  readonly tipoOpts: SSOption[] = [
    { value: '', label: 'Todos los tipos' },
    { value: 'formativo',     label: 'Formativo' },
    { value: 'institucional', label: 'Institucional' },
    { value: 'evaluacion',    label: 'Evaluación' },
    { value: 'festivo',       label: 'Festivo / No lectivo' },
  ];
  readonly mesOpts: SSOption[] = [
    { value: '', label: 'Todos los meses' },
    ...[ { val: '01', label: 'Enero' }, { val: '02', label: 'Febrero' }, { val: '03', label: 'Marzo' },
         { val: '04', label: 'Abril' }, { val: '05', label: 'Mayo' }, { val: '06', label: 'Junio' },
         { val: '07', label: 'Julio' }, { val: '08', label: 'Agosto' }, { val: '09', label: 'Septiembre' },
         { val: '10', label: 'Octubre' }, { val: '11', label: 'Noviembre' }, { val: '12', label: 'Diciembre' },
    ].map(m => ({ value: m.val, label: m.label })),
  ];

  private confirm = inject(ConfirmationService);

  constructor(
    private horariosApi: HorariosApiService,
    private erpCatalogo: ErpCatalogoService,
    private toast: ToastService,
  ) {}

  ngOnInit() { this.load(); }

  async load() {
    const [eventos, fichas, horarios] = await Promise.all([
      this.horariosApi.getEventos().catch(() => []),
      this.erpCatalogo.getFichas().catch(() => []),
      this.horariosApi.getHorarios().catch(() => []),
    ]);
    this.eventos.set(eventos ?? []);
    this.fichas.set(fichas ?? []);
    this.horarios.set(horarios ?? []);
  }

  /** Al elegir un mes en el filtro, el calendario salta a ese mes (mismo año visible) */
  onFilterMesChange(val: string) {
    this.filterMes.set(val);
    if (val) this.calendarioRef.irAMes(Number(val) - 1);
  }

  tipoLabel(t: string) {
    return ({ formativo: 'Formativo', institucional: 'Institucional', evaluacion: 'Evaluación', festivo: 'Festivo/No lectivo' } as any)[t] ?? t;
  }
  tipoIcon(t: string) {
    return ({ formativo: 'book-open', institucional: 'building-2', evaluacion: 'clipboard-check', festivo: 'umbrella' } as any)[t] ?? 'calendar';
  }
  /** Convierte "HH:MM:SS" o "HH:MM" a formato 12h con am/pm */
  to12h(time: string | null | undefined): string {
    return to12hUtil(time);
  }

  formatFecha(f: string) {
    if (!f) return '—';
    return new Date(f + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  remove(id: string) {
    this.confirm.confirm({
      message: '¿Eliminar este evento? Esta acción no se puede deshacer.',
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
      acceptButtonProps: { label: 'Sí, eliminar', severity: 'danger' },
      accept: async () => {
        try {
          await this.horariosApi.deleteEvento(id);
          await this.load();
          this.toast.ok('Evento eliminado', 'El evento fue eliminado del sistema.');
        } catch (e: any) {
          this.toast.error('Error al eliminar', e?.error?.message ?? 'No se pudo eliminar el evento.');
        }
      },
    });
  }
}
