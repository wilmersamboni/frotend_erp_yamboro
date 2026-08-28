import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectorRef } from '@angular/core';
import { HorariosApiService } from '../../../core/services/horarios/horarios-api.service';
import { ErpCatalogoService } from '../../../core/services/horarios/erp-catalogo.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  DIAS_SEMANA, DIAS_LABELS, fechaInicioDelDia, fechaFinDelDia,
  to12h as to12hUtil,
} from '../../../core/utils/horarios.util';
import { LucideAngularModule } from 'lucide-angular';
import { CompetenciaTooltipComponent } from '../../../shared/components/competencia-tooltip.component';

/**
 * Portado de ChronoGest (features/aprendiz/mis-horarios/aprendiz-mis-horarios.component.ts).
 * Cambios respecto al original: la ficha del aprendiz ya no viene en el JWT
 * (`u.fichaId`) — se resuelve vía ErpCatalogoService.getMatriculasDePersona()
 * contra el ERP real. instructores/fichas/ambientes vienen de ErpCatalogoService
 * (adaptador sobre /api/personas, /api/cursos, /api/ambientes) en vez de los
 * endpoints propios /instructores, /fichas, /ambientes que ChronoGest tenía.
 */
@Component({
  selector: 'app-aprendiz-mis-horarios',
  imports: [LucideAngularModule, CompetenciaTooltipComponent],
  template: `
    <div class="page-header">
      <div><h2 class="text-2xl font-bold text-gray-900 tracking-tight">Mis Horarios</h2><p class="text-muted text-sm">Tu programación semanal (Pantalla Completa)</p></div>
    </div>

    @if (ficha()) {
    <div class="ficha-info-card mt-4 mb-4" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; background:var(--surface); padding:14px 18px; border:1px solid var(--border); border-radius:10px;">
      <span class="text-xs text-muted">Ficha:</span>
      <strong>{{ ficha().codigo }}</strong>
      <span class="bg-green-100 text-green-700 rounded-full lowercase font-bold" style="font-size:11px;padding:2px 9px;">{{ ficha().programa }}</span>
      @if (ficha().fechaInicio || ficha().fechaFin) {
        <span class="text-xs text-muted" style="margin-left:auto;"><lucide-icon name="calendar" [size]="14" style="vertical-align:-2px"></lucide-icon> {{ ficha().fechaInicio ?? '?' }} — {{ ficha().fechaFin ?? '?' }}</span>
      }
    </div>
    }

    @if (proximosEventos().length > 0) {
      <div class="proximos-eventos-card mt-4 mb-4">
        <p class="proximos-eventos-title">
          <lucide-icon name="calendar-clock" [size]="14"></lucide-icon> Próximos eventos
        </p>
        <div class="proximos-eventos-list">
          @for (ev of proximosEventos(); track ev.id) {
            <div class="prox-evento-row">
              <span [class]="'prox-evento-dot ev-notif-' + ev.tipo"
                    (mouseenter)="showEventoTooltip(ev, $event)"
                    (mouseleave)="hideEventoTooltip()">
                <lucide-icon name="bell" [size]="10"></lucide-icon>
              </span>
              <div class="prox-evento-info">
                <span class="prox-evento-nombre">{{ ev.nombre }}</span>
                <span class="prox-evento-meta">{{ tipoLabelEvento(ev.tipo) }} · {{ formatEventoRango(ev) }}</span>
              </div>
            </div>
          }
        </div>
      </div>
    }

    @if (errorCarga()) {
      <div class="mt-4" style="display:flex; flex-direction:column; align-items:center; gap:10px;
                               background:var(--surface); border:1px solid var(--border);
                               border-radius:10px; padding:32px 18px; text-align:center;">
        <lucide-icon name="alert-triangle" [size]="28" style="color:#dc2626;"></lucide-icon>
        <p style="margin:0; color:#dc2626; font-weight:600; font-size:14px;">{{ errorCarga() }}</p>
        <button type="button" (click)="inicializar()"
                style="padding:6px 18px; border:1px solid #dc2626; border-radius:8px;
                       background:transparent; color:#dc2626; font-size:13px; font-weight:600; cursor:pointer;">
          Reintentar
        </button>
      </div>
    } @else {
    <!-- Selector de día — solo visible en mobile (<768px), ver .day-tabs-mobile -->
    <div class="day-tabs-mobile">
      @for (d of dias; track d) {
        <button type="button" [class.active]="d === selectedDiaMobile()" [class.is-today]="isToday(d)" (click)="selectedDiaMobile.set(d)">{{ LABELS[d] }}</button>
      }
    </div>

    <div class="matrix-wrap">
      <div class="matrix-grid">
        <!-- HEADER ROW -->
        @for (d of dias; track d) {
          <div class="matrix-header-col day-col text-center" [class.is-today]="isToday(d)" [class.day-col-selected]="d === selectedDiaMobile()">
            {{ LABELS[d] }}
            @if (isToday(d)) { <br><span class="today-badge mt-1">HOY</span> }
          </div>
        }

        <!-- DATA ROW -->
        @for (d of dias; track d) {
        <div class="matrix-cell day-col" style="position: relative;" [class.day-col-selected]="d === selectedDiaMobile()">
          <div style="display:flex; flex-direction:column; gap:12px; width:100%; height:100%">
            @for (h of (horariosByDay()[d] ?? []); track h.id) {
              <div class="horario-card"
                   [class.active-session]="isActivo(d, h)"
                   [class.en-curso]="!isActivo(d, h) && isEnCursoAp(d, h)">
                <div class="card-layout">

                  <!-- ── Columna izquierda: toda la información ── -->
                  <div class="card-main">
                    <div class="card-top">
                      <div class="info-row"><span class="info-label">Inicio</span><span class="info-val info-time">{{ to12h(h.horaInicio) }}</span></div>
                      <div class="info-row"><span class="info-label">Fin</span><span class="info-val info-time">{{ to12h(h.horaFin) }}</span></div>
                      <div class="info-row"><span class="info-label">Jornada</span><span class="info-val">{{ jornadaLabel(h.jornada) }}</span></div>
                      <div class="info-row"><span class="info-label">Instructor</span><span class="info-val">{{ h.instructor?.nombre }} {{ h.instructor?.apellido }}</span></div>
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
                          } @else if (h.ambiente?.nombre) {
                            {{ h.ambiente.nombre }}
                          } @else if (h.ubicacionTransversalNombre) {
                            <span style="font-weight:700;color:#39A900">{{ h.ubicacionTransversalNombre }}</span>
                          } @else {
                            —
                          }
                        </span>
                      </div>

                      @if (h.minutosRetraso > 0 && isToday(d)) {
                        <div class="retraso-badge mt-2">Retraso: {{ h.minutosRetraso }} min</div>
                      }
                    </div><!-- end card-top -->

                    <div class="card-bottom">
                      @if (isActivo(d, h)) {
                        <div class="status-pill status-activa">
                          <lucide-icon name="radio" [size]="9"></lucide-icon> Clase activa
                        </div>
                        <div class="progress-bar mt-2">
                          <div class="progress-fill" [style.width.%]="calcDayProgress(h)"></div>
                        </div>
                        <div class="text-xs text-muted text-right mt-1">En curso · {{ calcDayProgress(h) }}%</div>
                      } @else if (isEnCursoAp(d, h)) {
                        <div class="status-pill status-en-horario">
                          <lucide-icon name="clock" [size]="9"></lucide-icon> En horario
                        </div>
                        <div class="progress-bar mt-2">
                          <div class="progress-fill progress-fill-light" [style.width.%]="calcDayProgress(h)"></div>
                        </div>
                        <div class="text-xs text-muted text-right mt-1">{{ calcDayProgress(h) }}%</div>
                      } @else if (isFinalizado(d, h)) {
                        <div class="status-pill status-finalizado">
                          <lucide-icon name="check-circle" [size]="9"></lucide-icon> Horario finalizado
                        </div>
                      } @else {
                        <span class="bg-gray-100 text-gray-500 rounded-full lowercase font-bold" style="font-size:11px;padding:2px 9px;margin-top:6px;display:inline-block;">inactivo</span>
                      }
                    </div><!-- end card-bottom -->
                  </div><!-- end card-main -->

                  <!-- ── Columna derecha: iconos interactivos ── -->
                  <div class="card-actions-col">
                    <div class="card-help-btn"
                         [class.card-help-active]="compTooltip.state()?.h?.id === h.id"
                         (click)="compTooltip.abrir(h, getCompetenciaVigente(h), $event)">
                      <lucide-icon name="help-circle" [size]="15"></lucide-icon>
                    </div>
                    @if (fichaEventos().length && isToday(d)) {
                      @for (ev of fichaEventos(); track ev.id) {
                        <button [class]="'ev-notif-btn ev-notif-' + ev.tipo"
                                (mouseenter)="showEventoTooltip(ev, $event)"
                                (mouseleave)="hideEventoTooltip()">
                          <lucide-icon name="bell" [size]="9"></lucide-icon>
                        </button>
                      }
                    }
                  </div>

                </div><!-- end card-layout -->
              </div>
            }
            @if (!(horariosByDay()[d]?.length)) {
              <span style="color:var(--border);font-size:12px; margin: auto;">—</span>
            }
          </div>
        </div>
        }
      </div>
    </div>
    }

    <!-- Tooltip de competencia — extraído a componente compartido -->
    <app-competencia-tooltip #compTooltip />

    <!-- Tooltip de Evento activo -->
    @if (eventoTooltip()) {
      <div [class]="'ev-tooltip-box ev-tooltip-' + eventoTooltip()!.ev.tipo"
           [style.left.px]="eventoTooltip()!.x"
           [style.top.px]="eventoTooltip()!.y">
        <p style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;opacity:.8;margin-bottom:5px;">
          {{ tipoLabelEvento(eventoTooltip()!.ev.tipo) }}
        </p>
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
  `,
  styleUrls: ['./aprendiz-mis-horarios.component.css'],
})
export class AprendizMisHorariosComponent implements OnInit, OnDestroy {
  readonly LABELS = DIAS_LABELS;
  dias = [...DIAS_SEMANA] as string[];
  /** Día visible en el selector de pestañas mobile (<768px) — arranca en hoy. */
  selectedDiaMobile = signal<string>((() => {
    const semana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const hoy = semana[new Date().getDay()];
    return (DIAS_SEMANA as readonly string[]).includes(hoy) ? hoy : DIAS_SEMANA[0];
  })());
  ficha = signal<any>(null);
  horariosByDay = signal<Record<string, any[] | undefined>>({});
  eventoTooltip = signal<{ ev: any; x: number; y: number } | null>(null);
  eventos = signal<any[]>([]);
  /** Mensaje de error de la carga principal; null = sin error */
  errorCarga = signal<string | null>(null);

  private fichaIdActual: string | null = null;
  private pollingHandle?: ReturnType<typeof setInterval>;

  fichaEventos = computed(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const nowMin = d.getHours() * 60 + d.getMinutes();
    return this.eventos().filter(ev => {
      if (!ev.fechaInicio) return false;
      const start = ev.fechaInicio.split('T')[0];
      const end = (ev.fechaFin ?? ev.fechaInicio).split('T')[0];
      if (!(today >= start && today <= end)) return false;
      if (today === end && ev.horaFin) {
        const [hh, mm] = ev.horaFin.split(':').map(Number);
        if (nowMin > hh * 60 + mm) return false;
      }
      return true;
    });
  });

  /** Eventos que no han terminado todavía (incluye los de hoy), para dar visibilidad
   *  anticipada — antes solo se veían el mismo día vía `fichaEventos`. */
  proximosEventos = computed(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return this.eventos()
      .filter(ev => ev.fechaInicio && (ev.fechaFin ?? ev.fechaInicio).split('T')[0] >= today)
      .sort((a, b) => (a.fechaInicio ?? '').localeCompare(b.fechaInicio ?? ''));
  });

  constructor(
    private horariosApi: HorariosApiService,
    private erpCatalogo: ErpCatalogoService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit() {
    await this.inicializar();
  }

  /** Carga inicial. Pública para poder reintentarla desde el botón de error. */
  async inicializar() {
    const u = this.auth.user();
    if (!u?.personaId) return;

    this.errorCarga.set(null);
    try {
      // Matrículas y horarios son EL contenido de la vista: si fallan se
      // muestra el estado de error con "Reintentar", no una grilla vacía.
      const matriculas = await this.erpCatalogo.getMatriculasDePersona(u.personaId);
      const activa = matriculas.find((m: any) => m.ficha) ?? null;
      const fichaId = activa?.ficha?.id ?? null;
      if (!fichaId) return; // sin ficha activa: estado vacío legítimo

      this.fichaIdActual = fichaId;
      await this.cargarDatos(fichaId);
      this.eventos.set(await this.eventosDeFicha(fichaId));
    } catch (err: any) {
      console.error('[mis-horarios] carga inicial falló', err?.status ?? err);
      this.errorCarga.set('No se pudieron cargar tus horarios. Verifica tu conexión e intenta de nuevo.');
      return;
    }

    if (!this.pollingHandle) {
      this.pollingHandle = setInterval(async () => {
        // Pestaña en segundo plano: no gastar cupo del rate limit en un refresco
        // que nadie está viendo.
        if (document.hidden) return;
        this.horariosByDay.set({ ...this.horariosByDay() });
        if (this.fichaIdActual) this.eventos.set(await this.eventosDeFicha(this.fichaIdActual));
      }, 60000);
    }
  }

  ngOnDestroy(): void {
    if (this.pollingHandle) clearInterval(this.pollingHandle);
  }

  /** Los eventos son un dato secundario (banner): si fallan se degradan a
   *  lista vacía, pero el error queda logueado con contexto. */
  private eventosDeFicha(fichaId: string): Promise<any[]> {
    return this.horariosApi.getEventosByFicha(fichaId).catch((err: any) => {
      console.error(`[mis-horarios] GET eventos de ficha ${fichaId} falló`, err?.status ?? err);
      return [];
    });
  }

  formatDiaClase(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const dias = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
    return `${dias[date.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  }

  /** "Lu 05/08" o "Lu 05/08 — Vi 09/08" si el evento abarca varios días. */
  formatEventoRango(ev: any): string {
    const start = ev.fechaInicio?.split('T')[0];
    if (!start) return '';
    const end = (ev.fechaFin ?? ev.fechaInicio).split('T')[0];
    const startFmt = this.formatDiaClase(start);
    return end === start ? startFmt : `${startFmt} — ${this.formatDiaClase(end)}`;
  }

  formatDiaClaseFull(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return `${dias[date.getDay()]}: ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  }

  async cargarDatos(fichaIdParam?: string) {
    const fichaId = fichaIdParam ?? this.fichaIdActual;
    if (!fichaId) return;

    // Los horarios son el dato principal: sin catch, su fallo lo maneja
    // inicializar(). Los catálogos solo enriquecen (nombres de ficha/ambiente/
    // instructor): si fallan, se degrada la vista pero queda logueado.
    const [horarios, fichas, ambientes, instructores] = await Promise.all([
      this.horariosApi.getHorariosByFicha(fichaId),
      this.erpCatalogo.getFichas().catch((err: any) => this.catalogoFallido('fichas', err)),
      this.erpCatalogo.getAmbientes().catch((err: any) => this.catalogoFallido('ambientes', err)),
      this.erpCatalogo.getInstructores().catch((err: any) => this.catalogoFallido('instructores', err)),
    ]);

    const fichaMap = new Map<string, any>((fichas as any[]).map((f: any) => [String(f.id), f]));
    const ambMap = new Map<string, any>((ambientes as any[]).map((a: any) => [String(a.id), a]));
    const instrMap = new Map<string, any>((instructores as any[]).map((i: any) => [String(i.id), i]));

    const fichaInfo = fichaMap.get(String(fichaId)) ?? null;
    if (fichaInfo) this.ficha.set(fichaInfo);

    const byDay: Record<string, any[]> = {};
    this.dias.forEach(d => byDay[d] = []);
    (horarios as any[]).forEach((hor: any) => {
      const enriched = {
        ...hor,
        ficha: hor.fichaId ? (fichaMap.get(String(hor.fichaId)) ?? null) : null,
        ambiente: hor.ambienteId ? (ambMap.get(String(hor.ambienteId)) ?? null) : null,
        instructor: hor.instructorId ? (instrMap.get(String(hor.instructorId)) ?? null) : null,
      };
      if (!byDay[enriched.diaSemana]) byDay[enriched.diaSemana] = [];
      byDay[enriched.diaSemana].push(enriched);
    });
    Object.keys(byDay).forEach(k => {
      byDay[k].sort((a: any, b: any) => (a.horaInicio ?? '').localeCompare(b.horaInicio ?? ''));
    });
    this.horariosByDay.set(byDay);
    setTimeout(() => this.cdr.detectChanges());
  }

  private catalogoFallido(nombre: string, err: any): any[] {
    console.error(`[mis-horarios] GET catálogo de ${nombre} falló`, err?.status ?? err);
    return [];
  }

  isToday(dia: string): boolean {
    const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    return days[new Date().getDay()] === dia;
  }

  private enRangoHorario(h: any): boolean {
    if (!h.horaInicio || !h.horaFin) return false;
    const [sh, sm] = h.horaInicio.split(':').map(Number);
    const [eh, em] = h.horaFin.split(':').map(Number);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    return nowMin >= sh * 60 + sm && nowMin <= eh * 60 + em;
  }

  private activacionEsHoy(h: any): boolean {
    if (!h.ultimaActivacion) return false;
    const act = new Date(h.ultimaActivacion);
    const hoy = new Date();
    return act.getFullYear() === hoy.getFullYear() &&
           act.getMonth() === hoy.getMonth() &&
           act.getDate() === hoy.getDate();
  }

  isActivo(dia: string, h: any): boolean {
    return this.isToday(dia) && this.activacionEsHoy(h) && this.enRangoHorario(h);
  }

  isEnCursoAp(dia: string, h: any): boolean {
    return this.isToday(dia) && this.enRangoHorario(h);
  }

  private horaFinalizo(h: any): boolean {
    if (!h.horaFin) return false;
    const [eh, em] = h.horaFin.split(':').map(Number);
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() > eh * 60 + em;
  }

  isFinalizado(dia: string, h: any): boolean {
    return this.isToday(dia) && this.activacionEsHoy(h) && this.horaFinalizo(h);
  }

  now() { return new Date(); }

  calcDayProgress(h: any): number {
    if (!h.horaInicio || !h.horaFin) return 0;
    const curr = this.now();
    const [sh, sm] = h.horaInicio.split(':').map(Number);
    const [eh, em] = h.horaFin.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const nowMin = curr.getHours() * 60 + curr.getMinutes();

    if (nowMin < startMin) return 0;
    if (nowMin > endMin) return 100;
    return Math.round(((nowMin - startMin) / (endMin - startMin)) * 100);
  }

  getCompetenciaVigente(h: any): any | null {
    if (!h.competencias || h.competencias.length === 0) return null;
    const current = this.now();
    const vigente = h.competencias.find((c: any) => {
      if (!c.fechaInicio) return true;
      const start = fechaInicioDelDia(c.fechaInicio);
      const end = c.fechaFin ? fechaFinDelDia(c.fechaFin) : new Date('2099-01-01T23:59:59');
      return current >= start && current <= end;
    });
    return vigente ?? null;
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
    this.eventoTooltip.set({ ev, x, y });
  }
  hideEventoTooltip() { this.eventoTooltip.set(null); }

  tipoLabelEvento(t: string): string {
    return ({ formativo: 'Formativo', institucional: 'Institucional', evaluacion: 'Evaluación', festivo: 'Festivo / No lectivo' } as any)[t] ?? t;
  }

  jornadaLabel(j: string): string {
    return ({ manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' } as any)[j?.toLowerCase()] ?? j ?? '—';
  }

  to12h(time: string | null | undefined): string {
    return to12hUtil(time) || '—';
  }
}
