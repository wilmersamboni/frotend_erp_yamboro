import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { DateInputComponent } from '../../../shared/components/date-input.component';
import { TimeInputComponent } from '../../../shared/components/time-input.component';
import { ToastService } from '../../../core/services/toast.service';
import { HorariosApiService } from '../../../core/services/horarios/horarios-api.service';
import { ErpCatalogoService } from '../../../core/services/horarios/erp-catalogo.service';
import { to12h as to12hUtil } from '../../../core/utils/horarios.util';
import { TuiDay } from '@taiga-ui/cdk';

/**
 * <app-evento-modal> — modal crear/editar evento, extraído de
 * programador-eventos.component.ts. El padre invoca abrirNuevo()/abrirEditar()
 * (vía referencia de plantilla) y escucha (guardado) para recargar sus datos.
 */
@Component({
  selector: 'app-evento-modal',
  imports: [FormsModule, LucideAngularModule, SearchableSelectComponent, DateInputComponent, TimeInputComponent],
  template: `
    @if (showModal()) {
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" (click)="showModal.set(false)">
    <div class="bg-white rounded-2xl shadow-xl flex flex-col modal-evento" (click)="$event.stopPropagation()">
      <div class="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
        <div style="display:flex;align-items:center;gap:10px;">
          <h3>{{ editId() ? 'Editar' : 'Nuevo' }} Evento</h3>
        </div>
        <button class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" (click)="showModal.set(false)">
          <lucide-icon name="x" [size]="18"></lucide-icon>
        </button>
      </div>

      <div class="modal-body">
      <!-- Nombre -->
      <div class="form-group">
        <label class="block text-xs font-semibold text-gray-600 mb-1">Nombre del evento *</label>
        <input class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" [(ngModel)]="form.nombre" placeholder="Ej: Semana Cultural SENA">
      </div>

      <!-- Tipo: chips de color en vez de dropdown + preview separado -->
      <div class="form-group mt-3">
        <label class="block text-xs font-semibold text-gray-600 mb-1">Tipo de evento *</label>
        <div class="tipo-chip-row">
          @for (t of tipoOptsRequired; track t.value) {
            <button type="button"
                    [class]="'tipo-chip ev-tipo-' + t.value + (formTipo() === t.value ? ' tipo-chip-active' : '')"
                    (click)="formTipo.set(t.value)">
              <lucide-icon [name]="tipoIcon(t.value)" [size]="14"></lucide-icon>
              {{ t.label }}
            </button>
          }
        </div>
      </div>

      <!-- Cuándo: fecha + hora agrupadas por inicio/fin -->
      <div class="form-section mt-4">
        <div class="form-section-header">
          <lucide-icon name="calendar-clock" [size]="14"></lucide-icon>
          <strong>Cuándo</strong>
        </div>
        <div class="form-section-body">
          <div class="grid grid-cols-2 gap-3">
            <div class="form-group">
              <label class="block text-xs font-semibold text-gray-600 mb-1">Fecha inicio *</label>
              <app-date-input [ngModel]="dateVal(form.fechaInicio)"
                     (ngModelChange)="form.fechaInicio = tuiDayToISO($event)"
                     [min]="minFechaInicio()"></app-date-input>
            </div>
            <div class="form-group">
              <label class="block text-xs font-semibold text-gray-600 mb-1">Hora inicio *</label>
              <app-time-input
                     [ngModel]="formHoraInicio()"
                     (ngModelChange)="formHoraInicio.set($event)"></app-time-input>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3 mt-3">
            <div class="form-group">
              <label class="block text-xs font-semibold text-gray-600 mb-1">Fecha fin *</label>
              <app-date-input [ngModel]="dateVal(form.fechaFin)"
                     (ngModelChange)="form.fechaFin = tuiDayToISO($event)"
                     [min]="dateVal(form.fechaInicio)"></app-date-input>
            </div>
            <div class="form-group">
              <label class="block text-xs font-semibold text-gray-600 mb-1">Hora fin *</label>
              <app-time-input
                     [ngModel]="formHoraFin()"
                     (ngModelChange)="formHoraFin.set($event)"></app-time-input>
            </div>
          </div>
        </div>
      </div>

      <!-- Dónde: tipo de lugar + ubicacion específica -->
      <div class="form-section mt-3">
        <div class="form-section-header">
          <lucide-icon name="map-pin" [size]="14"></lucide-icon>
          <strong>Dónde</strong>
          <span class="text-xs text-muted" style="font-weight:400;margin-left:auto;">Opcional</span>
        </div>
        <div class="form-section-body">
          <div class="form-group">
            <label class="block text-xs font-semibold text-gray-600 mb-1">Tipo de lugar</label>
            <app-ss [options]="lugarTipoOpts" placeholder="Sin lugar específico"
                    [ngModel]="formLugarTipo()" (ngModelChange)="onLugarTipoChange($event)"></app-ss>
          </div>
          @if (formLugarTipo() && formLugarTipo() !== 'ambiente') {
            <div class="form-group mt-2">
              <label class="block text-xs font-semibold text-gray-600 mb-1">Ubicación específica</label>
              @if (cargandoUbicaciones()) {
                <p style="font-size:12px;color:var(--text-muted);padding:4px 0;">Cargando...</p>
              } @else if (ubicacionesPorTipo().length === 0) {
                <p style="font-size:12px;color:var(--text-muted);padding:4px 0;">
                  No hay ubicaciones de este tipo registradas. Agrégalas en Formativo → Ubicaciones.
                </p>
              } @else {
                <app-ss [options]="ubicacionOpts()"
                        placeholder="Seleccionar ubicación..."
                        [ngModel]="formUbicacionId()"
                        (ngModelChange)="formUbicacionId.set($event || null)"></app-ss>
              }
            </div>
          }
        </div>
      </div>

      <!-- Descripción -->
      <div class="form-group mt-3">
        <label class="block text-xs font-semibold text-gray-600 mb-1">Descripción</label>
        <textarea class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900] resize-y" [(ngModel)]="form.descripcion" rows="2"
                  placeholder="Descripción opcional del evento..."></textarea>
      </div>

      <!-- ── Selector de Fichas ── -->
      <div class="fichas-section mt-4">
        <div class="fichas-section-header">
          <div style="display:flex;align-items:center;gap:8px;">
            <lucide-icon name="users" [size]="14"></lucide-icon>
            <strong>Fichas invitadas</strong>
            @if (fichasSeleccionadas().size > 0) {
              <span class="fichas-count-chip">{{ fichasSeleccionadas().size }} seleccionada{{ fichasSeleccionadas().size !== 1 ? 's' : '' }}</span>
            }
          </div>
          @if (formHoraInicio() && formHoraFin()) {
            <span class="text-xs text-muted">
              Solo fichas con horarios en {{ to12h(formHoraInicio()) }} — {{ to12h(formHoraFin()) }}
            </span>
          }
        </div>

        @if (!formHoraInicio() || !formHoraFin()) {
          <div class="fichas-hint">
            <lucide-icon name="info" [size]="14"></lucide-icon>
            Completa el rango de horas para ver las fichas disponibles en esa franja
          </div>
        } @else if (fichasEnRango().length === 0) {
          <div class="fichas-hint fichas-hint-warn">
            <lucide-icon name="alert-triangle" [size]="14"></lucide-icon>
            No hay fichas con horarios en la franja {{ to12h(formHoraInicio()) }} — {{ to12h(formHoraFin()) }}
          </div>
        } @else {
          <!-- Filtro por área -->
          <div class="ficha-filter-row mt-2">
            <div style="min-width:180px; max-width:220px;">
              <app-ss [options]="areasOpts()" placeholder="Todas las áreas"
                      [ngModel]="filtroArea()" (ngModelChange)="filtroArea.set($event)"></app-ss>
            </div>
            <button class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 rounded-lg btn-filter-sm transition-all" (click)="seleccionarTodas()">
              Todas
            </button>
            <button class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 rounded-lg btn-filter-sm transition-all" (click)="deseleccionarTodas()">
              Ninguna
            </button>
          </div>

          <!-- Lista de fichas con checkboxes -->
          <div class="ficha-check-list mt-2">
            @for (f of fichasEnRangoFiltradas(); track f.id) {
              <label class="ficha-check-row" [class.selected]="fichasSeleccionadas().has('' + f.id)">
                <input type="checkbox"
                       [checked]="fichasSeleccionadas().has('' + f.id)"
                       (change)="toggleFicha('' + f.id)">
                <div class="ficha-check-info">
                  <span class="ficha-code">{{ f.codigo }}</span>
                  <span class="ficha-prog">{{ f.programa }}</span>
                  @if (f.area) {
                    <span class="ficha-area-tag">{{ f.area }}</span>
                  }
                </div>
              </label>
            }
            @if (fichasEnRangoFiltradas().length === 0 && filtroArea()) {
              <p class="text-xs text-muted" style="padding:8px;">No hay fichas en el área "{{ filtroArea() }}" para este rango horario</p>
            }
          </div>
        }
      </div>

      @if (formError()) { <div class="error-msg mt-3">{{ formError() }}</div> }
      <div class="btn-row mt-4">
        <button class="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-2 transition-all" (click)="showModal.set(false)">Cancelar</button>
        <button class="bg-sena-gradient hover:opacity-90 text-white font-semibold rounded-xl px-5 py-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed" (click)="save()" [disabled]="saving()">
          {{ saving() ? 'Guardando...' : (editId() ? 'Guardar Cambios' : 'Crear Evento') }}
        </button>
      </div>
      </div>
    </div>
    </div>
    }
  `,
  styles: [`
    /* ── Modal overrides ── */
    /* La clase global .modal es display:flex; flex-direction:column sin flex-shrink:0
       en los hijos — con contenido más alto que max-height, flexbox los ENCOGE en vez
       de dejar que el contenedor haga scroll. Se fuerza flex-shrink:0 en cada hijo
       directo para que el overflow real dispare el scroll en vez de comprimir todo. */
    .modal-evento { max-width: 680px; width: 95vw; max-height: 90vh; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
    .modal-evento > * { flex-shrink: 0; }
    .modal-evento::-webkit-scrollbar { display: none; }
    /* .modal (global) no trae padding propio — sólo .modal-header lo tiene.
       Sin este wrapper, los campos tocaban el borde izquierdo del modal y los
       botones Cancelar/Crear quedaban pegados al borde inferior sin margen. */
    .modal-body { padding: 20px 24px 24px; }

    /* .btn-row tampoco existe globalmente — sin esto, Cancelar/Crear Evento se apilaban
       verticalmente en vez de quedar en una fila alineada a la derecha. */
    .btn-row { display: flex; justify-content: flex-end; gap: 10px; }

    /* ── Chips de tipo de evento (reemplaza dropdown + preview separados) ── */
    .tipo-chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .tipo-chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;
      border: 1.5px solid transparent; cursor: pointer;
      opacity: .55; transition: opacity .15s, border-color .15s, transform .1s;
    }
    .tipo-chip:hover { opacity: .85; }
    .tipo-chip-active { opacity: 1; border-color: currentColor; }
    .tipo-chip-active:active { transform: scale(.97); }

    /* Colores por tipo — duplicado con el padre y con el calendario, cada
       componente tiene su propio encapsulamiento de estilos */
    .ev-tipo-formativo     { background: #dbeafe; color: #1d4ed8; }
    .ev-tipo-institucional { background: #dcfce7; color: #166534; }
    .ev-tipo-evaluacion    { background: #fed7aa; color: #92400e; }
    .ev-tipo-festivo       { background: #fee2e2; color: #991b1b; }

    /* ── Secciones agrupadas del formulario (Cuándo / Dónde) ── */
    .form-section-header {
      display: flex; align-items: center; gap: 8px;
      padding-bottom: 8px;
      border-bottom: 1.5px solid var(--border);
      font-size: 13px; color: var(--text);
    }
    .form-section-header lucide-icon { color: var(--text-muted); }
    .form-section-body { padding-top: 12px; }

    /* ── Fichas section ── */
    .fichas-section-header {
      display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
      padding-bottom: 8px;
      border-bottom: 1.5px solid var(--border);
    }
    .fichas-hint {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 0; font-size: 13px; color: var(--text-muted);
    }
    .fichas-hint-warn { color: #d97706; }
    .ficha-filter-row {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 0; flex-wrap: wrap;
    }
    /* .btn-sm (global) es un cuadrado fijo de 26x26px pensado para botones de
       solo-ícono — con texto ("Todas"/"Ninguna") lo desbordaba y las dos
       etiquetas se superponían. Este botón compacto propio se ajusta al
       contenido en vez de recortarlo. */
    .btn-filter-sm { padding: 5px 10px; font-size: 11px; }
    .ficha-check-list {
      display: flex; flex-direction: column; gap: 0;
      max-height: 220px; overflow-y: auto;
      border: 1.5px solid var(--border); border-radius: 8px;
      margin-top: 8px;
    }
    .ficha-check-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px; cursor: pointer; transition: background .1s;
      border-bottom: 1px solid var(--border);
    }
    .ficha-check-row:last-child { border-bottom: none; }
    .ficha-check-row:hover { background: var(--surface2); }
    .ficha-check-row.selected { background: #f0fdf4; }
    .ficha-check-row input[type="checkbox"] { flex-shrink: 0; width: 15px; height: 15px; cursor: pointer; }
    .ficha-check-info {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0;
    }
    .ficha-code {
      font-weight: 700; font-size: 12px; color: var(--text); white-space: nowrap;
    }
    .ficha-prog {
      font-size: 12px; color: var(--text-muted); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; max-width: 200px;
    }
    .ficha-area-tag {
      font-size: 10px; font-weight: 700;
      background: #ede9fe; color: #6d28d9;
      border-radius: 4px; padding: 1px 6px; white-space: nowrap;
    }
    .fichas-count-chip {
      font-size: 11px; font-weight: 700;
      background: #dcfce7; color: #15803d;
      border-radius: 20px; padding: 2px 8px;
    }

    .error-msg { background:#fee2e2;color:#991b1b;border-radius:8px;padding:10px 14px;font-size:13px; }
    textarea.form-control { resize: vertical; font-family: inherit; }

    /* ── Dark mode ── */
  `],
})
export class EventoModalComponent {
  @Input() fichas: any[] = [];
  @Input() horarios: any[] = [];
  @Input() eventos: any[] = [];

  @Output() guardado = new EventEmitter<void>();

  // ── Modal state ────────────────────────────────────────────────
  showModal = signal(false);
  editId    = signal<string | null>(null);
  form: any = {};
  formError = signal('');
  saving    = signal(false);

  // ── Form campos reactivos ──────────────────────────────────────
  formHoraInicio   = signal('');
  formHoraFin      = signal('');
  formTipo         = signal('');
  filtroArea       = signal('');
  fichasSeleccionadas = signal<Set<string>>(new Set());

  // ── Lugar / Ubicación ─────────────────────────────────────────
  readonly LUGAR_TIPOS = [
    { tipo: 'auditorio',       label: 'Auditorio' },
    { tipo: 'biblioteca',      label: 'Biblioteca' },
    { tipo: 'restaurante',     label: 'Restaurante' },
    { tipo: 'centro_deportivo', label: 'Centro Deportivo' },
  ];
  formLugarTipo       = signal('');
  formUbicacionId     = signal<string | null>(null);
  ubicacionesPorTipo  = signal<any[]>([]);
  cargandoUbicaciones = signal(false);

  constructor(
    private horariosApi: HorariosApiService,
    private erpCatalogo: ErpCatalogoService,
    private toast: ToastService,
  ) {}

  /**
   * ChronoGest tenía un endpoint dedicado `getUbicaciones()`. En este proyecto
   * no existe — era un alias deprecado de `getAmbientes()` — así que se pide
   * el catálogo completo de ambientes al ERP y se filtra en cliente por tipo.
   */
  async onLugarTipoChange(tipo: string) {
    this.formLugarTipo.set(tipo);
    this.formUbicacionId.set(null);
    this.ubicacionesPorTipo.set([]);
    // 'ambiente' no necesita cargar ubicaciones (no es una ubicacion registrada)
    if (tipo && tipo !== 'ambiente') {
      this.cargandoUbicaciones.set(true);
      try {
        const list = await this.erpCatalogo.getAmbientes();
        this.ubicacionesPorTipo.set((list ?? []).filter((u: any) => u.tipo === tipo));
      } catch {
        this.ubicacionesPorTipo.set([]);
      } finally {
        this.cargandoUbicaciones.set(false);
      }
    }
  }

  // ── Fichas en rango horario ────────────────────────────────────
  fichasEnRango = computed(() => {
    const hI = this.formHoraInicio();
    const hF = this.formHoraFin();
    if (!hI || !hF) return [];

    // UUIDs como strings — NO convertir con +fid (daría NaN)
    const fichaIds = new Set<string>();
    this.horarios.forEach(h => {
      if (!h.horaInicio || !h.horaFin) return;
      // Solapamiento: inicio del horario < fin del evento Y fin del horario > inicio del evento
      if (h.horaInicio < hF && h.horaFin > hI) {
        const fid = h.fichaId ?? h.ficha?.id;
        if (fid) fichaIds.add(String(fid));
      }
    });
    return this.fichas.filter((f: any) => fichaIds.has(String(f.id)));
  });

  areasDisponibles = computed(() => {
    const areas = this.fichasEnRango()
      .map((f: any) => f.area)
      .filter(Boolean);
    return [...new Set(areas)].sort();
  });

  // ── Opciones SearchableSelect ────────────────────────────────────
  readonly tipoOptsRequired: SSOption[] = [
    { value: 'formativo',     label: 'Formativo' },
    { value: 'institucional', label: 'Institucional' },
    { value: 'evaluacion',    label: 'Evaluación' },
    { value: 'festivo',       label: 'Festivo / No lectivo' },
  ];
  readonly lugarTipoOpts: SSOption[] = [
    { value: '', label: 'Sin lugar específico' },
    { value: 'ambiente', label: 'Ambiente (ficha)' },
    ...[ { tipo: 'auditorio', label: 'Auditorio' }, { tipo: 'biblioteca', label: 'Biblioteca' },
         { tipo: 'restaurante', label: 'Restaurante' }, { tipo: 'centro_deportivo', label: 'Centro Deportivo' },
    ].map(t => ({ value: t.tipo, label: t.label })),
  ];
  ubicacionOpts = computed<SSOption[]>(() =>
    this.ubicacionesPorTipo().map(u => ({
      value: u.id,
      label: u.nombre + (u.area ? ` — ${u.area}` : ''),
    }))
  );
  areasOpts = computed<SSOption[]>(() => [
    { value: '', label: 'Todas las áreas' },
    ...this.areasDisponibles().map((a: string) => ({ value: a, label: a })),
  ]);

  fichasEnRangoFiltradas = computed(() => {
    const area = this.filtroArea();
    if (!area) return this.fichasEnRango();
    return this.fichasEnRango().filter((f: any) => f.area === area);
  });

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

  /* ── Helpers de fecha para <app-date-input> (trabaja con TuiDay, el form guarda ISO) ── */
  // Cacheado por string ISO: dateVal() se llama directo desde el template en
  // cada ciclo de detección de cambios (varias veces por ciclo, ver [min] de
  // fechaFin). Sin cachear, cada llamada devolvía un TuiDay NUEVO para la
  // misma fecha lógica — <app-date-input> lo trataba como un cambio real y
  // volvía a emitir (ngModelChange), lo que disparaba otro ciclo de CD que
  // creaba OTRO TuiDay nuevo... un loop infinito que congelaba la pestaña.
  // Con la misma referencia siempre para la misma fecha, el CVA ya no ve
  // ningún cambio y el loop no arranca.
  private readonly dateValCache = new Map<string, TuiDay>();

  /** Fecha mínima seleccionable en "Fecha inicio" — siempre hoy, tanto al
   *  crear como al editar: no se pueden crear ni reprogramar eventos a una
   *  fecha pasada (ver EventosService.create()/update()). */
  minFechaInicio(): TuiDay | null {
    return this.dateVal(this.hoyIso());
  }

  private hoyIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Un evento ya pasado no se puede editar en absoluto (ver EventosService.update()). */
  esEventoPasado(ev: any): boolean {
    const fecha = ev?.fechaInicio?.split('T')[0];
    return !!fecha && fecha < this.hoyIso();
  }

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

  // ── Ficha selector helpers ─────────────────────────────────────
  toggleFicha(id: string) {
    this.fichasSeleccionadas.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  seleccionarTodas() {
    const ids = this.fichasEnRangoFiltradas().map((f: any) => String(f.id));
    this.fichasSeleccionadas.update(s => {
      const next = new Set(s);
      ids.forEach(id => next.add(id));
      return next;
    });
  }

  deseleccionarTodas() {
    const ids = new Set(this.fichasEnRangoFiltradas().map((f: any) => String(f.id)));
    this.fichasSeleccionadas.update(s => {
      const next = new Set(s);
      ids.forEach(id => next.delete(id));
      return next;
    });
  }

  // ── Modal open/close ───────────────────────────────────────────
  private resetModal() {
    this.formHoraInicio.set('');
    this.formHoraFin.set('');
    this.formTipo.set('');
    this.filtroArea.set('');
    this.fichasSeleccionadas.set(new Set());
    this.formError.set('');
    this.formLugarTipo.set('');
    this.formUbicacionId.set(null);
    this.ubicacionesPorTipo.set([]);
  }

  abrirNuevo(fechaPreseleccionada?: string) {
    this.editId.set(null);
    this.form = fechaPreseleccionada ? { fechaInicio: fechaPreseleccionada, fechaFin: fechaPreseleccionada } : {};
    this.resetModal();
    this.formTipo.set('formativo');
    this.showModal.set(true);
  }

  abrirEditar(ev: any) {
    if (this.esEventoPasado(ev)) {
      this.toast.error('No se puede editar', 'Este evento ya pasó y no se puede editar.');
      return;
    }
    this.editId.set(ev.id);
    this.form = {
      ...ev,
      fechaInicio: ev.fechaInicio?.split('T')[0],
      fechaFin:    ev.fechaFin?.split('T')[0],
    };
    this.formTipo.set(ev.tipo ?? '');
    // El backend guarda "HH:mm:ss" pero valida "HH:mm" al recibir — recortar
    // para que editar sin tocar la hora no falle con 400 Bad Request.
    this.formHoraInicio.set((ev.horaInicio ?? '').slice(0, 5));
    this.formHoraFin.set((ev.horaFin ?? '').slice(0, 5));
    this.filtroArea.set('');
    // Restaurar TODAS las fichas guardadas — no filtrar por rangeIds para evitar perder
    // fichas invitadas cuyos horarios hayan cambiado desde la creación del evento
    this.fichasSeleccionadas.set(new Set((ev.fichasParticipantes ?? []).map(String)));
    this.formError.set('');
    // Restaurar tipo/ubicacion del evento existente
    const tipoGuardado = ev.lugar?.toLowerCase().replace(' ', '_') ?? '';
    const tipoMatch = this.LUGAR_TIPOS.find(t => t.tipo === tipoGuardado || t.label.toLowerCase() === ev.lugar?.toLowerCase());
    if (tipoMatch) {
      this.onLugarTipoChange(tipoMatch.tipo);
      if (ev.ubicacionId) this.formUbicacionId.set(ev.ubicacionId);
    } else if (ev.lugar?.toLowerCase() === 'ambiente') {
      this.formLugarTipo.set('ambiente');
    } else {
      this.formLugarTipo.set('');
      this.formUbicacionId.set(null);
    }
    this.showModal.set(true);
  }

  async save() {
    const horaInicio = this.formHoraInicio();
    const horaFin    = this.formHoraFin();

    if (!this.form.nombre?.trim()) {
      this.formError.set('El nombre del evento es obligatorio');
      return;
    }
    if (!this.formTipo()) {
      this.formError.set('Selecciona el tipo de evento');
      return;
    }
    if (!this.form.fechaInicio) {
      this.formError.set('Selecciona la fecha de inicio del evento');
      return;
    }
    if (!this.form.fechaFin) {
      this.formError.set('Selecciona la fecha de fin del evento');
      return;
    }
    // No se pueden crear ni reprogramar eventos a una fecha pasada — abrirEditar()
    // ya bloquea abrir el modal para un evento que ya pasó, esto cubre además
    // el caso de editar uno futuro y mover su fecha hacia atrás.
    if (this.form.fechaInicio < this.hoyIso()) {
      this.formError.set(
        this.editId()
          ? 'No se puede reprogramar un evento a una fecha pasada'
          : 'No se pueden crear eventos en una fecha pasada',
      );
      return;
    }
    if (!horaInicio || !horaFin) {
      this.formError.set('Completa la hora de inicio y fin');
      return;
    }
    if (horaFin <= horaInicio) {
      this.formError.set('La hora de fin debe ser mayor que la hora de inicio');
      return;
    }

    // Validar conflicto de ubicación: si se seleccionó una ubicación específica,
    // verificar que ningún otro evento la use en fechas/horas que se solapan.
    const ubicId = (this.formLugarTipo() && this.formLugarTipo() !== 'ambiente')
      ? this.formUbicacionId() : null;
    if (ubicId) {
      const myStart = this.form.fechaInicio;
      const myEnd   = this.form.fechaFin ?? myStart;
      const conflict = this.eventos.find(ev => {
        if (this.editId() && ev.id === this.editId()) return false; // ignorar el propio evento al editar
        if (!ev.ubicacionId || ev.ubicacionId !== ubicId) return false;
        // Solapamiento de fechas
        const evStart = ev.fechaInicio?.split('T')[0] ?? '';
        const evEnd   = (ev.fechaFin ?? ev.fechaInicio)?.split('T')[0] ?? evStart;
        if (myStart > evEnd || myEnd < evStart) return false;
        // Solapamiento de horas dentro del período
        if (!ev.horaInicio || !ev.horaFin) return false;
        return ev.horaInicio < horaFin && ev.horaFin > horaInicio;
      });
      if (conflict) {
        this.formError.set(
          `La ubicación ya está ocupada por "${conflict.nombre}" en ese período ` +
          `(${this.formatFecha(conflict.fechaInicio)}, ` +
          `${this.to12h(conflict.horaInicio)} — ${this.to12h(conflict.horaFin)})`
        );
        return;
      }
    }

    this.saving.set(true);
    this.formError.set('');

    // Construir lugar y ubicacionId a partir del tipo seleccionado
    const lugarTipo = this.formLugarTipo();
    const lugarLabel = lugarTipo === 'ambiente' ? 'Ambiente'
      : this.LUGAR_TIPOS.find(t => t.tipo === lugarTipo)?.label ?? '';

    // this.form puede traer `id` cuando se edita (abrirEditar copia el evento
    // completo) — el backend rechaza esa propiedad en el body de create/update
    // ("property id should not exist"), así que se descarta explícitamente acá.
    const { id: _id, ...formSinId } = this.form;
    const payload = {
      ...formSinId,
      tipo: this.formTipo(),
      horaInicio,
      horaFin,
      fichasParticipantes: Array.from(this.fichasSeleccionadas()),
      lugar: lugarLabel || null,
      ubicacionId: (lugarTipo && lugarTipo !== 'ambiente') ? this.formUbicacionId() : null,
    };

    const isEdit = !!this.editId();

    try {
      if (isEdit) {
        await this.horariosApi.updateEvento(this.editId()!, payload);
      } else {
        await this.horariosApi.createEvento(payload);
      }
      this.saving.set(false);
      this.showModal.set(false);
      this.guardado.emit();
      this.toast.ok(
        isEdit ? 'Evento actualizado' : 'Evento creado',
        isEdit
          ? 'Los cambios del evento fueron guardados correctamente.'
          : 'El evento fue programado y registrado en el sistema.',
      );
    } catch (e: any) {
      this.saving.set(false);
      const msg: string = e?.error?.message ?? 'No se pudo guardar el evento. Verifica los datos e intenta de nuevo.';
      this.toast.error('Error al guardar evento', msg);
    }
  }
}
