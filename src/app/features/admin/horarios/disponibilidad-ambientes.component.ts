import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ErpCatalogoService } from '../../../core/services/horarios/erp-catalogo.service';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { DIAS_LABELS } from '../../../core/utils/horarios.util';

/**
 * Panel "Consultar Disponibilidad de Ambientes" — extraído de horarios.component.ts.
 * Solo visible en la vista "ambiente"; al hacer click en un ambiente disponible
 * emite `elegir` para que el padre abra el wizard de horario prellenado.
 */
@Component({
  selector: 'app-disponibilidad-ambientes',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, SearchableSelectComponent],
  template: `
    <div class="matrix-disp-header" style="display:flex; align-items:center; gap:10px; padding:12px 16px; background:var(--surface2); border-bottom:1px solid var(--border); flex-wrap:wrap;">
      <div style="min-width:130px; flex:1; max-width:160px;">
        <app-ss [options]="dispDiaOpts()" placeholder="Todos los días" [(ngModel)]="dispDia"></app-ss>
      </div>
      <div style="min-width:120px; flex:1; max-width:150px;">
        <app-ss [options]="dispJornadaOpts" placeholder="Jornada..." [(ngModel)]="dispJornada"></app-ss>
      </div>
      <div style="min-width:130px; flex:1; max-width:175px;">
        <app-ss [options]="dispAreaOpts()" placeholder="Todas las áreas" [(ngModel)]="dispArea"></app-ss>
      </div>
      <button class="bg-sena-gradient hover:opacity-90 text-white font-semibold rounded-lg transition-all" style="height:34px; padding:0 14px; font-size:12px; white-space:nowrap;" (click)="checkDisp()">
        <lucide-icon name="search" [size]="13" style="vertical-align:-2px;margin-right:4px;"></lucide-icon>Verificar
      </button>
      @if (dispResult().length > 0 || dispDia || dispJornada || dispArea) {
        <button class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 rounded-lg transition-all" style="height:34px; padding:0 12px; font-size:12px; white-space:nowrap; display:flex; align-items:center; gap:5px;" (click)="clearDisp()">
          <lucide-icon name="x" [size]="12"></lucide-icon> Limpiar
        </button>
      }
    </div>

    @if (dispResult().length > 0) {
      <div style="padding:6px 16px; background:var(--surface2); border-bottom:1px solid var(--border); font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <lucide-icon name="filter" [size]="11" style="opacity:.6;"></lucide-icon>
        <span><strong>{{ dispResultFiltered().length }}</strong> ambiente{{ dispResultFiltered().length !== 1 ? 's' : '' }}
          @if (dispResultFiltered().length !== dispResult().length) { <span style="opacity:.7;">(de {{ dispResult().length }})</span> }
        </span>
        @if (dispDia) { <span class="disp-tag">{{ LABELS[dispDia] || dispDia }}</span> }
        @if (dispJornada) { <span class="disp-tag">{{ dispJornada }}</span> }
        @if (dispArea) { <span class="disp-tag">{{ dispArea }}</span> }
      </div>
      <div class="disp-grid" style="padding:16px; background:var(--surface); border-bottom: 2px solid var(--border);">
        @for (a of dispResultFiltered(); track a.id) {
          <div class="disp-card" [class.ocupado]="!a.disponible" [class.disponible-click]="a.disponible"
               (click)="a.disponible && elegir.emit({ ambiente: a, dia: dispDia, jornada: dispJornada })"
               [title]="a.disponible ? 'Click para crear horario en ' + a.nombre : (a.fichaOcupado ? 'Ocupado por ficha ' + a.fichaOcupado : 'Ocupado')">
            <span class="disp-icon">
              @if (a.disponible) { <lucide-icon name="check-circle" [size]="20" style="color:#16a34a"></lucide-icon> }
              @else { <lucide-icon name="x-circle" [size]="20" style="color:#dc2626"></lucide-icon> }
            </span>
            <span class="disp-name">{{ a.nombre }}</span>
            @if (a.area_nombre) { <span class="disp-area">{{ a.area_nombre }}</span> }
            <span class="disp-status">
              @if (a.disponible) { Disponible · Click para crear horario }
              @else if (a.programaOcupado) { Ficha: {{ a.fichaOcupado ?? '—' }} }
              @else { Ocupado }
            </span>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .disp-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:0; }
    .disp-card {
      background:var(--surface2);border-radius:8px;padding:12px;
      display:flex;flex-direction:column;align-items:center;gap:4px;
      border:1.5px solid var(--border);font-size:13px;
    }
    .disp-card.ocupado { background:#fee2e2;border-color:#fca5a5; }
    .disp-name { font-weight:600;color:var(--text);text-align:center; }
    .disp-area { font-size:10px;color:var(--text-muted);text-align:center;background:var(--surface);border-radius:4px;padding:1px 6px; }
    .disp-status { font-size:11px;color:var(--text-muted);text-align:center; }
    .disp-tag { display:inline-flex;align-items:center;background:#dcfce7;color:#15803d;border-radius:10px;padding:1px 8px;font-size:10px;font-weight:700; }
    .disp-card.disponible-click { cursor: pointer; transition: border-color .15s, background .15s, box-shadow .15s; }
    .disp-card.disponible-click:hover {
      background: rgba(22,163,74,.12); border-color: #16a34a; box-shadow: 0 0 0 2px rgba(22,163,74,.15);
    }
    .disp-card.disponible-click .disp-status { color: #16a34a; font-weight: 600; font-size: 11px; }

  `],
})
export class DisponibilidadAmbientesComponent {
  @Input() ambientes: any[] = [];
  @Output() elegir = new EventEmitter<{ ambiente: any; dia: string; jornada: string }>();

  readonly LABELS = DIAS_LABELS;
  readonly diasKeys = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

  dispDia     = '';
  dispJornada = '';
  dispArea    = '';
  dispResult  = signal<any[]>([]);

  constructor(private erpCatalogo: ErpCatalogoService) {}

  dispDiaOpts = computed<SSOption[]>(() => [
    { value: '', label: 'Todos los días' },
    ...this.diasKeys.map(d => ({ value: d, label: this.LABELS[d] || d }))
  ]);

  dispJornadaOpts: SSOption[] = [
    { value: '', label: 'Jornada...' },
    { value: 'manana', label: 'Mañana' },
    { value: 'tarde', label: 'Tarde' },
    { value: 'noche', label: 'Noche' }
  ];

  dispAreaOpts = computed<SSOption[]>(() => {
    const areas = new Set<string>();
    (this.ambientes ?? []).forEach((a: any) => { if (a.area) areas.add(a.area); });
    return [
      { value: '', label: 'Todas las áreas' },
      ...[...areas].sort().map(a => ({ value: a, label: a })),
    ];
  });

  dispResultFiltered = computed<any[]>(() => {
    let r = this.dispResult();
    if (this.dispArea) r = r.filter(a => a.area_nombre === this.dispArea);
    return r;
  });

  /**
   * erpCatalogo.getAmbientesDisponibilidad(dia, jornada) no expone detalle fino
   * de conflicto (instructor/ficha ocupando el ambiente) — se dejan en null y
   * el template ya oculta esas líneas cuando faltan. Se alias-ea area_nombre
   * (nombre que el template heredado de ChronoGest espera) al campo `.area`
   * que expone erpCatalogo.
   */
  async checkDisp() {
    const result = await this.erpCatalogo
      .getAmbientesDisponibilidad(this.dispDia, this.dispJornada)
      .catch(() => []);
    this.dispResult.set((result ?? []).map((a: any) => ({
      ...a,
      area_nombre: a.area ?? null,
      fichaOcupado: null,
      programaOcupado: null,
    })));
  }

  clearDisp() {
    this.dispDia = '';
    this.dispJornada = '';
    this.dispArea = '';
    this.dispResult.set([]);
  }
}
