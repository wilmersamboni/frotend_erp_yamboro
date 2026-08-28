import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { HorariosApiService } from '../../../core/services/horarios/horarios-api.service';
import { ErpCatalogoService } from '../../../core/services/horarios/erp-catalogo.service';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import {
  Resultado, normalizarResultados, to12h as to12hUtil, getDiaLabel,
  diaPluralLabel, formatFechaCorta, calcHorasCompetencia, estadoResultadoInfo as estadoResultadoInfoUtil,
} from '../../../core/utils/horarios.util';

/**
 * Modal "Historial de Competencias" — extraído de horarios.component.ts.
 * Es una sub-feature autocontenida: tiene su propio fetch de datos
 * (cruza /competencias con /horarios + catálogo ERP, ya que no existe
 * /horarios-admin/competencias) y no depende del grid del padre.
 * Se abre vía referencia de plantilla: `<app-historial-competencias-modal #hist />`
 * y `(click)="hist.abrir()"` desde el botón "Historial" del padre.
 */
@Component({
  selector: 'app-historial-competencias-modal',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe, SearchableSelectComponent],
  template: `
    @if (open()) {
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl hist-modal" (click)="$event.stopPropagation()">
        <div class="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <h3 style="margin:0">Historial de Competencias</h3>
            <p style="font-size:12px;color:var(--text-muted);margin:2px 0 0">Registro global de competencias asignadas a todos los horarios</p>
          </div>
          <button class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" (click)="cerrar()"><lucide-icon name="x" [size]="18"></lucide-icon></button>
        </div>

        <!-- Filtros -->
        <div style="padding:12px 0 8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div style="position:relative;flex:1;min-width:200px;">
            <lucide-icon name="search" [size]="13" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;"></lucide-icon>
            <input class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" style="padding-left:32px;font-size:13px;"
                   [ngModel]="histFiltro()" (ngModelChange)="histFiltro.set($event)"
                   placeholder="Buscar por instructor, ficha o competencia...">
          </div>
          <span style="font-size:12px;color:var(--text-muted);white-space:nowrap;">
            {{ histFiltered().length }} resultado{{ histFiltered().length !== 1 ? 's' : '' }}
          </span>
        </div>

        @if (histLoading()) {
          <div style="text-align:center;padding:32px;color:var(--text-muted);">
            <lucide-icon name="loader" [size]="22" class="spin"></lucide-icon>
          </div>
        } @else if (histByInstructor().length === 0) {
          <div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px;">Sin competencias registradas</div>
        } @else {
          <div class="hist-sections-wrap">
            @for (group of histByInstructor(); track group.key) {
              @let fichasGrupo = getFichasDelGrupo(group.items);
              @let itemsFiltrados = getItemsFiltradosPorFicha(group);
              @let fichaSeleccionada = histFichaFilters()[group.key];

              <!-- Cabecera de sección por instructor + filtro ficha -->
              <div class="hist-instructor-header">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                  <div class="hist-instr-avatar">{{ group.nombre.charAt(0).toUpperCase() }}</div>
                  <div>
                    <span style="font-weight:700;font-size:13px;color:var(--text);">{{ group.nombre }}</span>
                    <span style="font-size:11px;color:var(--text-muted);margin-left:8px;">
                      {{ itemsFiltrados.length }}/{{ group.items.length }} competencia{{ group.items.length !== 1 ? 's' : '' }}
                    </span>
                  </div>
                </div>
                <!-- Filtro por ficha (visible si hay ≥2 fichas distintas) -->
                @if (fichasGrupo.length > 1) {
                  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;width:170px;">
                    <lucide-icon name="filter" [size]="12" style="color:var(--text-muted);opacity:.7;"></lucide-icon>
                    <app-ss [options]="fichaOptionsFor(fichasGrupo)" placeholder="Todas las fichas"
                            [ngModel]="fichaSeleccionada"
                            (ngModelChange)="setFichaFilter(group.key, $event)"></app-ss>
                    @if (fichaSeleccionada) {
                      <button class="hist-ficha-clear" (click)="setFichaFilter(group.key, '')" title="Limpiar filtro">
                        <lucide-icon name="x" [size]="10"></lucide-icon>
                      </button>
                    }
                  </div>
                }
              </div>

              <!-- Tabla de competencias del instructor -->
              <div class="hist-table-wrap" style="margin-bottom:24px;">
                @if (itemsFiltrados.length === 0) {
                  <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;background:var(--surface2);">
                    <lucide-icon name="search-x" [size]="18" style="display:block;margin:0 auto 6px;opacity:.4;"></lucide-icon>
                    Sin competencias para la ficha seleccionada
                  </div>
                } @else {
                <table class="hist-table">
                  <thead>
                    <tr>
                      <th style="width:36px;">#</th>
                      <th>Fecha Registro</th>
                      <th>Día / Jornada</th>
                      <th>Ficha / Programa</th>
                      <th>Competencia</th>
                      <th>Resultado</th>
                      <th>Período</th>
                      <th>Días / Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of itemsFiltrados; track c.id; let i = $index) {
                    <tr>
                      <td style="font-size:11px;color:var(--text-muted);text-align:center;font-weight:700;">{{ i + 1 }}</td>
                      <td style="font-size:11px;white-space:nowrap;">
                        <span style="font-weight:600;color:var(--text);">{{ c.createdAt | date:'dd/MM/yyyy' }}</span><br>
                        <span style="color:var(--text-muted);">{{ c.createdAt | date:'dd/MM/yyyy' }}</span>
                      </td>
                      <td>
                        <span class="hist-dia-badge">{{ getDiaLabel(c.dia_semana) }}</span>
                        <span class="hist-jorn-badge">{{ c.hora_inicio || '—' }}</span>
                      </td>
                      <td style="font-size:12px;">
                        <strong>{{ c.ficha_codigo || '—' }}</strong><br>
                        <span style="color:var(--text-muted);font-size:11px;">{{ c.ficha_programa || '' }}</span>
                      </td>
                      <td style="font-weight:600;font-size:13px;max-width:200px;">{{ c.nombre }}</td>
                      <td style="text-align:center;vertical-align:middle;">
                        @let rs = resultadosDe(c);
                        @if (rs.length > 0) {
                          <button class="hist-horas-btn"
                                  (mouseenter)="showHistResultados(c, $event)"
                                  (mouseleave)="hideHistResultados()">
                            <lucide-icon name="clipboard-check" [size]="13"></lucide-icon>
                            <span>{{ rs.length }} resultado{{ rs.length !== 1 ? 's' : '' }}</span>
                          </button>
                        } @else {
                          <span style="font-size:11px;color:var(--text-muted);">—</span>
                        }
                      </td>
                      <td style="font-size:11px;white-space:nowrap;">
                        @if (c.fecha_inicio) {
                          <span>{{ c.fecha_inicio | date:'dd/MM/yy' }} — {{ c.fecha_fin | date:'dd/MM/yy' }}</span>
                        } @else { <span>—</span> }
                      </td>
                      <!-- Días / Horas — botón icono con popover flotante -->
                      <td style="text-align:center;vertical-align:middle;">
                        @if ((c.diasClase ?? []).length > 0) {
                          <button class="hist-horas-btn"
                                  (mouseenter)="showHistDias(c, $event)"
                                  (mouseleave)="hideHistDias()">
                            <lucide-icon name="clock" [size]="13"></lucide-icon>
                            <span>{{ calcHorasCompetencia(c, c.horario) }}</span>
                          </button>
                        } @else {
                          <span style="font-size:11px;color:var(--text-muted);">—</span>
                        }
                      </td>
                    </tr>
                    }
                  </tbody>
                </table>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
    }

    <!-- Popover flotante días/horas del historial -->
    @if (histDiasPopover()) {
      <div class="hist-dias-popover"
           [style.left.px]="histDiasPopover()!.x"
           [style.top.px]="histDiasPopover()!.y">
        <div class="tt-form-header-row">
          <span class="tt-form-lbl">Días: <strong>{{ (histDiasPopover()!.c.diasClase ?? []).length }} clases</strong></span>
          <span class="tt-form-lbl">Horas: <strong>{{ calcHorasCompetencia(histDiasPopover()!.c, histDiasPopover()!.c.horario) }}</strong></span>
        </div>
        <div style="padding:7px 9px;">
          <div class="tt-horario-compact">
            <div class="tt-horario-row"><lucide-icon name="calendar" [size]="11"></lucide-icon> Todos los {{ diaPluralLabel(histDiasPopover()!.c.horario?.diaSemana) }}</div>
            <div class="tt-horario-row"><lucide-icon name="clock" [size]="11"></lucide-icon> {{ to12h(histDiasPopover()!.c.horario?.horaInicio) }} — {{ to12h(histDiasPopover()!.c.horario?.horaFin) }}</div>
          </div>
          <div class="tt-clases-chips">
            @for (iso of (histDiasPopover()!.c.diasClase ?? []); track iso) {
              <span class="tt-clase-chip">{{ formatFechaCorta(iso) }}</span>
            }
          </div>
        </div>
      </div>
    }

    <!-- Popover flotante de resultados del historial -->
    @if (histResultadosPopover()) {
      <div class="hist-dias-popover"
           [style.left.px]="histResultadosPopover()!.x"
           [style.top.px]="histResultadosPopover()!.y">
        <div class="tt-form-header-row">
          <span class="tt-form-lbl">Resultados de la competencia</span>
        </div>
        @for (r of resultadosDe(histResultadosPopover()!.c); track $index) {
          <div class="tt-form-row">
            <span class="tt-form-dia" style="white-space:normal;min-width:0;">{{ r.texto }}</span>
            <span style="padding:1px 6px;border-radius:8px;font-weight:700;font-size:9px;white-space:nowrap;flex-shrink:0;"
                  [style.background]="estadoResultadoInfo(r).bg" [style.color]="estadoResultadoInfo(r).text">
              {{ estadoResultadoInfo(r).label }}
            </span>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .hist-modal { width: 95vw; max-width: 1060px; max-height: 88vh; overflow: hidden; display: flex; flex-direction: column; }
    .hist-sections-wrap { flex: 1; overflow-y: auto; padding: 4px 0; }
    .hist-instructor-header {
      display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
      padding: 10px 16px; background: var(--surface2);
      border-left: 4px solid #39A900; border-radius: 0 8px 0 0;
      margin-top: 8px; margin-bottom: 0;
    }
    .hist-instr-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: #39A900; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 800; flex-shrink: 0;
    }
    .hist-ficha-sel {
      height: 28px; padding: 0 8px; font-size: 12px; font-weight: 600;
      border: 1px solid var(--border); border-radius: 6px;
      background: #fff; color: #15803d; cursor: pointer;
      outline: none; max-width: 130px;
    }
    .hist-ficha-sel:focus { border-color: #39A900; box-shadow: 0 0 0 2px rgba(57,169,0,.15); }
    .hist-ficha-clear {
      display: flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; border-radius: 50%;
      border: 1px solid #bbf7d0; background: #f0fdf4; color: #15803d;
      cursor: pointer; flex-shrink: 0; transition: all .15s;
    }
    .hist-ficha-clear:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
    .hist-table-wrap { overflow-x: auto; }
    .hist-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .hist-table thead tr { background: #f9fafb; position: sticky; top: 0; z-index: 2; border-bottom: 2px solid var(--border); }
    .hist-table th { padding: 10px 14px; color: #374151; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; text-align: left; white-space: nowrap; }
    .hist-table td { padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .hist-table tbody tr:hover td { background: var(--surface2); }
    .hist-dia-badge { display:inline-block; background:#f0fdf4; color:#15803d; border-radius:4px; padding:2px 7px; font-size:11px; font-weight:700; text-transform:capitalize; margin-right:4px; }
    .hist-jorn-badge { display:inline-block; background:var(--surface2); color:var(--text-muted); border-radius:4px; padding:2px 7px; font-size:10px; font-weight:600; text-transform:uppercase; }
    .hist-horas-btn { display:inline-flex; align-items:center; gap:4px; padding:4px 8px; border:1px solid #bbf7d0; border-radius:6px; background:#f0fdf4; color:#15803d; cursor:default; font-size:11px; font-weight:700; transition:all .15s; }
    .hist-horas-btn:hover { background:#39A900; color:#fff; border-color:#39A900; }
    .hist-dias-popover { position:fixed; z-index:10000; min-width:250px; max-width:min(340px, calc(100vw - 16px)); border:1px solid var(--border); border-radius:7px; box-shadow:0 8px 24px rgba(0,0,0,.15); overflow:hidden; background:var(--surface); pointer-events:none; }

    /* ── Compartidas con el tooltip de competencia del grid (duplicadas — CSS de componente no se hereda) ── */
    .tt-form-header-row { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:5px 9px; background:#dcfce7; border-bottom:1px solid #bbf7d0; }
    .tt-form-lbl { font-size:10px; font-weight:700; color:#15803d; text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; }
    .tt-form-lbl strong { color:#14532d; font-weight:800; }
    .tt-form-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 9px; border-top:1px solid #dcfce7; background:var(--surface); }
    .tt-form-dia { font-size:11px; font-weight:700; color:var(--text); min-width:95px; white-space:nowrap; }
    .tt-horario-compact { display:flex; flex-direction:column; gap:3px; margin:2px 0 0; font-size:12px; color:var(--text); }
    .tt-horario-row { display:flex; align-items:center; gap:6px; }
    .tt-horario-row lucide-icon { color:var(--text-muted); flex-shrink:0; }
    .tt-clases-chips { display:flex; flex-wrap:wrap; gap:5px; margin:4px 0 0; }
    .tt-clase-chip { font-size:10px; font-weight:600; color:#15803d; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:5px; padding:2px 6px; }

  `],
})
export class HistorialCompetenciasModalComponent {
  readonly to12h = to12hUtil;
  readonly diaPluralLabel = diaPluralLabel;
  readonly formatFechaCorta = formatFechaCorta;
  readonly getDiaLabel = getDiaLabel;
  readonly calcHorasCompetencia = calcHorasCompetencia;
  readonly hoyIso = new Date().toISOString().slice(0, 10);

  open        = signal(false);
  histLoading = signal(false);
  histItems   = signal<any[]>([]);
  histFiltro  = signal('');
  histFichaFilters = signal<Record<string, string>>({});   // key=instructor (nombre), value=codigo ficha
  histDiasPopover      = signal<{ c: any; x: number; y: number } | null>(null);
  histResultadosPopover = signal<{ c: any; x: number; y: number } | null>(null);

  constructor(
    private horariosApi: HorariosApiService,
    private erpCatalogo: ErpCatalogoService,
  ) {}

  resultadosDe(c: any): Resultado[] {
    return normalizarResultados(c?.resultados);
  }

  estadoResultadoInfo(r: Resultado) {
    return estadoResultadoInfoUtil(r, this.hoyIso);
  }

  histFiltered = computed(() => {
    const q = this.histFiltro().trim().toLowerCase();
    if (!q) return this.histItems();
    return this.histItems().filter((c: any) =>
      (c.nombre ?? '').toLowerCase().includes(q) ||
      this.resultadosDe(c).some((r: Resultado) => r.texto.toLowerCase().includes(q)) ||
      (c.instructor_nombre ?? '').toLowerCase().includes(q) ||
      (c.ficha_codigo ?? '').toLowerCase().includes(q)
    );
  });

  /** Historial agrupado por instructor, ítems ordenados por fecha desc */
  histByInstructor = computed(() => {
    const map = new Map<string, { key: string; nombre: string; items: any[] }>();
    for (const c of this.histFiltered()) {
      const nombre = c.instructor_nombre || 'Sin instructor asignado';
      const key    = nombre; // usa el nombre como clave: no tenemos un id de instructor propio aquí
      if (!map.has(key)) map.set(key, { key, nombre, items: [] });
      map.get(key)!.items.push(c);
    }
    for (const g of map.values()) {
      g.items.sort((a: any, b: any) =>
        new Date(b.fecha_inicio ?? b.createdAt ?? 0).getTime() - new Date(a.fecha_inicio ?? a.createdAt ?? 0).getTime()
      );
    }
    return Array.from(map.values());
  });

  /** Obtiene los códigos únicos de ficha que tiene un grupo de instructor */
  getFichasDelGrupo(items: any[]): { codigo: string; programa: string }[] {
    const map = new Map<string, string>();
    items.forEach(c => {
      const cod = c.ficha_codigo;
      if (cod) map.set(cod, c.ficha_programa ?? '');
    });
    return Array.from(map.entries())
      .map(([codigo, programa]) => ({ codigo, programa }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }

  /** Ítems de un grupo filtrados por ficha seleccionada */
  getItemsFiltradosPorFicha(group: { key: string; items: any[] }): any[] {
    const sel = this.histFichaFilters()[group.key] ?? '';
    if (!sel) return group.items;
    return group.items.filter((c: any) => c.ficha_codigo === sel);
  }

  setFichaFilter(key: string, codigo: string) {
    this.histFichaFilters.update(m => ({ ...m, [key]: codigo }));
  }

  fichaOptionsFor(fichas: { codigo: string }[]): SSOption[] {
    return [
      { value: '', label: 'Todas las fichas' },
      ...fichas.map(f => ({ value: f.codigo, label: f.codigo })),
    ];
  }

  /**
   * No existe /horarios-admin/competencias (getCompetenciasAdmin() de ChronoGest, que
   * devolvía filas ya unidas con instructor_nombre/ficha_codigo/ficha_programa/dia_semana/
   * hora_inicio). Se reconstruye cruzando el catálogo completo de competencias con
   * los horarios (por asignacionId === horario.id) y el catálogo ERP de instructores/fichas.
   */
  async abrir() {
    this.open.set(true);
    this.histFiltro.set('');
    this.histFichaFilters.set({});
    this.histLoading.set(true);
    try {
      const [competencias, horarios, instructores, fichas] = await Promise.all([
        this.horariosApi.getCompetencias(),
        this.horariosApi.getHorarios(),
        this.erpCatalogo.getInstructores(),
        this.erpCatalogo.getFichas(),
      ]);
      const horarioMap = new Map<string, any>((horarios ?? []).map((h: any) => [String(h.id), h]));
      const instrMap   = new Map<string, any>((instructores ?? []).map((i: any) => [String(i.id), i]));
      const fichaMap   = new Map<string, any>((fichas ?? []).map((f: any) => [String(f.id), f]));

      const items = (competencias ?? []).map((c: any) => {
        const horario = c.asignacionId ? (horarioMap.get(String(c.asignacionId)) ?? null) : null;
        const instr   = c.instructorId ? (instrMap.get(String(c.instructorId)) ?? null) : null;
        const ficha   = c.fichaId ? (fichaMap.get(String(c.fichaId)) ?? null) : null;
        return {
          ...c,
          instructor_nombre: instr ? `${instr.nombre} ${instr.apellido}`.trim() : null,
          ficha_codigo: ficha?.codigo ?? null,
          ficha_programa: ficha?.programa ?? null,
          dia_semana: horario?.diaSemana ?? null,
          hora_inicio: horario?.horaInicio ?? null,
          fecha_inicio: c.fechaInicio ?? null,
          fecha_fin: c.fechaFin ?? null,
          horario: horario ? { diaSemana: horario.diaSemana, horaInicio: horario.horaInicio, horaFin: horario.horaFin } : null,
        };
      });
      this.histItems.set(items);
    } catch {
      this.histItems.set([]);
    } finally {
      this.histLoading.set(false);
    }
  }

  cerrar() { this.open.set(false); }

  showHistDias(c: any, event: MouseEvent) {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const popW = Math.min(300, window.innerWidth - margin * 2);
    const rowCount = (c.diasClase ?? []).length;
    const popH = 36 + rowCount * 27;
    // Antes "x" solo tenía límite superior (Math.min) — en pantallas angostas,
    // donde innerWidth - popW - margin puede dar negativo, quedaba negativo
    // sin ningún piso y el popover se salía por la izquierda (mismo bug ya
    // corregido en competencia-tooltip.component.ts).
    const x = Math.min(Math.max(rect.right + 10, margin), window.innerWidth - popW - margin);
    const y = Math.max(Math.min(rect.top - Math.floor(popH / 2), window.innerHeight - popH - margin), margin);
    this.histDiasPopover.set({ c, x, y });
  }
  hideHistDias() { this.histDiasPopover.set(null); }

  showHistResultados(c: any, event: MouseEvent) {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const popW = Math.min(300, window.innerWidth - margin * 2);
    const rowCount = this.resultadosDe(c).length;
    const popH = 36 + rowCount * 27;
    const x = Math.min(Math.max(rect.right + 10, margin), window.innerWidth - popW - margin);
    const y = Math.max(Math.min(rect.top - Math.floor(popH / 2), window.innerHeight - popH - margin), margin);
    this.histResultadosPopover.set({ c, x, y });
  }
  hideHistResultados() { this.histResultadosPopover.set(null); }
}
