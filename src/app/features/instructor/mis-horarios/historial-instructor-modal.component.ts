import { Component, Input, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { HorariosApiService } from '../../../core/services/horarios/horarios-api.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  normalizarResultados, estadoResultado, to12h, diaPluralLabel,
  formatFechaCorta, getDiaLabel, durHorarioMin, jornadaLabel, Resultado,
} from '../../../core/utils/horarios.util';

const RESULTADO_ESTADO_INFO: Record<string, { label: string; bg: string; text: string }> = {
  'sin-fecha':  { label: 'Sin fecha',  bg: '#f3f4f6', text: '#6b7280' },
  'pendiente':  { label: 'Pendiente',  bg: '#fef3c7', text: '#92400e' },
  'en-curso':   { label: 'En curso',   bg: '#dbeafe', text: '#1d4ed8' },
  'completado': { label: 'Completado', bg: '#dcfce7', text: '#166534' },
};

/**
 * Modal "Historial de Competencias" — extraído de instructor-mis-horarios.component.ts.
 * A diferencia del historial de admin/horarios (que agrega TODOS los horarios), este
 * consulta solo las competencias del instructor autenticado.
 */
@Component({
  selector: 'app-historial-instructor-modal',
  standalone: true,
  imports: [FormsModule, DatePipe, LucideAngularModule, SearchableSelectComponent],
  template: `
    @if (open()) {
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl hist-modal" (click)="$event.stopPropagation()">
        <div class="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <h3 style="margin:0">Historial de Competencias</h3>
            <p style="font-size:12px;color:var(--text-muted);margin:2px 0 0">Todas las competencias registradas en tus horarios</p>
          </div>
          <button class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors" (click)="cerrar()"><lucide-icon name="x" [size]="18"></lucide-icon></button>
        </div>

        <div style="padding:12px 0 8px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <div style="position:relative;flex:1;min-width:180px;">
            <lucide-icon name="search" [size]="13" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none;"></lucide-icon>
            <input class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900]" style="padding-left:32px;font-size:13px;"
                   [ngModel]="histFiltro()" (ngModelChange)="histFiltro.set($event)"
                   placeholder="Buscar competencia...">
          </div>
          @if (histFichasDisponibles().length > 1) {
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;width:180px;">
              <lucide-icon name="filter" [size]="13" style="color:var(--text-muted);opacity:.7;flex-shrink:0;"></lucide-icon>
              <app-ss [options]="histFichaOptions()" placeholder="Todas las fichas"
                      [ngModel]="histFichaFilter()" (ngModelChange)="histFichaFilter.set($event)"></app-ss>
              @if (histFichaFilter()) {
                <button class="hist-ficha-clear" (click)="histFichaFilter.set('')" title="Limpiar">
                  <lucide-icon name="x" [size]="10"></lucide-icon>
                </button>
              }
            </div>
          }
          <span style="font-size:12px;color:var(--text-muted);white-space:nowrap;">
            {{ histFiltered().length }} resultado{{ histFiltered().length !== 1 ? 's' : '' }}
          </span>
        </div>

        @if (histLoading()) {
          <div style="text-align:center;padding:32px;color:var(--text-muted);">
            <lucide-icon name="loader" [size]="22" class="spin"></lucide-icon>
          </div>
        } @else if (histByMonth().length === 0) {
          <div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px;">Sin competencias registradas</div>
        } @else {
          <div class="hist-sections-wrap">
            @for (group of histByMonth(); track group.key) {
              <div class="hist-month-header">
                <lucide-icon name="calendar" [size]="14" style="flex-shrink:0;opacity:.7;"></lucide-icon>
                <span style="font-weight:700;font-size:13px;text-transform:capitalize;">{{ group.label }}</span>
                <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">
                  {{ group.items.length }} competencia{{ group.items.length !== 1 ? 's' : '' }}
                </span>
              </div>
              <div class="hist-table-wrap" style="margin-bottom:20px;">
                <table class="hist-table">
                  <thead>
                    <tr>
                      <th style="width:36px;">#</th>
                      <th>Fecha</th>
                      <th>Día / Jornada</th>
                      <th>Ficha / Programa</th>
                      <th>Competencia</th>
                      <th>Resultado</th>
                      <th>Período</th>
                      <th>Días / Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of group.items; track c.id; let i = $index) {
                    <tr>
                      <td style="font-size:11px;color:var(--text-muted);text-align:center;font-weight:700;">{{ i + 1 }}</td>
                      <td style="font-size:11px;white-space:nowrap;">
                        <span style="font-weight:600;color:var(--text);">{{ c.createdAt | date:'dd/MM/yyyy' }}</span>
                      </td>
                      <td>
                        <span class="hist-dia-badge">{{ getDiaLabel(c.horario?.diaSemana) }}</span>
                        <span class="hist-jorn-badge">{{ jornadaLabel(c.horario?.jornada) }}</span>
                      </td>
                      <td style="font-size:12px;">
                        <strong>{{ c.ficha?.codigo || '—' }}</strong><br>
                        <span style="color:var(--text-muted);font-size:11px;">{{ c.ficha?.programa || '' }}</span>
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
                        @if (c.fechaInicio) {
                          <span>{{ c.fechaInicio | date:'dd/MM/yy' }} — {{ c.fechaFin | date:'dd/MM/yy' }}</span>
                        } @else { <span>—</span> }
                      </td>
                      <td style="text-align:center;vertical-align:middle;">
                        @if ((c.diasClase ?? []).length > 0) {
                          <button class="hist-horas-btn"
                                  (mouseenter)="showHistDias(c, $event)"
                                  (mouseleave)="hideHistDias()">
                            <lucide-icon name="clock" [size]="13"></lucide-icon>
                            <span>{{ calcHorasCompetencia(c, c.horario) }}h</span>
                          </button>
                        } @else {
                          <span style="font-size:11px;color:var(--text-muted);">—</span>
                        }
                      </td>
                    </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
      </div>
    </div>
    }

    @if (histDiasPopover()) {
      <div class="hist-dias-popover"
           [style.left.px]="histDiasPopover()!.x"
           [style.top.px]="histDiasPopover()!.y">
        <div class="tt-form-header-row">
          <span class="tt-form-lbl">Días: <strong>{{ (histDiasPopover()!.c.diasClase ?? []).length }} clases</strong></span>
          <span class="tt-form-lbl">Horas: <strong>{{ calcHorasCompetencia(histDiasPopover()!.c, histDiasPopover()!.c.horario) }}h</strong></span>
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
    .hist-modal { width: 95vw; max-width: 920px; max-height: 88vh; overflow: hidden; display: flex; flex-direction: column; }
    .hist-sections-wrap { flex: 1; overflow-y: auto; padding: 4px 0; }
    .hist-month-header {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px; background: var(--surface2);
      border-left: 4px solid #39A900;
      margin-top: 8px; border-radius: 0 6px 0 0;
      color: var(--text); font-size: 13px;
    }
    .hist-table-wrap { overflow-x: auto; }
    .hist-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .hist-table thead tr { background: #f9fafb; position: sticky; top: 0; z-index: 2; border-bottom: 2px solid var(--border); }
    .hist-table th { padding: 10px 14px; color: #374151; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; text-align: left; white-space: nowrap; }
    .hist-table td { padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
    .hist-table tbody tr:hover td { background: var(--surface2); }
    .hist-dia-badge { display:inline-block; background:rgba(57,169,0,.15); color:#2d8500; border-radius:4px; padding:2px 7px; font-size:11px; font-weight:700; text-transform:capitalize; margin-right:4px; }
    .hist-jorn-badge { display:inline-block; background:var(--surface2); color:var(--text-muted); border-radius:4px; padding:2px 7px; font-size:10px; font-weight:600; }

    .hist-ficha-sel {
      height: 28px; padding: 0 8px; font-size: 12px; font-weight: 600;
      border: 1px solid #bbf7d0; border-radius: 6px;
      background: #fff; color: #15803d; cursor: pointer; outline: none; max-width: 140px;
    }
    .hist-ficha-sel:focus { border-color: #39A900; box-shadow: 0 0 0 2px rgba(57,169,0,.15); }
    .hist-ficha-clear {
      display: flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; border-radius: 50%;
      border: 1px solid #bbf7d0; background: #f0fdf4; color: #15803d;
      cursor: pointer; flex-shrink: 0; transition: all .15s;
    }
    .hist-ficha-clear:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
    .hist-horas-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 8px; border: 1px solid #bbf7d0; border-radius: 6px;
      background: #f0fdf4; color: #15803d; cursor: default;
      font-size: 11px; font-weight: 700; transition: all .15s;
    }
    .hist-horas-btn:hover { background: #39A900; color: #fff; border-color: #39A900; }

    .hist-dias-popover {
      position: fixed; z-index: 10000;
      min-width: 250px; max-width: min(340px, calc(100vw - 16px));
      border: 1px solid var(--border); border-radius: 7px;
      box-shadow: 0 8px 24px rgba(0,0,0,.15);
      overflow: hidden; background: var(--surface);
      pointer-events: none;
    }
    .tt-form-header-row {
      display: flex; align-items: center; justify-content: space-between; gap: 6px;
      padding: 5px 9px; background: #dcfce7; border-bottom: 1px solid #bbf7d0;
    }
    .tt-form-lbl {
      font-size: 10px; font-weight: 700; color: #15803d;
      text-transform: uppercase; letter-spacing: .04em; white-space: nowrap;
    }
    .tt-form-lbl strong { color: #14532d; font-weight: 800; }
    .tt-form-row {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 4px 9px; border-top: 1px solid #dcfce7; background: var(--surface);
    }
    .tt-form-dia { font-size: 11px; font-weight: 700; color: var(--text); min-width: 95px; white-space: nowrap; }
    .tt-horario-compact { display: flex; flex-direction: column; gap: 3px; margin: 2px 0 0; font-size: 12px; color: var(--text); }
    .tt-horario-row { display: flex; align-items: center; gap: 6px; }
    .tt-horario-row lucide-icon { color: var(--text-muted); flex-shrink: 0; }
    .tt-clases-chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 4px 0 0; }
    .tt-clase-chip { font-size: 10px; font-weight: 600; color: #15803d; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 5px; padding: 2px 6px; }

  `],
})
export class HistorialInstructorModalComponent {
  @Input() fichas: any[] = [];

  readonly to12h = to12h;
  readonly jornadaLabel = jornadaLabel;
  readonly diaPluralLabel = diaPluralLabel;
  readonly formatFechaCorta = formatFechaCorta;
  readonly getDiaLabel = getDiaLabel;
  readonly hoyIso = new Date().toISOString().slice(0, 10);

  open        = signal(false);
  histLoading = signal(false);
  histItems   = signal<any[]>([]);
  histFiltro  = signal('');
  histFichaFilter = signal('');
  histDiasPopover = signal<{ c: any; x: number; y: number } | null>(null);
  histResultadosPopover = signal<{ c: any; x: number; y: number } | null>(null);

  histFichasDisponibles = computed((): { codigo: string; programa: string }[] => {
    const map = new Map<string, string>();
    this.histItems().forEach(c => {
      const cod = c.ficha?.codigo;
      if (cod) map.set(cod, c.ficha.programa ?? '');
    });
    return Array.from(map.entries())
      .map(([codigo, programa]) => ({ codigo, programa }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  });

  histFichaOptions = computed<SSOption[]>(() =>
    [
      { value: '', label: 'Todas las fichas' },
      ...this.histFichasDisponibles().map(f => ({ value: f.codigo, label: f.codigo })),
    ]
  );

  histFiltered = computed(() => {
    const q     = this.histFiltro().trim().toLowerCase();
    const ficha = this.histFichaFilter();
    return this.histItems().filter(c => {
      if (ficha && c.ficha?.codigo !== ficha) return false;
      if (!q) return true;
      return (
        (c.nombre ?? '').toLowerCase().includes(q) ||
        this.resultadosDe(c).some(r => r.texto.toLowerCase().includes(q)) ||
        (c.ficha?.codigo ?? '').toLowerCase().includes(q)
      );
    });
  });

  histByMonth = computed(() => {
    const map = new Map<string, { key: string; label: string; items: any[] }>();
    const sorted = [...this.histFiltered()].sort((a, b) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    );
    for (const c of sorted) {
      const d    = new Date(c.createdAt ?? Date.now());
      const key  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key)!.items.push(c);
    }
    return Array.from(map.values());
  });

  constructor(private horariosApi: HorariosApiService, private auth: AuthService) {}

  async abrir() {
    this.open.set(true);
    this.histFiltro.set('');
    this.histFichaFilter.set('');
    this.histLoading.set(true);
    const id = this.auth.user()?.personaId;
    if (!id) { this.histLoading.set(false); return; }
    try {
      const data = await this.horariosApi.getCompetenciasByInstructor(id);
      const fichaMap = new Map<string, any>(this.fichas.map(f => [String(f.id), f]));
      const enriched = (data as any[]).map(c => {
        const fichaId = c.fichaId ?? c.asignacion?.fichaId ?? null;
        return {
          ...c,
          horario: c.asignacion?.horario ?? null,
          ficha: fichaId ? (fichaMap.get(String(fichaId)) ?? null) : null,
        };
      });
      this.histItems.set(enriched);
    } catch {
      this.histItems.set([]);
    } finally {
      this.histLoading.set(false);
    }
  }

  cerrar() {
    this.open.set(false);
  }

  resultadosDe(c: any): Resultado[] {
    return normalizarResultados(c.resultados);
  }

  estadoResultadoInfo(r: Resultado) {
    return RESULTADO_ESTADO_INFO[estadoResultado(r, this.hoyIso)];
  }

  private _duracionHorarioMin(h: any): number {
    return durHorarioMin(h);
  }

  private _formatHoras(totalMin: number): string {
    const h = totalMin / 60;
    return Number.isInteger(h) ? String(h) : h.toFixed(1);
  }

  calcHorasCompetencia(comp: any, h: any): string {
    const dias = (comp?.diasClase ?? []).length;
    if (!dias) return '0';
    return this._formatHoras(dias * this._duracionHorarioMin(h));
  }

  showHistDias(c: any, event: MouseEvent) {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const popW = Math.min(300, window.innerWidth - margin * 2);
    const rowCount = (c.diasClase ?? []).length;
    const popH = 36 + rowCount * 27;
    // Antes "x" solo tenía límite superior (Math.min) — en pantallas angostas
    // quedaba negativo sin ningún piso y el popover se salía por la izquierda
    // (mismo bug ya corregido en competencia-tooltip.component.ts).
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
