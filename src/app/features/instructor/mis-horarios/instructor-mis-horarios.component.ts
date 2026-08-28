import { Component, OnInit, signal, OnDestroy, computed, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HorariosApiService } from '../../../core/services/horarios/horarios-api.service';
import { ErpCatalogoService } from '../../../core/services/horarios/erp-catalogo.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  DIAS_SEMANA, DIAS_LABELS, fechaInicioDelDia, fechaFinDelDia,
  estadoResultado, to12h as to12hUtil,
  jornadaLabel as jornadaLabelUtil, formatFechaCorta,
} from '../../../core/utils/horarios.util';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../../core/services/toast.service';
import { ConsultarUbicacionComponent } from './consultar-ubicacion.component';
import { HistorialInstructorModalComponent } from './historial-instructor-modal.component';
import { NuevaCompetenciaModalComponent } from './nueva-competencia-modal.component';
import { CompetenciaTooltipComponent } from '../../../shared/components/competencia-tooltip.component';

/**
 * Portado de ChronoGest (features/instructor/mis-horarios/mis-horarios.component.ts).
 * Cambios respecto al original:
 * - ApiService (monolítico) → HorariosApiService (horarios/competencias/eventos, backend-practica-hexagonal)
 *   + ErpCatalogoService (personas/cursos/ambientes, ERP real). Llamadas HTTP reescritas de
 *   RxJS (forkJoin/subscribe) a async/await sobre las Promises que exponen ambos servicios.
 * - No existe un endpoint dedicado /instructores/:id — se usa erpCatalogo.getPersona(personaId),
 *   que trae los mismos campos de verdad (incl. esTransversal) que ChronoGest leía de /instructores/:id.
 * - Los 3 endpoints de disponibilidad de ChronoGest (getAmbientesDisponiblesTransversal,
 *   getUbicacionesDisponiblesTransversal, getAmbientes) se consolidan en un único
 *   erpCatalogo.getAmbientesDisponibilidad(dia, jornada, tipo?) que devuelve
 *   {...ambiente, disponible: boolean}[]. Se mapea localmente a la forma que espera el template
 *   (area_nombre / estado 'libre'|'conflicto'|'ocupado'). El nuevo backend NO expone el detalle
 *   fino del conflicto (instructor/ficha/minutosRetraso ocupando el ambiente, o el evento que
 *   ocupa una ubicación transversal) — esos campos quedan en null; la UI simplemente no muestra
 *   esas líneas de detalle (el template ya las oculta con @if cuando faltan).
 * - El backend nuevo NO implementa el shape de conflicto en PATCH /horarios/:id/play
 *   (e.error.ambienteOcupado / instructorNombre / ambienteNombre) — ese manejo de error se deja
 *   intacto por fidelidad estructural, pero es código muerto hasta que el backend lo soporte.
 * - AuthService: auth.currentUser() → auth.user() (signal); identidad = user.personaId (no user.id).
 *   esTransversal ya no viene del JWT/localStorage — se resuelve 100% desde DB en cargarDatos().
 * - ToastService: success/warning → ok/warn (info y error mantienen su nombre).
 */
@Component({
  selector: 'app-instructor-mis-horarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, ConsultarUbicacionComponent, HistorialInstructorModalComponent, NuevaCompetenciaModalComponent, CompetenciaTooltipComponent],
  template: `
    <div class="page-header">
      <div><h2 class="text-2xl font-bold text-gray-900 tracking-tight">Mis Horarios</h2><p class="text-muted text-sm">Tu programación semanal (Pantalla Completa)</p></div>
      <button class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 rounded-lg px-4 py-2 transition-all" style="display:flex;align-items:center;gap:6px;font-size:13px;" (click)="compTooltip.hide(); hist.abrir()">
        <lucide-icon name="clock" [size]="15"></lucide-icon> Historial de Competencias
      </button>
    </div>

    @if (proximosEventos().length > 0) {
      <div class="proximos-eventos-card mt-4">
        <p class="proximos-eventos-title">
          <lucide-icon name="calendar-clock" [size]="14"></lucide-icon> Próximos eventos
        </p>
        <div class="proximos-eventos-list">
          @for (item of proximosEventos(); track item.ev.id) {
            <div class="prox-evento-row">
              <span [class]="'prox-evento-dot ev-notif-' + item.ev.tipo"
                    (mouseenter)="showEventoTooltip(item.ev, $event)"
                    (mouseleave)="hideEventoTooltip()">
                <lucide-icon name="bell" [size]="10"></lucide-icon>
              </span>
              <div class="prox-evento-info">
                <span class="prox-evento-nombre">{{ item.ev.nombre }}</span>
                <span class="prox-evento-meta">
                  {{ tipoLabelEvento(item.ev.tipo) }} · {{ formatEventoRango(item.ev) }}
                  @if (item.codigos.length) {
                    · Ficha{{ item.codigos.length > 1 ? 's' : '' }} {{ item.codigos.join(', ') }}
                  }
                </span>
              </div>
            </div>
          }
        </div>
      </div>
    }

    <!-- Selector de día — solo visible en mobile (<768px), ver .day-tabs-mobile -->
    <div class="day-tabs-mobile">
      @for (d of dias; track d) {
        <button type="button" [class.active]="d === selectedDiaMobile()" [class.is-today]="isToday(d)" (click)="selectedDiaMobile.set(d)">{{ LABELS[d] }}</button>
      }
    </div>

    <div class="matrix-wrap mt-4">
      <div class="matrix-grid">
        <!-- HEADER ROW -->
        @for (d of dias; track d) {
          <div class="matrix-header-col day-col text-center" [class.is-today]="isToday(d)" [class.day-col-selected]="d === selectedDiaMobile()">
            {{ LABELS[d] }}
          </div>
        }

        <!-- DATA ROW -->
        @for (d of dias; track d) {
        <div class="matrix-cell day-col" style="position: relative;" [class.day-col-selected]="d === selectedDiaMobile()">
          @if (horariosByDay()[d]?.length) {
            @let slots = horariosByDay()[d];
            @let idx = getSlotIdx(d);
            @let h = slots[idx];
            <div class="slot-wrapper">

              <div class="horario-card" [class.active-session]="isHorarioActivo(d, h)" [class.en-curso]="!isHorarioActivo(d, h) && isEnCurso(d, h, now())">
                @let fichaEvs = h.ficha?.codigo ? fichaEventoMap().get(h.ficha.codigo) : null;
                <div class="card-layout">

                  <!-- ── Columna izquierda: toda la información ── -->
                  <div class="card-main">

                    <!-- Dots de navegación -->
                    <div class="slot-nav-row" [style.visibility]="slots.length > 1 ? 'visible' : 'hidden'">
                      <div class="slot-dots">
                        @for (s of slots; track s.id; let i = $index) {
                          <span class="slot-dot"
                                [class.active]="i === idx"
                                [class.current]="isEnCurso(d, s, now()) && i !== idx"
                                (click)="setSlot(d, i)"
                                style="cursor:pointer"
                                [title]="to12h(s.horaInicio) + ' — ' + to12h(s.horaFin)"></span>
                        }
                      </div>
                      @if (slots.length > 1) {
                        <button class="slot-arrow-btn" (click)="nextSlot(d, slots.length)" title="Ver siguiente jornada">
                          <lucide-icon name="chevron-right" [size]="13"></lucide-icon>
                        </button>
                      }
                    </div>

                    <!-- TOP: info dinámica -->
                    <div class="card-top">
                      <div class="info-row"><span class="info-label">Inicio</span><span class="info-val info-time">{{ to12h(h.horaInicio) }}</span></div>
                      <div class="info-row"><span class="info-label">Fin</span><span class="info-val info-time">{{ to12h(h.horaFin) }}</span></div>
                      <div class="info-row"><span class="info-label">Jornada</span><span class="info-val">{{ jornadaLabel(h.jornada) }}</span></div>
                      <div class="info-row"><span class="info-label">Ficha</span><span class="info-val">{{ h.ficha?.codigo ?? '—' }}</span></div>
                      <div class="info-row"><span class="info-label">Programa</span><span class="info-val">{{ h.ficha?.programa ?? '—' }}</span></div>
                      <div class="info-row">
                        <span class="info-label">Ambiente</span>
                        <span class="info-val">
                          @if (ambienteSeleccionado()[h.id]) {
                            <!-- Pre-selección antes de iniciar (transversal o conflicto) -->
                            <span style="font-weight:700;color:#39A900">{{ ambienteSeleccionado()[h.id].nombre }}</span>
                            @if (!isHorarioActivo(d, h)) {
                              <button class="limpiar-amb-btn" title="Quitar selección" (click)="limpiarAmbiente(h)">✕</button>
                            }
                          } @else if (h.ubicacionTransversalNombre && h.ambiente?.nombre) {
                            <!-- Instructor regular con ubicación temporal — tooltip al hover -->
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
                            {{ esTransversal() ? 'Sin ambiente' : '—' }}
                          }
                        </span>
                      </div>

                      @if (h.minutosRetraso > 0 && isToday(d)) {
                        <div class="retraso-badge mt-2">Retraso: {{ h.minutosRetraso }} min</div>
                      }

                      <!-- Alerta de conflicto de ambiente (instructor regular) -->
                      @if (ambienteConflicto()[h.id]) {
                        <div class="conflicto-alert mt-2">
                          <lucide-icon name="alert-circle" [size]="11" style="flex-shrink:0;margin-top:1px;"></lucide-icon>
                          <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;line-height:1.3;">Ambiente ocupado</div>
                            <div style="opacity:.85;">En uso por <strong>{{ ambienteConflicto()[h.id].instructorNombre }}</strong> en <strong>{{ ambienteConflicto()[h.id].ambienteNombre }}</strong></div>
                            <button class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 rounded-lg btn-full"
                                    style="margin-top:6px;font-size:10px;padding:4px 8px;display:flex;align-items:center;justify-content:center;gap:4px;"
                                    (click)="buscarAlternativa(h)">
                              <lucide-icon name="search" [size]="10"></lucide-icon> Buscar otro ambiente
                            </button>
                          </div>
                        </div>
                      }

                      @if (esTransversal() && !isHorarioActivo(d, h) && !ambienteSeleccionado()[h.id] && !h.ambiente?.nombre && !h.ubicacionTransversalNombre && isToday(d) && !h.motivoFinalizacion) {
                        <button class="btn-full rounded-lg mt-2 transition-all"
                                [class]="ubic.consultandoId() === h.id
                                  ? 'bg-sena-gradient text-white'
                                  : 'border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700'"
                                style="font-size:11px; padding:4px 8px; display:flex; align-items:center; justify-content:center; gap:5px;"
                                (click)="ubic.consultarAmbientes(h)">
                          <lucide-icon name="search" [size]="12"></lucide-icon>
                          {{ ubic.consultandoId() === h.id ? 'Consultando...' : 'Consultar Ambientes' }}
                        </button>
                      }
                    </div><!-- end card-top -->

                    <!-- BOTTOM: acciones + progreso -->
                    <div class="card-bottom">
                      <div style="display:flex; flex-direction:column; gap:8px;">
                        @if (!isHorarioActivo(d, h)) {
                          <button class="btn-full rounded-lg bg-sena-gradient hover:opacity-90 text-white transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                                  style="display:flex; align-items:center; justify-content:center; gap:6px; font-weight: 700; padding:6px 10px; font-size:12px;"
                                  [disabled]="!puedeIniciar(d, h, ambienteSeleccionado())"
                                  (click)="playHorario(h)">
                            <lucide-icon name="play" [size]="14"></lucide-icon> Iniciar Clases
                          </button>
                        } @else {
                          <button class="btn-full rounded-lg border border-red-300 hover:bg-red-50 text-red-600 transition-all"
                                  style="display:flex; align-items:center; justify-content:center; gap:6px; padding:6px 10px; font-size:12px;"
                                  (click)="promptFinalizar(h)">
                            <lucide-icon name="square" [size]="14"></lucide-icon> Finalizar Clases
                          </button>
                        }
                      </div>

                      @if (isHorarioActivo(d, h)) {
                        <div class="progress-bar mt-3">
                          <div class="progress-fill" [style.width.%]="calcProgress(h)"></div>
                        </div>
                        <div class="text-xs text-muted text-right mt-1">En curso · {{ calcProgress(h) }}%</div>
                      }

                      @if(!isHorarioActivo(d, h) && !puedeIniciar(d, h, ambienteSeleccionado()) && activacionEsHoy(h)) {
                        <div class="status-pill status-finalizado mt-2">
                          <lucide-icon name="check-circle" [size]="9"></lucide-icon> Horario finalizado
                        </div>
                      }

                      <button class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 rounded-lg btn-full mt-3" style="font-size: 11px; padding:4px 8px;" (click)="comp.abrir(h)">
                        + Añadir Competencia
                      </button>
                    </div><!-- end card-bottom -->

                  </div><!-- end card-main -->

                  <!-- ── Columna derecha: iconos interactivos ── -->
                  <div class="card-actions-col">
                    <div class="card-help-btn"
                         [class.card-help-active]="compTooltip.state()?.h?.id === h.id"
                         (click)="compTooltip.abrir(h, getCompetenciaVigente(h), $event)">
                      <lucide-icon name="help-circle" [size]="15"></lucide-icon>
                    </div>
                    @if (fichaEvs?.length && isToday(d)) {
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
                  </div>

                </div><!-- end card-layout -->
              </div><!-- end horario-card -->
            </div><!-- end slot-wrapper -->
          } @else {
            <span style="color:var(--border);font-size:12px; margin: auto;">—</span>
          }
        </div>
        }
      </div>
    </div>

    <!-- ═══ Panel de selección de ubicación — extraído a su propio componente ═══ -->
    <app-consultar-ubicacion #ubic (elegir)="onUbicacionElegida($event)" />

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

    <!-- ═══ HISTORIAL DE COMPETENCIAS — extraído a su propio componente ═══ -->
    <app-historial-instructor-modal #hist [fichas]="fichas()" />

    <!-- Competencia Modal — extraído a su propio componente -->
    <app-nueva-competencia-modal #comp (guardado)="cargarDatos()" />

    <!-- Finalizar Modal -->
    @if (finModal().visible) {
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" (click)="$event.stopPropagation()">
        <div class="flex items-start justify-between gap-3 mb-2">
          <h3 class="text-red-600 font-bold">Cierre Anticipado</h3>
          <button class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" (click)="closeFin()"><lucide-icon name="x" [size]="18"></lucide-icon></button>
        </div>
        <p class="text-sm mt-2 text-muted">¿Estás seguro de finalizar la clase antes del tiempo estipulado? Esto notificará a Administración.</p>
        <div class="form-group mt-3">
          <label class="block text-xs font-semibold text-gray-600 mb-1">Motivo (Obligatorio) *</label>
          <textarea class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900] resize-y" [(ngModel)]="finMotivo" rows="3" placeholder="Ej: Falla eléctrica..."></textarea>
        </div>
        <div class="btn-row mt-4">
          <button class="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-5 py-2 transition-all" (click)="closeFin()">Cancelar</button>
          <button class="bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl px-5 py-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed" [disabled]="!finMotivo" (click)="confirmarFinalizar()">Finalizar y Notificar</button>
        </div>
      </div>
    </div>
    }
  `,
  styleUrls: ['./instructor-mis-horarios.component.css'],
})
export class InstructorMisHorariosComponent implements OnInit, OnDestroy {
  readonly LABELS = DIAS_LABELS;
  dias = [...DIAS_SEMANA] as string[];
  horariosByDay = signal<Record<string, any[]>>({});

  /** Día visible en el selector de pestañas mobile (<768px) — arranca en hoy. */
  selectedDiaMobile = signal<string>((() => {
    const semana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const hoy = semana[new Date().getDay()];
    return (DIAS_SEMANA as readonly string[]).includes(hoy) ? hoy : DIAS_SEMANA[0];
  })());

  eventoTooltip = signal<{ ev: any; x: number; y: number; pasado: boolean; noIniciado: boolean } | null>(null);
  eventos   = signal<any[]>([]);
  /** Fichas cargadas para enriquecer horarios e historial */
  fichas    = signal<any[]>([]);
  /** Ambientes cargados para enriquecer horarios */
  ambientes = signal<any[]>([]);

  // ── Mapa ficha → eventos del día ─────────────────────────────
  // Clave = CÓDIGO de ficha ("3063290") en lugar de UUID para evitar
  // desajustes entre UUIDs de horarios_db y epsas_db.
  fichaEventoMap = computed(() => {
    // Fecha LOCAL — toISOString() devuelve UTC y puede diferir en zonas GMT-
    const d = this.now();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    // Construir lookup UUID → codigo usando las fichas ya cargadas
    const fichas = this.fichas();
    // Mapa UUID → código; filtramos entradas con código vacío para evitar el fallback erróneo
    const uuidToCodigo = new Map<string, string>(
      fichas
        .filter((f: any) => f.codigo)
        .map((f: any) => [String(f.id), String(f.codigo)])
    );
    const map = new Map<string, any[]>();
    this.eventos().forEach(ev => {
      if (!ev.fechaInicio) return;
      const start = ev.fechaInicio.split('T')[0];
      const end   = (ev.fechaFin ?? ev.fechaInicio).split('T')[0];
      if (today < start || today > end) return;
      const seen = new Set<string>();
      (ev.fichasParticipantes ?? []).forEach((fid: any) => {
        // Resolver UUID → código; si no hay mapeo para este UUID, ignorar la entrada
        const key = uuidToCodigo.get(String(fid));
        if (!key || seen.has(key)) return;
        seen.add(key);
        if (!map.has(key)) map.set(key, []);
        // Guard de deduplicación: el mismo evento nunca aparece dos veces en la misma ficha
        if (!map.get(key)!.some(e => e.id === ev.id)) {
          map.get(key)!.push(ev);
        }
      });
    });
    return map;
  });

  /** UUIDs de las fichas que el instructor dicta — poblado en cargarDatos(),
   *  usado para no mostrar en "Próximos eventos" códigos de fichas ajenas. */
  private misFichaIds = new Set<string>();

  /** Eventos que no han terminado todavía (incluye los de hoy), para dar visibilidad
   *  anticipada — antes solo se veían el mismo día vía `fichaEventoMap`. */
  proximosEventos = computed(() => {
    const d = this.now();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fichas = this.fichas();
    const uuidToCodigo = new Map<string, string>(
      fichas.filter((f: any) => f.codigo).map((f: any) => [String(f.id), String(f.codigo)])
    );
    return this.eventos()
      .filter(ev => ev.fechaInicio && (ev.fechaFin ?? ev.fechaInicio).split('T')[0] >= today)
      .map(ev => {
        const codigos = [...new Set(
          (ev.fichasParticipantes ?? [])
            .filter((fid: any) => this.misFichaIds.has(String(fid)))
            .map((fid: any) => uuidToCodigo.get(String(fid)))
            .filter(Boolean)
        )] as string[];
        return { ev, codigos };
      })
      .sort((a, b) => (a.ev.fechaInicio ?? '').localeCompare(b.ev.fechaInicio ?? ''));
  });

  finModal = signal<{ h: any, visible: boolean }>({ h: null, visible: false });
  finMotivo = '';

  // ── Transversal ──────────────────────────────────────────────
  // Se carga desde DB en cargarDatos() — no depende del JWT ni del localStorage
  // (el modelo Usuario del JWT no trae esTransversal/esLider/areaLiderada).
  private _esTransversalDB = signal<boolean | null>(null);
  esTransversal = computed(() => this._esTransversalDB() ?? false);

  @ViewChild('ubic') private ubicRef!: ConsultarUbicacionComponent;
  @ViewChild('compTooltip') private compTooltipRef!: CompetenciaTooltipComponent;

  /** Ambiente seleccionado por ID de horario: { [horarioId]: ambiente } */
  ambienteSeleccionado = signal<Record<number, any>>({});

  /** Conflicto de ambiente al intentar iniciar: { [horarioId]: { instructorNombre, ambienteNombre } } */
  ambienteConflicto = signal<Record<number, { instructorNombre: string; ambienteNombre: string }>>({});

  // Carrusel multi-jornada
  activeSlotMap = signal<Record<string, number>>({});
  /** Días donde el usuario navegó manualmente — autoSwitchSlots no los sobreescribe */
  private manualOverrides = new Set<string>();

  timer: any;
  now = signal<Date>(new Date());

  constructor(
    private horariosApi: HorariosApiService,
    private erpCatalogo: ErpCatalogoService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  async ngOnInit() {
    await this.cargarDatos();
    this.timer = setInterval(async () => {
      // Pausado con la pestaña en segundo plano — evita gastar cupo del rate limit.
      if (document.hidden) return;
      this.now.set(new Date());
      this.autoSwitchSlots();
      // Recargar eventos solo para las fichas del instructor (no todos los eventos del sistema)
      const fichaIds = [...new Set(
        Object.values(this.horariosByDay()).flat().map((h: any) => h.fichaId).filter(Boolean)
      )];
      if (fichaIds.length) {
        const results = await Promise.all(
          fichaIds.map((fid: string) => this.horariosApi.getEventosByFicha(fid).catch(() => [])),
        );
        const evMap = new Map<string, any>();
        results.flat().forEach((ev: any) => { if (ev?.id) evMap.set(ev.id, ev); });
        this.eventos.set([...evMap.values()]);
      }
      this.cdr.detectChanges();
    }, 30000);
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  getSlotIdx(day: string): number {
    return this.activeSlotMap()[day] ?? 0;
  }

  nextSlot(day: string, total: number) {
    this.manualOverrides.add(day);
    const curr = this.activeSlotMap()[day] ?? 0;
    this.activeSlotMap.update(m => ({ ...m, [day]: (curr + 1) % total }));
    this.compTooltipRef.hide();
    this.hideEventoTooltip();
  }

  setSlot(day: string, idx: number) {
    this.manualOverrides.add(day);
    this.activeSlotMap.update(m => ({ ...m, [day]: idx }));
    this.compTooltipRef.hide();
    this.hideEventoTooltip();
  }

  autoSwitchSlots() {
    const curr = this.now();
    const nowMin = curr.getHours() * 60 + curr.getMinutes();
    const updates: Record<string, number> = {};

    Object.entries(this.horariosByDay()).forEach(([day, slots]: [string, any]) => {
      // No sobreescribir días donde el usuario navegó manualmente
      if (this.manualOverrides.has(day)) return;
      if (!slots?.length || slots.length <= 1) return;
      const matchIdx = slots.findIndex((h: any) => {
        if (!h.horaInicio || !h.horaFin) return false;
        const [sh, sm] = h.horaInicio.split(':').map(Number);
        const [eh, em] = h.horaFin.split(':').map(Number);
        const sMin = sh * 60 + sm, eMin = eh * 60 + em;
        return eMin < sMin
          ? nowMin >= sMin || nowMin <= eMin
          : nowMin >= sMin && nowMin <= eMin;
      });
      if (matchIdx > -1) updates[day] = matchIdx;
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
    // Aparece a la derecha de la card; si no cabe, a la izquierda
    const x = cardRect.right + 12 + tooltipW > window.innerWidth
      ? cardRect.left - tooltipW - 12
      : cardRect.right + 12;
    // Alineado verticalmente con el ícono, clampeado al viewport
    const y = Math.min(Math.max(rect.top - 8, 8), window.innerHeight - 210);
    this.eventoTooltip.set({
      ev, x, y,
      pasado: this.isEventoPasado(ev, this.now()),
      noIniciado: this.isEventoNoIniciado(ev, this.now()),
    });
  }
  hideEventoTooltip() { this.eventoTooltip.set(null); }

  readonly jornadaLabel = jornadaLabelUtil;

  /** Convierte "HH:MM:SS" o "HH:MM" a formato 12h con am/pm */
  to12h(time: string | null | undefined): string {
    return to12hUtil(time);
  }

  /** "05/08" o "05/08 — 09/08" si el evento abarca varios días. */
  formatEventoRango(ev: any): string {
    const start = ev.fechaInicio?.split('T')[0];
    if (!start) return '';
    const end = (ev.fechaFin ?? ev.fechaInicio).split('T')[0];
    const s = formatFechaCorta(start);
    return end === start ? s : `${s} — ${formatFechaCorta(end)}`;
  }

  tipoLabelEvento(t: string): string {
    return ({ formativo: 'Formativo', institucional: 'Institucional', evaluacion: 'Evaluación', festivo: 'Festivo / No lectivo' } as any)[t] ?? t;
  }
  tipoIconEvento(t: string): string {
    return ({ formativo: 'book-open', institucional: 'building', evaluacion: 'clipboard-check', festivo: 'umbrella' } as any)[t] ?? 'calendar';
  }

  async cargarDatos() {
    const id = this.auth.user()?.personaId;
    if (!id) return;
    // Al recargar horarios se limpia el registro de navegación manual
    this.manualOverrides.clear();

    // Cargar horarios + fichas + ambientes + perfil del instructor en paralelo.
    // No existe /instructores/:id — erpCatalogo.getPersona(id) trae los mismos
    // campos de verdad (incl. esTransversal) directamente del ERP.
    const [horarios, fichas, ambientes, instructor] = await Promise.all([
      this.horariosApi.getHorariosByInstructor(id),
      this.erpCatalogo.getFichas().catch(() => []),
      this.erpCatalogo.getAmbientes().catch(() => []),
      this.erpCatalogo.getPersona(id).catch(() => null),
    ]);

    // Establecer esTransversal desde DB — independiente del JWT almacenado
    if (instructor !== null) {
      this._esTransversalDB.set(!!(instructor as any)?.esTransversal);
    }
    // Guardar en signals para reutilizar en historial
    this.fichas.set(fichas as any[]);
    this.ambientes.set(ambientes as any[]);

    const fichaMap = new Map<string, any>((fichas as any[]).map(f => [String(f.id), f]));
    const ambMap   = new Map<string, any>((ambientes as any[]).map(a => [String(a.id), a]));

    const byDay: Record<string, any[]> = {};
    this.dias.forEach(d => byDay[d] = []);
    (horarios as any[]).forEach((hor: any) => {
      const enriched = {
        ...hor,
        ficha:    hor.fichaId    ? (fichaMap.get(String(hor.fichaId))    ?? null) : null,
        ambiente: hor.ambienteId ? (ambMap.get(String(hor.ambienteId))   ?? null) : null,
      };
      if (!byDay[enriched.diaSemana]) byDay[enriched.diaSemana] = [];
      byDay[enriched.diaSemana].push(enriched);
    });
    Object.keys(byDay).forEach(k => {
      byDay[k].sort((a: any, b: any) => a.horaInicio.localeCompare(b.horaInicio));
    });

    // Una vez que conocemos las fichas del instructor, cargar sus eventos por cada ficha
    const fichaIds = [...new Set(
      (horarios as any[]).map((h: any) => h.fichaId).filter(Boolean)
    )];
    this.misFichaIds = new Set(fichaIds.map(String));
    if (fichaIds.length) {
      const results = await Promise.all(
        fichaIds.map((fid: string) => this.horariosApi.getEventosByFicha(fid).catch(() => [])),
      );
      // Aplanar y deduplicar por id
      const evMap = new Map<string, any>();
      results.flat().forEach((ev: any) => { if (ev?.id) evMap.set(ev.id, ev); });
      this.eventos.set([...evMap.values()]);
    } else {
      this.eventos.set([]);
    }
    this.horariosByDay.set(byDay);
    this.cdr.detectChanges();
  }

  isToday(dia: string): boolean {
    const days = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    return days[this.now().getDay()] === dia;
  }

  isHorarioActivo(dia: string, h: any): boolean {
    if (!h.activo) return false;
    if (!this.isToday(dia)) return false;
    if (h.horaFin) {
      const now = this.now();
      const [eh, em] = h.horaFin.split(':').map(Number);
      if (now.getHours() * 60 + now.getMinutes() > eh * 60 + em) return false;
    }
    return true;
  }

  /** True si la columna es hoy Y la hora actual cae dentro del rango del horario.
   *  Recibe `currentTime` como parámetro para que Angular rastree la señal `now`
   *  directamente en la expresión del template y re-evalúe en cada tick. */
  isEnCurso(dia: string, h: any, currentTime: Date): boolean {
    if (!this.isToday(dia)) return false;
    if (!h?.horaInicio || !h?.horaFin) return false;
    const [sh, sm] = h.horaInicio.split(':').map(Number);
    const [eh, em] = h.horaFin.split(':').map(Number);
    const nowMin = currentTime.getHours() * 60 + currentTime.getMinutes();
    const startMin = sh * 60 + sm;
    const endMin   = eh * 60 + em;
    // Horarios de noche pueden cruzar medianoche (endMin < startMin, e.g. 19:00-00:00)
    return endMin < startMin
      ? nowMin >= startMin || nowMin <= endMin   // cruza medianoche: activo desde inicio O antes del fin
      : nowMin >= startMin && nowMin <= endMin;
  }

  puedeIniciar(dia: string, h: any, selectedAmbs?: Record<number, any>): boolean {
    if (!this.isToday(dia)) return false;
    if (this.isHorarioActivo(dia, h)) return false;
    if (h.motivoFinalizacion) return false;

    // Transversal: necesita haber seleccionado un ambiente/ubicación primero.
    // También se acepta si ya hay un ambiente o ubicación persistida en DB (h.ambienteId o h.ubicacionTransversalId).
    // Se recibe el mapa como parámetro para que Angular rastree la señal en el template.
    const ambs = selectedAmbs ?? this.ambienteSeleccionado();
    if (this.esTransversal() && !ambs[h.id] && !h.ambienteId && !h.ubicacionTransversalId) return false;

    const curr = this.now();
    const [sh, sm] = h.horaInicio.split(':').map(Number);
    const [eh, em] = h.horaFin.split(':').map(Number);
    const nowMin   = curr.getHours() * 60 + curr.getMinutes();
    const startMin = sh * 60 + sm;
    const endMin   = eh * 60 + em;
    // Horarios de noche pueden cruzar medianoche (e.g. 19:00-00:00 → endMin=0 < startMin=1140)
    return endMin < startMin
      ? nowMin >= startMin || nowMin <= endMin
      : nowMin >= startMin && nowMin <= endMin;
  }

  activacionEsHoy(h: any): boolean {
    if (!h.ultimaActivacion) return false;
    const act = new Date(h.ultimaActivacion);
    const hoy = new Date();
    return act.getFullYear() === hoy.getFullYear() &&
           act.getMonth()    === hoy.getMonth()    &&
           act.getDate()     === hoy.getDate();
  }

  async playHorario(h: any) {
    const onPlay = () => {
      this.limpiarConflicto(h);
      this.limpiarAmbiente(h);
      this.cargarDatos();
      this.toast.ok('Clase iniciada', 'La clase fue marcada como activa correctamente.');
    };
    // NOTA: el nuevo backend (PATCH /horarios/:id/play) todavía no implementa el shape
    // de conflicto { ambienteOcupado, instructorNombre, ambienteNombre } que devolvía
    // ChronoGest — este manejo queda intacto por fidelidad estructural, pero es código
    // muerto hasta que el backend lo soporte.
    const onErr = (e: any) => {
      if (e?.error?.ambienteOcupado === true) {
        // Mostrar alerta de conflicto en la card — no abrir toast
        this.ambienteConflicto.update(m => ({
          ...m,
          [h.id]: {
            instructorNombre: e.error.instructorNombre ?? 'Otro instructor',
            ambienteNombre:   e.error.ambienteNombre   ?? '—',
          },
        }));
        this.cdr.detectChanges();
        return;
      }
      this.toast.error('Error al iniciar clase', e?.error?.message ?? 'No se pudo activar la clase.');
    };

    try {
      // ── Instructor transversal ────────────────────────────────────────────────
      if (this.esTransversal()) {
        const selected = this.ambienteSeleccionado()[h.id];
        if (selected?._esUbicacion) {
          await this.horariosApi.playHorario(h.id, { ubicacionId: selected.id, ubicacionNombre: selected.nombre });
        } else {
          await this.horariosApi.playHorario(h.id, { ambienteId: selected?.id });
        }
      } else {
        // ── Instructor regular: si escogió alternativa en resolución de conflicto, enviarla ──
        const altAmbiente = this.ambienteSeleccionado()[h.id];
        if (altAmbiente?._esUbicacion) {
          // Ubicación transversal elegida como alternativa (auditorio, restaurante, etc.)
          await this.horariosApi.playHorario(h.id, { ubicacionId: altAmbiente.id, ubicacionNombre: altAmbiente.nombre });
        } else if (altAmbiente) {
          // Ambiente alternativo (por conflicto con el asignado)
          await this.horariosApi.playHorario(h.id, { ambienteId: altAmbiente.id });
        } else {
          await this.horariosApi.playHorario(h.id);
        }
      }
      onPlay();
    } catch (e) {
      onErr(e);
    }
  }

  promptFinalizar(h: any) {
    this.finMotivo = '';
    this.finModal.set({ h, visible: true });
  }

  closeFin() {
    this.finModal.set({ h: null, visible: false });
  }

  async confirmarFinalizar() {
    const h = this.finModal().h;
    if (!h) return;
    try {
      await this.horariosApi.finalizarHorario(h.id, this.finMotivo);
      // Limpiar ambiente seleccionado al finalizar
      if (this.esTransversal()) this.limpiarAmbiente(h);
      this.closeFin();
      this.cargarDatos();
      this.toast.info('Clase finalizada', 'La jornada fue cerrada y el administrador fue notificado.');
    } catch (e: any) {
      this.toast.error('Error al finalizar', e?.error?.message ?? 'No se pudo finalizar la clase.');
    }
  }

  // ── Transversal: gestión de ambientes ────────────────────────

  /** Recibe la selección hecha en el panel <app-consultar-ubicacion> */
  onUbicacionElegida({ h, seleccion }: { h: any; seleccion: any }) {
    if (!h) return;
    const current = { ...this.ambienteSeleccionado() };
    current[h.id] = seleccion;
    this.ambienteSeleccionado.set(current);
    this.limpiarConflicto(h); // limpiar conflicto previo si existía
  }

  limpiarAmbiente(h: any) {
    const current = { ...this.ambienteSeleccionado() };
    delete current[h.id];
    this.ambienteSeleccionado.set(current);
    this.limpiarConflicto(h);
  }

  limpiarConflicto(h: any) {
    const m = { ...this.ambienteConflicto() };
    delete m[h.id];
    this.ambienteConflicto.set(m);
  }

  /** Abre el panel de selección de ambientes para resolver un conflicto (funciona para cualquier rol) */
  buscarAlternativa(h: any) {
    this.limpiarConflicto(h);
    this.ubicRef.consultarAmbientes(h);
  }

  // ── Progreso / Competencias ──────────────────────────────────

  calcProgress(h: any): number {
    if (!h.horaInicio || !h.horaFin) return 0;
    const curr = this.now();
    const [sh, sm] = h.horaInicio.split(':').map(Number);
    const [eh, em] = h.horaFin.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin   = eh * 60 + em;
    // Para noche que cruza medianoche, desplazar endMin +24h para cálculo lineal
    const effectiveEnd = endMin < startMin ? endMin + 24 * 60 : endMin;
    let nowMin = curr.getHours() * 60 + curr.getMinutes();
    // Si ya pasó medianoche y estamos antes del fin, desplazar nowMin también
    if (endMin < startMin && nowMin < startMin) nowMin += 24 * 60;
    if (nowMin < startMin)    return 0;
    if (nowMin > effectiveEnd) return 100;
    return Math.round(((nowMin - startMin) / (effectiveEnd - startMin)) * 100);
  }

  getCompetenciaVigente(h: any): any | null {
    if (!h.competencias || h.competencias.length === 0) return null;
    const current = this.now();
    // Solo la competencia VIGENTE (dentro de su período); si ya venció no debe
    // seguir mostrándose como si estuviera activa.
    return h.competencias.find((c: any) => {
      if (!c.fechaInicio) return true;
      const start = fechaInicioDelDia(c.fechaInicio);
      const end = c.fechaFin ? fechaFinDelDia(c.fechaFin) : new Date('2099-01-01T23:59:59');
      return current >= start && current <= end;
    }) ?? null;
  }
}
