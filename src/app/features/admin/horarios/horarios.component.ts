import { Component, OnInit, OnDestroy, ViewChild, signal, computed, effect, inject, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HorariosApiService } from '../../../core/services/horarios/horarios-api.service';
import { ErpCatalogoService } from '../../../core/services/horarios/erp-catalogo.service';
import {
  DIAS_SEMANA, DIAS_LABELS, fechaInicioDelDia, fechaFinDelDia,
  to12h as to12hUtil, getDiaLabel,
} from '../../../core/utils/horarios.util';
import { LucideAngularModule } from 'lucide-angular';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import { descargarReporteDia } from './reporte-dia.util';
import { HistorialCompetenciasModalComponent } from './historial-competencias-modal.component';
import { DisponibilidadAmbientesComponent } from './disponibilidad-ambientes.component';
import { NuevoHorarioWizardComponent } from './nuevo-horario-wizard.component';
import { CompetenciaTooltipComponent } from '../../../shared/components/competencia-tooltip.component';

/**
 * Portado de ChronoGest (features/admin/horarios/horarios.component.ts).
 * Cambios respecto al original:
 * - ApiService (monolítico) → HorariosApiService (horarios/competencias/eventos,
 *   backend-practica-hexagonal) + ErpCatalogoService (personas/cursos/ambientes,
 *   ERP real). Llamadas HTTP reescritas de RxJS (subscribe) a async/await, incl.
 *   el loop de polling (setInterval) que refresca horarios/eventos cada 30s.
 * - IDs de instructor/ficha/ambiente son UUIDs del ERP (no enteros autoincrement
 *   como en ChronoGest) — se eliminaron todas las coerciones `+id` (`+val`,
 *   `+ambienteId`) que habrían producido NaN; las comparaciones ahora son por
 *   igualdad de string.
 * - No existe endpoint /formativo/areas (getAreas()) — `fichaAreas` (usado para
 *   el filtro de área del wizard, tanto fichas como ambientes) se deriva 100%
 *   en el cliente combinando el campo `.area` de erpCatalogo.getFichas() y
 *   erpCatalogo.getAmbientes(). `dispAreaOpts` (panel de disponibilidad de
 *   ambientes) usa solo `.area` de los ambientes. El template espera el campo
 *   `area_nombre` (nombre heredado de ChronoGest) — se alias-ea `area_nombre:
 *   a.area` al construir `dispResult` en checkDisp() para no tocar el HTML.
 * - No existe endpoint /horarios-admin/competencias (getCompetenciasAdmin(),
 *   que en ChronoGest devolvía filas pre-unidas con instructor_nombre,
 *   ficha_codigo, ficha_programa, dia_semana, hora_inicio, horario anidado).
 *   Se reconstruye en openHistorial() cruzando horariosApi.getCompetencias()
 *   (catálogo completo, con resultados/diasClase/fechaInicio/fechaFin reales)
 *   con horariosApi.getHorarios() (por c.asignacionId === horario.id, ya que
 *   HorarioAsignadoTypeOrmRepository expone `id` = id de la asignación) y con
 *   erpCatalogo.getInstructores()/getFichas(), igual que enrichedHorarios más
 *   abajo. Los campos snake_case que ChronoGest devolvía ya resueltos se
 *   generan aquí mismo (instructor_nombre, ficha_codigo, ficha_programa,
 *   dia_semana, hora_inicio, fecha_inicio, fecha_fin, horario).
 * - Las competencias que trae GET /horarios (usadas en h.competencias para el
 *   tooltip de la celda matricial) solo incluyen {id, nombre} — el backend no
 *   proyecta resultados/diasClase/fechaInicio/fechaFin ahí (ver
 *   HorarioAsignadoTypeOrmRepository.toDomain). El tooltip de la celda por lo
 *   tanto solo muestra el nombre de la competencia vigente; el listado
 *   Historial de Competencias (que sí usa GET /competencias completo) muestra
 *   el detalle íntegro. Esta misma limitación ya existe en instructor-mis-horarios
 *   y aprendiz-mis-horarios portados previamente.
 * - erpCatalogo.getAmbientesDisponibilidad(dia, jornada) no devuelve detalle
 *   fino de conflicto (instructor/ficha ocupando el ambiente) — fichaOcupado y
 *   programaOcupado se fijan en null; el template ya oculta esas líneas
 *   cuando faltan. Si dia/jornada vienen vacíos (sin filtro) no hay match
 *   posible contra ningún horario real, por lo que TODOS los ambientes se
 *   listan como disponibles — se documenta como comportamiento esperado del
 *   nuevo endpoint (antes ChronoGest resolvía esto en su propio backend).
 * - ToastService: success/warning → ok/warn (info y error mantienen su nombre).
 * - descargarReporte() se mantiene sin cambios (100% cliente, sin llamada HTTP).
 */
@Component({
  selector: 'app-admin-horarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ConfirmDialogModule, HistorialCompetenciasModalComponent, DisponibilidadAmbientesComponent, NuevoHorarioWizardComponent, CompetenciaTooltipComponent],
  providers: [ConfirmationService],
  template: `
    <p-confirmdialog />

    <div class="page-header" style="display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:16px;">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 tracking-tight">{{ pageTitle() }}</h2>
        <p class="text-muted text-sm">{{ pageSubtitle() }} — {{ tableRows().length }} total</p>
      </div>

      <!-- Selector de vista: Instructor / Ficha / Ambiente (query param, sin recargar datos) -->
      <div class="inline-flex rounded-lg border border-gray-200 overflow-hidden">
        @for (t of tabs; track t.key) {
          <button class="px-4 py-2 text-sm font-medium transition-colors"
                  [class]="activeTab() === t.key ? 'bg-[#39A900] text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'"
                  (click)="cambiarVista(t.key)">{{ t.label }}</button>
        }
      </div>

      <!-- TOOLBAR: DISP_TITULO (Izquierda), LUPA Y BOTON (Derecha) -->
      <div class="toolbar" style="display:flex; align-items:center; gap:16px; flex-wrap:wrap; margin-left:auto; width:100%; justify-content:flex-end;">

        <!-- Título Informativo de Ambientes pegado a la Lupa -->
        @if (activeTab() === 'ambiente') {
           <div style="font-weight:600; font-size:13px; color:var(--text-muted); margin-right:auto; padding-top:10px;">
             <lucide-icon name="search" [size]="14" style="vertical-align:-2px; margin-right:4px; opacity:0.7;"></lucide-icon>
             Consultar Disponibilidad de Ambientes
           </div>
        }

        <button class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 font-medium rounded-lg transition-all" style="padding:9px 14px; white-space:nowrap; display:flex; align-items:center; gap:6px;" (click)="compTooltip.hide(); hist.abrir()">
          <lucide-icon name="clock" [size]="15"></lucide-icon> Historial
        </button>
        <button class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 font-medium rounded-lg transition-all" style="padding:9px 14px; white-space:nowrap; display:flex; align-items:center; gap:6px;" (click)="descargarReporte()">
          <lucide-icon name="download" [size]="15"></lucide-icon> Reporte del Día
        </button>
        <button class="bg-sena-gradient hover:opacity-90 text-white font-semibold rounded-lg transition-all" style="padding:9px 16px; white-space:nowrap;" (click)="wiz.abrir()">+ Nuevo Horario</button>
      </div>
    </div>

    <div class="matrix-wrap mt-4">

      <!-- BUSCADOR + FILTRO JORNADA integrado en la tabla -->
      <div class="matrix-search-bar">
        <div class="tbl-search-wrap">
          <lucide-icon name="search" [size]="14" class="tbl-search-icon"></lucide-icon>
          <input class="tbl-search-input"
                 [ngModel]="searchDisplay"
                 (ngModelChange)="onSearch($event)"
                 placeholder="Buscar instructor, ficha o ambiente...">
        </div>
        <!-- Filtro de jornada -->
        <div class="jornada-filter-chips">
          @for (chip of jornadaChips; track chip.key) {
            <button class="jornada-chip" [class.active]="filterJornada() === chip.key"
                    (click)="filterJornada.set(chip.key)">{{ chip.label }}</button>
          }
        </div>
        <span class="tbl-results-count">{{ filteredRows().length }} fila{{ filteredRows().length !== 1 ? 's' : '' }}</span>
      </div>

      <!-- Panel "Disponibilidad de Ambientes" — extraído a su propio componente (solo en pestaña ambientes) -->
      @if (activeTab() === 'ambiente') {
        <app-disponibilidad-ambientes [ambientes]="ambientes()" (elegir)="onElegirAmbienteDisponible($event)" />
      }

      <!-- Selector de día — solo visible en mobile (<768px), ver .day-tabs-mobile -->
      <div class="day-tabs-mobile">
        @for (d of dias; track d) {
          <button type="button" [class.active]="d === selectedDiaMobile()" [class.is-today]="isDiaHoy(d)" (click)="selectedDiaMobile.set(d)">{{ LABELS[d] }}</button>
        }
      </div>

      <div class="matrix-grid">
        <!-- HEADER ROW -->
        <div class="matrix-header-col sticky-header">{{ tabLabel().toUpperCase() }}</div>
        @for (d of dias; track d) {
          <div class="matrix-header-col day-col text-center sticky-header" [class.is-today]="isDiaHoy(d)" [class.day-col-selected]="d === selectedDiaMobile()">{{ LABELS[d] }}</div>
        }

        <!-- DATA ROWS -->
        @if (filteredRows().length === 0) {
        <div class="matrix-empty">Sin horarios registrados</div>
        }

        @for (row of filteredRows(); track row.entity.id) {
        <div class="matrix-row-item sticky-col">
          <div style="font-weight:700;color:var(--text);font-size:14px">
            {{ row.entity.nombre ?? row.entity.codigo }}
          </div>
          @if (row.entity.programa) {
          <div class="text-xs text-muted" style="margin-top:2px;">{{ row.entity.programa }}</div>
          }
        </div>

        @for (d of dias; track d) {
        <div class="matrix-cell day-col" style="position: relative;" [class.is-today]="isDiaHoy(d)" [class.day-col-selected]="d === selectedDiaMobile()">
          @if (row.horariosByDay[d]?.length) {
            @let slots = row.horariosByDay[d];
            @let idx = getSlotIdx(row.entity.id, d, slots.length);
            @let h = slots[idx];

          <div class="slot-wrapper">

            <div class="horario-card" [class.en-curso]="isCurrentTime(h)">
              @let fichaEvs = fichaEventoMap().get(h.fichaId ?? '');
              <div class="card-layout">

                <!-- ── Columna izquierda: toda la información ── -->
                <div class="card-main">
                  <div class="card-top">
                    <div class="info-row"><span class="info-label">Inicio</span><span class="info-val info-time">{{ to12h(h.horaInicio) }}</span></div>
                    <div class="info-row"><span class="info-label">Fin</span><span class="info-val info-time">{{ to12h(h.horaFin) }}</span></div>
                    <div class="info-row"><span class="info-label">Jornada</span><span class="info-val">{{ jornadaLabel(h.jornada) }}</span></div>

                    <div class="slot-nav-row" [style.visibility]="slots.length > 1 ? 'visible' : 'hidden'">
                      <div class="slot-dots">
                        @for (s of slots; track s.id; let i = $index) {
                          <span class="slot-dot" [class.active]="i === idx" [class.current]="isCurrentTime(s) && i !== idx"></span>
                        }
                      </div>
                      @if (slots.length > 1) {
                        <button class="slot-arrow-btn" (click)="nextSlot(row.entity.id, d, slots.length)" title="Ver siguiente jornada">
                          <lucide-icon name="chevron-right" [size]="13"></lucide-icon>
                        </button>
                      }
                    </div>

                    <div class="info-row"><span class="info-label">Ficha</span><span class="info-val">{{ h.ficha?.codigo ?? '—' }}</span></div>
                    <div class="info-row"><span class="info-label">Programa</span><span class="info-val">{{ h.ficha?.programa ?? '—' }}</span></div>
                    <div class="info-row">
                      <span class="info-label">Ambiente</span>
                      <span class="info-val">
                        @if (h.ubicacionTransversalNombre && h.ambiente?.nombre) {
                          <span class="amb-temp-wrap">
                            <span style="color:#d97706;font-weight:700;">{{ h.ubicacionTransversalNombre }}</span>
                            <lucide-icon name="info" [size]="10" style="color:#d97706;flex-shrink:0;"></lucide-icon>
                            <span class="amb-temp-tooltip">
                              <span class="amb-temp-row">
                                <span class="amb-temp-lbl">Temporal</span>
                                <span>{{ h.ubicacionTransversalNombre }}</span>
                              </span>
                              <span class="amb-temp-row">
                                <span class="amb-temp-lbl">Real asignado</span>
                                <span>{{ h.ambiente.nombre }}</span>
                              </span>
                            </span>
                          </span>
                        } @else {
                          {{ h.ambiente?.nombre ?? h.ubicacionTransversalNombre ?? '—' }}
                        }
                      </span>
                    </div>
                    @if (activeTab() !== 'instructor') {
                      <div class="info-row"><span class="info-label">Instructor</span><span class="info-val">{{ h.instructor?.nombre }} {{ h.instructor?.apellido }}</span></div>
                    }
                    @if (h.activo && h.instructor?.esTransversal && (h.ambiente?.nombre || h.ubicacionTransversalNombre)) {
                      <div class="transversal-env-badge mt-1">
                        <lucide-icon name="map-pin" [size]="10"></lucide-icon>
                        Transversal · {{ h.ambiente?.nombre ?? h.ubicacionTransversalNombre }}
                      </div>
                    }
                  </div>

                  <div class="card-bottom">
                    @if (h.minutosRetraso > 0 && isDiaHoy(h.diaSemana)) {
                      <div class="retraso-chip">
                        <lucide-icon name="clock" [size]="10"></lucide-icon>
                        Retraso: {{ h.minutosRetraso }} min
                      </div>
                    }
                    @if (h.activo && isDiaHoy(h.diaSemana)) {
                      <div class="progress-bar" style="margin-top:6px;">
                        <div class="progress-fill" [style.width.%]="calcProgress(h)"></div>
                      </div>
                      <div style="font-size:10px;color:var(--text-muted);text-align:right;margin-top:2px;">En curso · {{ calcProgress(h) }}%</div>
                    }
                    @if (isActive(h)) {
                      <span class="bg-green-100 text-green-700 rounded-full lowercase font-bold" style="font-size:10px;padding:2px 8px;margin-top:6px;display:inline-block;">activo</span>
                    } @else if (isFinalizadoHoy(h)) {
                      <div class="status-pill status-finalizado" style="margin-top:6px;">
                        <lucide-icon name="check-circle" [size]="9"></lucide-icon> Horario finalizado
                      </div>
                    } @else {
                      <span class="bg-gray-100 text-gray-500 rounded-full lowercase font-bold" style="font-size:10px;padding:2px 8px;margin-top:6px;display:inline-block;">inactivo</span>
                    }
                  </div>
                </div>

                <!-- ── Columna derecha: iconos interactivos ── -->
                <div class="card-actions-col">
                  <div class="card-help-btn"
                       [class.card-help-active]="compTooltip.state()?.h?.id === h.id"
                       (click)="compTooltip.abrir(h, h.compVigente, $event)">
                    <lucide-icon name="help-circle" [size]="15"></lucide-icon>
                  </div>
                  @if (fichaEvs?.length && isDiaHoy(h.diaSemana)) {
                    @for (ev of fichaEvs; track ev.id) {
                      @if (!isEventoPasado(ev, now())) {
                        <button [class]="'ev-notif-btn ev-notif-' + ev.tipo"
                                (mouseenter)="showEventoTooltip(ev, $event)"
                                (mouseleave)="hideEventoTooltip()">
                          <lucide-icon name="bell" [size]="9"></lucide-icon>
                        </button>
                      }
                    }
                  }
                  <button class="w-[26px] h-[26px] inline-flex items-center justify-center rounded-md hover:bg-red-50 text-red-600 transition-colors" style="margin-top:auto;" title="Eliminar" (click)="deleteHorario(h.id)">
                    <lucide-icon name="trash-2" [size]="14"></lucide-icon>
                  </button>
                </div>

              </div>
            </div>
          </div>
          } @else {
          <span style="color:var(--border);font-size:12px">—</span>
          }
        </div>
        }
        }
      </div>
    </div>

    <!-- FIN VIEW -->

    <!-- Tooltip de competencia — extraído a componente compartido -->
    <app-competencia-tooltip #compTooltip />

    <!-- Tooltip de Evento -->
    @if (eventoTooltip()) {
      <div [class]="'ev-tooltip-box ev-tooltip-' + eventoTooltip()!.ev.tipo"
           [style.left.px]="eventoTooltip()!.x"
           [style.top.px]="eventoTooltip()!.y">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;">
          <p style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;opacity:.8;margin:0;">
            {{ tipoLabelEvento(eventoTooltip()!.ev.tipo) }}
          </p>
          @if (eventoTooltip()!.pasado) {
            <span style="background:rgba(0,0,0,.12);border-radius:6px;padding:2px 7px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;opacity:.85;">
              Terminado
            </span>
          } @else if (eventoTooltip()!.noIniciado) {
            <span style="background:rgba(0,0,0,.10);border-radius:6px;padding:2px 7px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;opacity:.85;">
              No iniciado
            </span>
          }
        </div>
        <p style="font-weight:700;font-size:14px;margin:0 0 2px;color:inherit;">{{ eventoTooltip()!.ev.nombre }}</p>
        @if (eventoTooltip()!.ev.horaInicio) {
          <p style="display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;margin-top:6px;opacity:.85;">
            <lucide-icon name="clock" [size]="11"></lucide-icon>
            {{ to12h(eventoTooltip()!.ev.horaInicio) }} — {{ to12h(eventoTooltip()!.ev.horaFin) }}
          </p>
        }
        @if (eventoTooltip()!.ev.ubicacionNombre || eventoTooltip()!.ev.lugar) {
          <p style="display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;margin-top:4px;opacity:.85;">
            <lucide-icon name="map-pin" [size]="11"></lucide-icon>
            {{ eventoTooltip()!.ev.ubicacionNombre ?? eventoTooltip()!.ev.lugar }}
            @if (eventoTooltip()!.ev.ubicacionArea) {
              <span style="opacity:.7;font-weight:400;">— {{ eventoTooltip()!.ev.ubicacionArea }}</span>
            }
          </p>
        }
        @if (eventoTooltip()!.ev.descripcion) {
          <p style="font-size:12px;opacity:.75;border-top:1px solid currentColor;padding-top:6px;margin-top:6px;">{{ eventoTooltip()!.ev.descripcion }}</p>
        }
      </div>
    }

    <!-- Historial de Competencias — extraído a su propio componente -->
    <app-historial-competencias-modal #hist />

    <!-- Wizard "Nuevo Horario" — extraído a su propio componente (agnóstico del tab) -->
    <app-nuevo-horario-wizard #wiz
      [fichas]="fichas()" [ambientes]="ambientes()" [instructores]="instructores()" [horarios]="horarios()"
      (guardado)="loadAll()" />
  `,
  styleUrls: ['./horarios.component.css'],
})
export class AdminHorariosComponent implements OnInit, OnDestroy {
  @ViewChild('wiz') private wizRef!: NuevoHorarioWizardComponent;
  @ViewChild('compTooltip') private compTooltipRef!: CompetenciaTooltipComponent;

  readonly LABELS = DIAS_LABELS;
  readonly getDiaLabel = getDiaLabel;
  dias = [...DIAS_SEMANA] as string[];
  /** Día visible en el selector de pestañas mobile (<768px) — arranca en hoy. */
  selectedDiaMobile = signal<string>((() => {
    const semana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const hoy = semana[new Date().getDay()];
    return (DIAS_SEMANA as readonly string[]).includes(hoy) ? hoy : DIAS_SEMANA[0];
  })());

  tabs = [
    { key: 'instructor', label: 'Por Instructor' },
    { key: 'ficha', label: 'Por Ficha' },
    { key: 'ambiente', label: 'Por Ambiente' },
  ];

  activeTab = signal('instructor');

  // Filtro de jornada en la matriz
  filterJornada = signal('');
  jornadaChips = [
    { key: '', label: 'Todas' },
    { key: 'manana', label: 'Mañana' },
    { key: 'tarde', label: 'Tarde' },
    { key: 'noche', label: 'Noche' },
  ];

  // Búsqueda con debounce
  searchDisplay = '';
  searchSig = signal('');
  private _searchTimer: any = null;

  onSearch(val: string) {
    this.searchDisplay = val;
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.searchSig.set(val.toLowerCase()), 200);
  }

  tabLabel = computed(() => {
    const map: Record<string, string> = {
      instructor: 'Horarios por Instructor',
      ficha: 'Horarios por Ficha',
      ambiente: 'Horarios por Ambiente'
    };
    return map[this.activeTab()] ?? '';
  });
  pageTitle = computed(() => {
    const map: Record<string, string> = {
      instructor: 'Horarios de Instructores',
      ficha: 'Horarios de Fichas',
      ambiente: 'Horarios y Ambientes'
    };
    return map[this.activeTab()] ?? 'Gestión de Horarios';
  });
  pageSubtitle = computed(() => {
    const map: Record<string, string> = {
      instructor: 'Vista matricial semanal por instructor',
      ficha: 'Vista matricial semanal por ficha',
      ambiente: 'Vista de horarios por ambiente, disponibilidad y gestión de aulas'
    };
    return map[this.activeTab()] ?? 'Vista matricial semanal';
  });
  showModal = signal(false);
  saving = signal(false);
  formError = signal('');

  // Carrusel de múltiples jornadas por día
  now = signal<Date>(new Date());
  activeSlotMap = signal<Record<string, number>>({});
  /** Claves (entityId-day) donde el usuario navegó manualmente — no se sobreescriben con autoSwitch */
  private manualOverrides = new Set<string>();
  timer: any;

  horarios = signal<any[]>([]);
  fichas = signal<any[]>([]);
  ambientes = signal<any[]>([]);
  instructores = signal<any[]>([]);
  eventos = signal<any[]>([]);

  // ── Mapa ficha → eventos del día (todos, sin filtro de hora) ────
  fichaEventoMap = computed(() => {
    // Fecha LOCAL — toISOString() devuelve UTC y puede diferir en zonas GMT-
    const d = this.now();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    // Clave = UUID de ficha (string) — NO usar +fid (daría NaN para UUIDs)
    const map = new Map<string, any[]>();
    this.eventos().forEach(ev => {
      if (!ev.fechaInicio) return;
      const start = ev.fechaInicio.split('T')[0];
      const end   = (ev.fechaFin ?? ev.fechaInicio).split('T')[0];
      if (today < start || today > end) return;
      const seen = new Set<string>();
      (ev.fichasParticipantes ?? []).forEach((fid: any) => {
        const key = String(fid);
        if (!key || seen.has(key)) return;
        seen.add(key);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
      });
    });
    return map;
  });

  // ── Tooltip de Evento ─────────────────────────────────────────
  eventoTooltip = signal<{ ev: any; x: number; y: number; pasado: boolean; noIniciado: boolean } | null>(null);

  /**
   * Enriquece cada horario con los objetos anidados que buildRows() necesita.
   * GET /horarios devuelve fichaId/instructorId/ambienteId como UUIDs planos;
   * aquí los cruzamos con los signals ya cargados (fichas, instructores, ambientes).
   */
  private enrichedHorarios = computed(() => {
    const instMap  = new Map<string, any>(this.instructores().map((i: any) => [String(i.id), i]));
    const fichaMap = new Map<string, any>(this.fichas().map((f: any)       => [String(f.id), f]));
    const ambMap   = new Map<string, any>(this.ambientes().map((a: any)    => [String(a.id), a]));

    return this.horarios().map((h: any) => ({
      ...h,
      instructor: h.instructorId ? (instMap.get(String(h.instructorId)) ?? null) : null,
      ficha:      h.fichaId      ? (fichaMap.get(String(h.fichaId))     ?? null) : null,
      ambiente:   h.ambienteId   ? (ambMap.get(String(h.ambienteId))    ?? null) : null,
    }));
  });

  tableRows = computed(() => this.buildRows(this.activeTab(), this.enrichedHorarios()));
  filteredRows = computed(() => {
    const q  = this.searchSig();
    const jf = this.filterJornada();
    let rows = this.tableRows();

    // Filtrar por texto de búsqueda
    if (q) {
      rows = rows.filter(r => {
        const n = (r.entity.nombre ?? r.entity.codigo ?? '').toLowerCase();
        const p = (r.entity.programa ?? '').toLowerCase();
        return n.includes(q) || p.includes(q);
      });
    }

    // Filtrar por jornada. Antes solo decidía qué FILAS mostrar (si tenían
    // algún horario en esa jornada, en cualquier día) pero dejaba
    // horariosByDay intacto — cada celda seguía mostrando su carrusel
    // completo (incluyendo jornadas que no eran la filtrada), así que el
    // filtro parecía no hacer nada dentro de las filas que sí pasaban.
    // Ahora también se reconstruye horariosByDay por fila, dejando solo los
    // horarios de la jornada elegida (y vaciando los días sin ninguno).
    if (jf) {
      rows = rows
        .map(r => {
          const horariosByDay: Record<string, any[]> = {};
          for (const [day, slots] of Object.entries(r.horariosByDay)) {
            const matching = (slots as any[]).filter(h => h.jornada === jf);
            if (matching.length) horariosByDay[day] = matching;
          }
          return { ...r, horariosByDay };
        })
        .filter(r => Object.keys(r.horariosByDay).length > 0);
    }

    return rows;
  });

  private toast   = inject(ToastService);
  private confirm = inject(ConfirmationService);
  private auth    = inject(AuthService);

  constructor(
    private horariosApi: HorariosApiService,
    private erpCatalogo: ErpCatalogoService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    // La vista (instructor/ficha/ambiente) vive en el query param `vista`,
    // no en la ruta — así el toggle de vista no destruye/recrea el
    // componente ni recarga horarios/fichas/ambientes/instructores/eventos
    // de nuevo (antes eran 3 rutas separadas que sí lo hacían).
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe(qp => {
      const tab = qp['vista'];
      if (tab === 'instructor' || tab === 'ficha' || tab === 'ambiente') this.activeTab.set(tab);
    });
    // Auto-switch al horario activo según hora actual
    effect(() => {
      this.now(); // dependencia reactiva
      this.autoSwitchSlots();
    });
  }

  /** Cambia de vista actualizando solo el query param (sin recargar datos) */
  cambiarVista(tab: string): void {
    this.activeTab.set(tab);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { vista: tab },
      queryParamsHandling: 'merge',
    });
  }

  ngOnInit() {
    this.loadAll();
    // Actualiza el reloj Y recarga horarios/eventos cada 30s (pausado en 2do plano)
    this.timer = setInterval(async () => {
      if (document.hidden) return;
      this.now.set(new Date());
      try {
        this.horarios.set(await this.horariosApi.getHorarios());
      } catch { /* mantiene el último valor conocido */ }
      try {
        this.eventos.set((await this.horariosApi.getEventos()) ?? []);
      } catch { /* mantiene el último valor conocido */ }
      this.cdr.markForCheck();
    }, 30000);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async loadAll() {
    // Limpiar overrides manuales al recargar la vista completa
    this.manualOverrides.clear();

    const horariosP = this.horariosApi.getHorarios().catch(() => []);
    const fichasP = this.erpCatalogo.getFichas().catch(() => []);
    const ambientesP = this.erpCatalogo.getAmbientes().catch(() => {
      this.toast.error('Sin datos', 'No se pudieron cargar los ambientes. Verifica tu sesión.');
      return [];
    });
    const instructoresP = this.erpCatalogo.getInstructores().catch(() => {
      this.toast.error('Sin datos', 'No se pudieron cargar los instructores. Verifica tu sesión.');
      return [];
    });
    const eventosP = this.horariosApi.getEventos().catch(() => []);

    const [horarios, fichas, ambientes, instructores, eventos] = await Promise.all([
      horariosP, fichasP, ambientesP, instructoresP, eventosP,
    ]);

    this.horarios.set(horarios ?? []);
    this.fichas.set(fichas ?? []);
    this.ambientes.set(ambientes ?? []);
    this.instructores.set(instructores ?? []);
    this.eventos.set(eventos ?? []);
    this.cdr.markForCheck();
  }

  buildRows(tab: string, horarios: any[]): { entity: any; horariosByDay: Record<string, any[]> }[] {
    const map = new Map<string, { entity: any; horariosByDay: Record<string, any[]> }>();

    horarios.forEach(h => {
      let entity: any;
      if (tab === 'instructor') entity = h.instructor;
      else if (tab === 'ficha') entity = h.ficha;
      else entity = h.ambiente;
      if (!entity) return;

      h.compVigente = this.getCompetencia(h);

      if (!map.has(entity.id)) {
        map.set(entity.id, { entity, horariosByDay: {} });
      }
      const row = map.get(entity.id)!;
      if (!row.horariosByDay[h.diaSemana]) {
        row.horariosByDay[h.diaSemana] = [];
      }
      row.horariosByDay[h.diaSemana].push(h);
    });

    // Ordenar cada día por horaInicio
    map.forEach(row => {
      Object.keys(row.horariosByDay).forEach(day => {
        row.horariosByDay[day].sort((a: any, b: any) =>
          (a.horaInicio ?? '').localeCompare(b.horaInicio ?? '')
        );
      });
    });

    return Array.from(map.values());
  }

  // ── Carrusel de múltiples jornadas por día ──────────────────────
  getSlotIdx(entityId: string, day: string, len: number): number {
    // El filtro de jornada puede achicar los slots visibles de una celda
    // (ver filteredRows) — sin este clamp, un índice guardado del carrusel
    // completo podía apuntar fuera del array filtrado y romper el template.
    const raw = this.activeSlotMap()[`${entityId}-${day}`] ?? 0;
    return Math.min(raw, Math.max(len - 1, 0));
  }

  nextSlot(entityId: string, day: string, total: number) {
    const key = `${entityId}-${day}`;
    this.manualOverrides.add(key);
    const curr = this.activeSlotMap()[key] ?? 0;
    this.activeSlotMap.update(m => ({ ...m, [key]: (curr + 1) % total }));
    this.compTooltipRef.hide();
    this.hideEventoTooltip();
  }

  isCurrentTime(h: any): boolean {
    if (!h?.horaInicio || !h?.horaFin) return false;
    const curr = this.now();
    // Solo resaltar si la columna corresponde al día de hoy
    const days = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    if (h.diaSemana !== days[curr.getDay()]) return false;
    const [sh, sm] = h.horaInicio.split(':').map(Number);
    const [eh, em] = h.horaFin.split(':').map(Number);
    const nowMin = curr.getHours() * 60 + curr.getMinutes();
    return nowMin >= sh * 60 + sm && nowMin <= eh * 60 + em;
  }

  autoSwitchSlots() {
    const curr = this.now();
    const nowMin = curr.getHours() * 60 + curr.getMinutes();
    const updates: Record<string, number> = {};

    this.tableRows().forEach(row => {
      const entityId = row.entity.id;
      Object.entries(row.horariosByDay).forEach(([day, slots]: [string, any]) => {
        const key = `${entityId}-${day}`;
        // No sobreescribir celdas donde el usuario navegó manualmente
        if (this.manualOverrides.has(key)) return;
        if (!slots?.length || slots.length <= 1) return;
        const matchIdx = slots.findIndex((h: any) => {
          if (!h.horaInicio || !h.horaFin) return false;
          const [sh, sm] = h.horaInicio.split(':').map(Number);
          const [eh, em] = h.horaFin.split(':').map(Number);
          return nowMin >= sh * 60 + sm && nowMin <= eh * 60 + em;
        });
        if (matchIdx > -1) {
          updates[key] = matchIdx;
        }
      });
    });

    if (Object.keys(updates).length > 0) {
      this.activeSlotMap.update(m => ({ ...m, ...updates }));
    }
  }

  /** True si hoy es el último día del evento Y su horaFin ya pasó */
  isEventoPasado(ev: any, now: Date): boolean {
    if (!ev.horaFin) return false;
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const endDate = (ev.fechaFin ?? ev.fechaInicio)?.split('T')[0];
    if (endDate && endDate > today) return false;
    const [hh, mm] = ev.horaFin.split(':').map(Number);
    return now.getHours() * 60 + now.getMinutes() > hh * 60 + mm;
  }

  /** True si el evento aún no ha comenzado (horaInicio no ha llegado) */
  isEventoNoIniciado(ev: any, now: Date): boolean {
    if (!ev.horaInicio) return false;
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const startDate = ev.fechaInicio?.split('T')[0];
    if (startDate && startDate > today) return true;
    if (startDate && startDate < today) return false;
    const [hh, mm] = ev.horaInicio.split(':').map(Number);
    return now.getHours() * 60 + now.getMinutes() < hh * 60 + mm;
  }

  showEventoTooltip(ev: any, event: MouseEvent) {
    const el = event.currentTarget as HTMLElement;
    const card = el.closest('.horario-card');
    const rect = el.getBoundingClientRect();
    const cardRect = card ? card.getBoundingClientRect() : rect;
    const tooltipW = 240;
    const x = cardRect.right + 12 + tooltipW > window.innerWidth
      ? cardRect.left - tooltipW - 12
      : cardRect.right + 12;
    const y = Math.min(Math.max(rect.top - 8, 8), window.innerHeight - 210);
    this.eventoTooltip.set({
      ev, x, y,
      pasado: this.isEventoPasado(ev, this.now()),
      noIniciado: this.isEventoNoIniciado(ev, this.now()),
    });
  }
  hideEventoTooltip() { this.eventoTooltip.set(null); }

  tipoLabelEvento(t: string): string {
    return ({ formativo: 'Formativo', institucional: 'Institucional', evaluacion: 'Evaluación', festivo: 'Festivo / No lectivo' } as any)[t] ?? t;
  }
  tipoIconEvento(t: string): string {
    return ({ formativo: 'book-open', institucional: 'building', evaluacion: 'clipboard-check', festivo: 'umbrella' } as any)[t] ?? 'calendar';
  }

  jornadaLabel(j: string | null | undefined): string {
    return ({ manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' } as any)[j?.toLowerCase() ?? ''] ?? j ?? '—';
  }

  /** Convierte "HH:MM:SS" o "HH:MM" a formato 12h con am/pm */
  to12h(time: string | null | undefined): string {
    return to12hUtil(time);
  }

  isActive(h: any): boolean {
    if (!h.activo) return false;
    const now = this.now();
    const days = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    const diaHoy = days[now.getDay()];
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // El horario solo cuenta como activo si fue activado HOY (no la semana pasada)
    if (h.ultimaActivacion) {
      const actDate = new Date(h.ultimaActivacion);
      const sameDay = actDate.getFullYear() === now.getFullYear() &&
                      actDate.getMonth()    === now.getMonth()    &&
                      actDate.getDate()     === now.getDate();
      if (!sameDay) return false;
    }

    // Debe corresponder al día de hoy y no haber terminado
    if (h.diaSemana !== diaHoy) return false;
    if (h.horaFin) {
      const [eh, em] = h.horaFin.split(':').map(Number);
      if (nowMin > eh * 60 + em) return false;
    }
    return true;
  }

  isFinalizadoHoy(h: any): boolean {
    if (!h.ultimaActivacion) return false;
    const act = new Date(h.ultimaActivacion);
    const hoy = new Date();
    return act.getFullYear() === hoy.getFullYear() &&
           act.getMonth()    === hoy.getMonth()    &&
           act.getDate()     === hoy.getDate();
  }

  getCompetencia(h: any) {
    if (!h.competencias || h.competencias.length === 0) return null;
    const now = new Date();
    // Solo se considera la competencia VIGENTE (dentro de su período). Si ya
    // terminó su período, no debe seguir mostrándose (antes caía al último
    // elemento del arreglo sin importar si estaba vencido).
    return h.competencias.find((c: any) => {
      if (!c.fechaInicio) return true;
      const start = fechaInicioDelDia(c.fechaInicio);
      const end = c.fechaFin ? fechaFinDelDia(c.fechaFin) : new Date('2099-01-01T23:59:59');
      return now >= start && now <= end;
    }) ?? null;
  }

  // ── Día actual ─────────────────────────────────────────────────
  isDiaHoy(dia: string): boolean {
    const days = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    return days[new Date().getDay()] === dia;
  }

  /** Porcentaje de progreso del horario activo en el día (igual que en instructor) */
  calcProgress(h: any): number {
    if (!h.horaInicio || !h.horaFin) return 0;
    const curr = this.now();
    const [sh, sm] = h.horaInicio.split(':').map(Number);
    const [eh, em] = h.horaFin.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin   = eh * 60 + em;
    const nowMin   = curr.getHours() * 60 + curr.getMinutes();
    if (nowMin < startMin) return 0;
    if (nowMin > endMin) return 100;
    return Math.round(((nowMin - startMin) / (endMin - startMin)) * 100);
  }

  // ── Descarga reporte del día en PDF (100% cliente, sin llamada HTTP) ────
  descargarReporte() {
    descargarReporteDia(
      this.enrichedHorarios(),
      this.eventos(),
      this.ambientes().length,
      this.auth.aplicativoNombre() || 'EPSAS',
      this.auth.user()?.nombre ?? '—',
    );
  }

  // ── Abrir wizard desde ambiente disponible (panel de disponibilidad) ────
  onElegirAmbienteDisponible(evento: { ambiente: any; dia: string; jornada: string }) {
    this.wizRef.abrir({
      dia: evento.dia,
      jornada: evento.jornada,
      ambienteId: evento.ambiente.id,
      // area_nombre viene del alias que agrega DisponibilidadAmbientesComponent.checkDisp() (a.area del ERP)
      areaFiltro: evento.ambiente.area_nombre ?? '',
    });
  }

  async toggle(h: any) {
    const updated = await this.horariosApi.toggleHorario(h.id);
    this.horarios.update(list => list.map((x: any) => x.id === updated.id ? { ...x, activo: updated.activo } : x));
    this.cdr.markForCheck();
  }

  deleteHorario(id: string): void {
    this.confirm.confirm({
      message: '¿Eliminar este horario? Esta acción no se puede deshacer.',
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
      acceptButtonProps: { label: 'Sí, eliminar', severity: 'danger' },
      accept: async () => {
        try {
          await this.horariosApi.deleteHorario(id);
          this.horarios.update(list => list.filter(h => h.id !== id));
          this.toast.ok('Horario eliminado', 'El horario fue eliminado correctamente.');
        } catch (e: any) {
          this.toast.error('Error al eliminar', e?.error?.message ?? 'No se pudo eliminar el horario.');
        }
        this.cdr.markForCheck();
      },
    });
  }

}
