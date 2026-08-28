import { Component, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  Resultado, normalizarResultados, durHorarioMin,
  estadoResultadoIcon as estadoResultadoIconUtil,
  estadoResultadoInfo as estadoResultadoInfoUtil,
  diaPluralLabel, formatFechaCorta, to12h as to12hUtil,
  fechaInicioDelDia, fechaFinDelDia,
} from '../../core/utils/horarios.util';
import { AuthService } from '../../core/services/auth.service';

export interface CompetenciaTooltipState {
  h: any;
  /** null cuando el horario no tiene ninguna competencia vigente registrada. */
  comp: any | null;
  compIdx: number;
  x: number;
  y: number;
}

/**
 * <app-competencia-tooltip> — tooltip de competencia compartido entre
 * horarios.component.ts (admin), instructor-mis-horarios.component.ts y
 * aprendiz-mis-horarios.component.ts (antes copiado casi línea por línea en
 * los 3). El padre solo llama `abrir(h, comp, event)` desde el botón (?) de
 * la card de horario y renderiza `<app-competencia-tooltip #tt />` una vez.
 */
@Component({
  selector: 'app-competencia-tooltip',
  imports: [LucideAngularModule],
  template: `
    @if (state()) {
      <div class="ctt-fixed-box"
           [style.left.px]="state()!.x"
           [style.top.px]="state()!.y"
           (click)="$event.stopPropagation()">
        @if (!state()!.comp) {
          <!-- Sin competencia registrada: mismo cuadro, contenido mínimo -->
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">
            <p class="ctt-label" style="margin:0;font-size:11px;flex:1;">COMPETENCIA</p>
            <button class="ctt-close-btn" (click)="hide()" title="Cerrar">
              <lucide-icon name="x" [size]="12"></lucide-icon>
            </button>
          </div>
          <p style="color:var(--text-muted);font-size:12px;margin:6px 0 0;">
            Este horario todavía no tiene una competencia registrada.
          </p>
        } @else {
        <!-- Cabecera: navegación + label + copiar + cerrar -->
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:6px;">
          @if ((state()!.h.competencias ?? []).length > 1) {
            <button class="ctt-close-btn" (click)="prevComp()" title="Anterior">
              <lucide-icon name="chevron-left" [size]="11"></lucide-icon>
            </button>
          }
          <p class="ctt-label" style="margin:0;font-size:11px;flex:1;">
            COMPETENCIA
            @if ((state()!.h.competencias ?? []).length > 1) {
              <span style="font-weight:400;color:var(--text-muted);">
                {{ state()!.compIdx + 1 }}/{{ (state()!.h.competencias ?? []).length }}
              </span>
            }
          </p>
          @if ((state()!.h.competencias ?? []).length > 1) {
            <button class="ctt-close-btn" (click)="nextComp()" title="Siguiente">
              <lucide-icon name="chevron-right" [size]="11"></lucide-icon>
            </button>
          }
          <button class="ctt-copy-btn" [class.ctt-copy-ok]="copiado()"
                  (click)="copiar()"
                  [title]="copiado() ? '¡Copiado!' : 'Copiar información'">
            <lucide-icon [name]="copiado() ? 'check' : 'copy'" [size]="12"></lucide-icon>
          </button>
          <button class="ctt-close-btn" (click)="hide()" title="Cerrar">
            <lucide-icon name="x" [size]="12"></lucide-icon>
          </button>
        </div>
        <!-- Nombre -->
        <p style="color:var(--text);font-weight:700;font-size:14px;margin:0 0 6px;">{{ state()!.comp.nombre }}</p>
        <!-- Ficha + Instructor -->
        <div class="ctt-meta-row">
          <div>
            <p class="ctt-label">FICHA</p>
            <p class="ctt-meta-val">{{ fichaTexto() }}</p>
          </div>
          <div>
            <p class="ctt-label">INSTRUCTOR</p>
            <p class="ctt-meta-val">{{ instructorNombre() }}</p>
          </div>
        </div>
        <!-- Resultados -->
        @let compResultadosTT = resultadosDe(state()!.comp);
        @if (compResultadosTT.length > 0) {
          <p class="ctt-label mt-2">RESULTADOS</p>
          <div class="ctt-resultados-list">
            @for (r of compResultadosTT; track $index) {
              <div class="ctt-resultado-row">
                <lucide-icon [name]="estadoResultadoIcon(r)" [size]="13" [style.color]="estadoResultadoInfo(r).text"></lucide-icon>
                <span>{{ r.texto }}</span>
              </div>
            }
          </div>
        }
        <!-- Período -->
        <p class="ctt-label mt-2">PERÍODO</p>
        <p style="color:var(--text);font-size:12px;margin:2px 0 4px;">
          {{ formatFechaLarga(state()!.comp.fechaInicio) }} — {{ formatFechaLarga(state()!.comp.fechaFin) }}
        </p>
        <p class="ctt-label mt-2">PROGRESO</p>
        <div class="progress-bar">
          <div class="progress-fill" [style.width.%]="getProgresoCompetencia(state()!.comp)"></div>
        </div>
        <p style="font-size:11px;color:var(--text-muted);text-align:right;margin:4px 0 0;">{{ getProgresoCompetencia(state()!.comp) }}%</p>
        <!-- Horario recurrente — una sola vez -->
        <p class="ctt-label mt-2">HORARIO</p>
        <div class="ctt-horario-compact">
          <div class="ctt-horario-row"><lucide-icon name="calendar" [size]="12"></lucide-icon> Todos los {{ diaPluralLabel(state()!.h.diaSemana) }}</div>
          <div class="ctt-horario-row"><lucide-icon name="clock" [size]="12"></lucide-icon> {{ to12h(state()!.h.horaInicio) }} — {{ to12h(state()!.h.horaFin) }}</div>
          <div class="ctt-horario-row"><lucide-icon name="hourglass" [size]="12"></lucide-icon> {{ formatHorasPorDiaStr(state()!.h) }} por clase</div>
        </div>
        <!-- Clases — lista compacta de fechas -->
        @if ((state()!.comp.diasClase ?? []).length > 0) {
          <p class="ctt-label mt-2">CLASES ({{ (state()!.comp.diasClase ?? []).length }})</p>
          <div class="ctt-clases-chips">
            @for (iso of (state()!.comp.diasClase ?? []); track iso) {
              <span class="ctt-clase-chip">{{ formatFechaCorta(iso) }}</span>
            }
          </div>
        }
        }
      </div>
    }
  `,
  styles: [`
    .ctt-fixed-box {
      position: fixed; z-index: 9999; width: 320px; max-width: calc(100vw - 16px); padding: 14px 16px;
      background: var(--surface); border: 1.5px solid var(--border); border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,.18);
    }
    .ctt-label { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin: 0; }
    .ctt-meta-row { display: flex; gap: 12px; margin: 0 0 8px; }
    .ctt-meta-row > div { flex: 1; min-width: 0; }
    .ctt-meta-val { color: var(--text); font-size: 12px; font-weight: 600; margin: 2px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .ctt-copy-btn {
      display: flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--border);
      background: var(--surface2); cursor: pointer; color: var(--text-muted);
      transition: all .15s; flex-shrink: 0;
    }
    .ctt-copy-btn:hover { background: #eff6ff; color: var(--blue); border-color: var(--blue); }
    .ctt-copy-btn.ctt-copy-ok { background: #dcfce7; color: #166534; border-color: #86efac; }
    .ctt-close-btn {
      display: flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 6px;
      border: 1px solid var(--border); background: var(--surface2);
      cursor: pointer; color: var(--text-muted); transition: all .15s;
    }
    .ctt-close-btn:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }

    /* ── Card de competencia compacta: resultados / horario / clases ── */
    .ctt-resultados-list { display:flex; flex-direction:column; gap:3px; margin:2px 0 0; }
    .ctt-resultado-row { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text); }
    .ctt-horario-compact { display:flex; flex-direction:column; gap:3px; margin:2px 0 0; font-size:12px; color:var(--text); }
    .ctt-horario-row { display:flex; align-items:center; gap:6px; }
    .ctt-horario-row lucide-icon { color:var(--text-muted); flex-shrink:0; }
    .ctt-clases-chips { display:flex; flex-wrap:wrap; gap:5px; margin:4px 0 0; }
    .ctt-clase-chip { font-size:10px; font-weight:600; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:5px; padding:2px 6px; }

    /* progress-bar/progress-fill: copia local — el host ya tiene su propia
       versión para el indicador "en curso" de la card, fuera de este tooltip. */
    .progress-bar { height: 6px; background: var(--gray-200, #e5e7eb); border-radius: 3px; overflow: hidden; }
    .progress-fill { height: 100%; background: var(--blue); border-radius: 3px; transition: width .3s ease; }

    /* ── Dark mode overrides ── */
  `],
})
export class CompetenciaTooltipComponent {
  private readonly hoyIso = new Date().toISOString().slice(0, 10);
  private readonly auth = inject(AuthService);

  readonly state = signal<CompetenciaTooltipState | null>(null);
  readonly copiado = signal(false);
  private copyTimer: any;

  /**
   * Abre el tooltip para (h, comp); si ya estaba abierto para el mismo horario, lo cierra.
   * Si `comp` es null (sin competencia vigente), igual abre la caja con un aviso corto
   * en vez de quedarse silencioso — antes el clic no hacía nada visible.
   */
  abrir(h: any, comp: any, event: MouseEvent) {
    event.stopPropagation();
    if (this.state()?.h?.id === h.id) { this.hide(); return; }
    const icon = event.currentTarget as HTMLElement;
    const card = icon.closest('.horario-card');
    const iconRect = icon.getBoundingClientRect();
    const cardRect = card ? card.getBoundingClientRect() : iconRect;
    const margin = 8;
    // En pantallas angostas (mobile) 320px fijos no caben enteros — se limita
    // al viewport disponible (misma regla que el max-width del CSS) para que
    // el cálculo de X use el ancho real que se va a renderizar.
    const tooltipW = Math.min(320, window.innerWidth - margin * 2);
    const rawX = cardRect.right + 12 + tooltipW > window.innerWidth
      ? cardRect.left - tooltipW - 12
      : cardRect.right + 12;
    // Antes solo el eje Y se limitaba al viewport — el eje X podía quedar
    // negativo (o pasarse por la derecha) en mobile, sacando el tooltip de
    // la pantalla por la izquierda.
    const x = Math.min(Math.max(rawX, margin), window.innerWidth - tooltipW - margin);
    const y = Math.min(Math.max(iconRect.top - 8, margin), window.innerHeight - 320);
    if (!comp) {
      this.state.set({ h, comp: null, compIdx: 0, x, y });
      return;
    }
    const comps: any[] = h.competencias ?? [];
    const compIdx = Math.max(0, comps.findIndex((c: any) => c.id === comp.id));
    this.state.set({ h, comp, compIdx, x, y });
  }

  hide() { this.state.set(null); }

  prevComp() {
    const s = this.state();
    if (!s) return;
    const comps: any[] = s.h.competencias ?? [];
    if (comps.length <= 1) return;
    const newIdx = (s.compIdx - 1 + comps.length) % comps.length;
    this.state.set({ ...s, comp: comps[newIdx], compIdx: newIdx });
  }

  nextComp() {
    const s = this.state();
    if (!s) return;
    const comps: any[] = s.h.competencias ?? [];
    if (comps.length <= 1) return;
    const newIdx = (s.compIdx + 1) % comps.length;
    this.state.set({ ...s, comp: comps[newIdx], compIdx: newIdx });
  }

  fichaTexto(): string {
    const h = this.state()?.h;
    return h?.ficha?.codigo ?? h?.ficha?.nombre ?? '—';
  }

  /**
   * instructor-mis-horarios.component.ts no enriquece h.instructor (es
   * siempre el propio usuario logueado, así que ni carga el catálogo de
   * instructores) — sin este fallback, el tooltip mostraría "—" en la vista
   * del propio instructor.
   */
  instructorNombre(): string {
    const h = this.state()?.h;
    if (h?.instructor?.nombre) return `${h.instructor.nombre} ${h.instructor.apellido ?? ''}`.trim();
    return this.auth.user()?.nombre ?? '—';
  }

  resultadosDe(c: any): Resultado[] {
    return normalizarResultados(c?.resultados);
  }

  estadoResultadoInfo(r: Resultado) {
    return estadoResultadoInfoUtil(r, this.hoyIso);
  }

  estadoResultadoIcon(r: Resultado): string {
    return estadoResultadoIconUtil(r, this.hoyIso);
  }

  readonly diaPluralLabel = diaPluralLabel;
  readonly formatFechaCorta = formatFechaCorta;
  readonly to12h = to12hUtil;

  /** dd/mm/yyyy — mismo formato que instructor/aprendiz usaban con el pipe `date`. */
  formatFechaLarga(iso: string | null | undefined): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  formatHorasPorDiaStr(h: any): string {
    if (!h?.horaInicio || !h?.horaFin) return '';
    const horas = durHorarioMin(h) / 60;
    return `${Number.isInteger(horas) ? String(horas) : horas.toFixed(1)}h`;
  }

  calcHorasCompetencia(comp: any, h: any): string {
    const dias = (comp?.diasClase ?? []).length;
    if (!dias) return '0';
    const totalMin = dias * durHorarioMin(h);
    const horas = totalMin / 60;
    return Number.isInteger(horas) ? String(horas) : horas.toFixed(1);
  }

  getProgresoCompetencia(c: any): number {
    if (!c || !c.fechaInicio) return 0;
    const start = fechaInicioDelDia(c.fechaInicio).getTime();
    const end = c.fechaFin ? fechaFinDelDia(c.fechaFin).getTime() : new Date().getTime();
    const now = new Date().getTime();
    if (now < start) return 0;
    if (now > end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
  }

  /** Formatea fecha ISO como dd/mm/yyyy invertido (dd/mm/yyyy) para el texto copiado. */
  private fmtCopiado(iso: string): string {
    return iso?.split('T')[0]?.split('-').reverse().join('/') ?? '';
  }

  copiar() {
    const state = this.state();
    if (!state) return;
    const { comp, h } = state;
    const horas = this.calcHorasCompetencia(comp, h);
    const diasArr: string[] = comp.diasClase ?? [];
    const lines: string[] = [`Competencia: ${comp.nombre ?? ''}`];
    lines.push(`Ficha: ${this.fichaTexto()}`);
    lines.push(`Instructor: ${this.instructorNombre()}`);
    const compResultadosCopy = this.resultadosDe(comp);
    if (compResultadosCopy.length) {
      lines.push(`Resultados: ${compResultadosCopy.map(r => `${r.texto} (${this.estadoResultadoInfo(r).label})`).join(' | ')}`);
    }
    if (comp.fechaInicio) lines.push(`Período: ${this.fmtCopiado(comp.fechaInicio)} — ${this.fmtCopiado(comp.fechaFin ?? comp.fechaInicio)}`);
    lines.push(`Progreso: ${this.getProgresoCompetencia(comp)}%`);
    if (diasArr.length > 0) {
      const rango = `${this.to12h(h.horaInicio)} — ${this.to12h(h.horaFin)}`;
      lines.push(`Horario: Todos los ${this.diaPluralLabel(h.diaSemana)}, ${rango} (${this.formatHorasPorDiaStr(h)} por clase, ${horas}h en total)`);
      lines.push(`Clases (${diasArr.length}): ${diasArr.map(iso => this.formatFechaCorta(iso)).join(', ')}`);
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      this.copiado.set(true);
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.copiado.set(false), 2000);
    });
  }
}
