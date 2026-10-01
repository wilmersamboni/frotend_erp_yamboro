// ─────────────────────────────────────────────────────────────────────────────
// table-header.component.ts  — <thead> con filtros de Área y Estado
// ─────────────────────────────────────────────────────────────────────────────
import {
  Component, input, output, signal, computed, HostListener, OnDestroy,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Column, STATUS_OPTIONS, statusDotColor } from './table-info.types';
import { calcularPanelFijo, fueDentroDelPanel, PanelFijo } from '../../../../shared/utils/panel-fijo';
import { openOverlay, releaseOverlay } from '../../../../shared/components/overlay-registry';

type Menu = 'area' | 'programa' | 'estado';

const TITULO_MENU: Record<Menu, string> = {
  area: 'Filtrar por área',
  programa: 'Filtrar por programa',
  estado: 'Filtrar por estado',
};

@Component({
  selector: 'app-table-header',
  standalone: true,
  imports: [NgTemplateOutlet],
  host: {
    style: 'display: contents'
  },
  template: `
    <thead>
      <tr>
        @for (col of columns(); track col.uid) {
          <th class="text-gray-500 text-[11px] font-semibold uppercase tracking-wider border-b py-3 px-4 text-left whitespace-nowrap select-none"
            style="background: var(--surface2); border-color: var(--border);"
            [class.cursor-pointer]="col.sortable && !conFiltro(col.uid)"
            [class.hover:text-gray-700]="col.sortable && !conFiltro(col.uid)"
            (click)="col.sortable && !conFiltro(col.uid) && sortChange.emit(col.uid)">

            @if (col.uid === 'area') {
              <ng-container *ngTemplateOutlet="botonFiltro; context: { menu: 'area', etiqueta: 'Área', activos: selectedAreas().length }" />
            } @else if (col.uid === 'programa') {
              <!-- Filtro + orden: el título ya no ordena al hacer clic (lo ocupa el filtro), así que el orden va en su propia flecha. -->
              <span class="inline-flex items-center gap-1">
                <ng-container *ngTemplateOutlet="botonFiltro; context: { menu: 'programa', etiqueta: 'Programa', activos: selectedProgramas().length }" />
                <button type="button" (click)="$event.stopPropagation(); sortChange.emit('programa')"
                  [attr.aria-label]="'Ordenar por programa' + (sortCol() === 'programa' ? (sortDir() === 'asc' ? ' (A-Z)' : ' (Z-A)') : '')"
                  class="w-6 h-6 inline-flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors text-[11px]"
                  [style.color]="sortCol() === 'programa' ? 'var(--accent-brand)' : null"
                  [class.text-gray-300]="sortCol() !== 'programa'">{{ sortCol() === 'programa' && sortDir() === 'desc' ? '↓' : '↑' }}</button>
              </span>
            } @else if (col.uid === 'estado') {
              <ng-container *ngTemplateOutlet="botonFiltro; context: { menu: 'estado', etiqueta: 'Estado', activos: selectedStatuses().length }" />
            } @else {
              <span class="inline-flex items-center gap-1">
                {{ col.name }}
                @if (col.sortable) {
                  <span class="text-[10px] transition-opacity"
                    [class.opacity-0]="sortCol() !== col.uid"
                    style="color: var(--accent-brand);">{{ sortCol() === col.uid && sortDir() === 'desc' ? '↓' : '↑' }}</span>
                }
              </span>
            }

          </th>
        }
      </tr>
    </thead>

    <!-- Botón de filtro del encabezado (Área / Estado) -->
    <ng-template #botonFiltro let-menu="menu" let-etiqueta="etiqueta" let-activos="activos">
      <button type="button" #btn (click)="$event.stopPropagation(); alternar(menu, btn)"
        [attr.aria-expanded]="abierto() === menu" aria-haspopup="true"
        class="-ml-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors"
        [class.hover:bg-gray-100]="!activos"
        [style.background]="activos ? 'var(--accent-soft)' : null"
        [style.color]="activos ? 'var(--accent-text)' : null">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 5h18M6 12h12M10 19h4"/>
        </svg>
        {{ etiqueta }}
        @if (activos) {
          <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-white text-[10px] font-bold rounded-full"
            style="background: var(--accent-brand);">{{ activos }}</span>
        }
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          class="transition-transform" [class.rotate-180]="abierto() === menu">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
    </ng-template>

    <!-- Panel del filtro: fijo, para que no lo recorte el overflow de la tabla -->
    @if (abierto() && pos(); as p) {
      <div class="fixed inset-0 z-[99998]" (click)="cerrar()"></div>
      <div data-panel-fijo role="menu" [attr.aria-label]="titulo()"
        class="fixed z-[99999] rounded-2xl border shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        style="background: var(--surface); border-color: var(--border);"
        [style.top.px]="p.top" [style.bottom.px]="p.bottom" [style.left.px]="p.left"
        [style.width.px]="p.ancho" [style.max-height.px]="p.altoMax">

        <div class="flex items-center justify-between px-4 pt-3 pb-2">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{{ titulo() }}</span>
          @if (seleccionados().length) {
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style="background: var(--accent-soft); color: var(--accent-text);">{{ seleccionados().length }}</span>
          }
        </div>

        @if (abierto() === 'programa') {
          <!-- Puede haber decenas de programas con nombres largos: buscador dentro del panel. -->
          <div class="px-3 pb-2">
            <div class="relative">
              <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7"/><path stroke-linecap="round" d="m20 20-3.5-3.5"/>
              </svg>
              <input #buscadorPrograma type="text" [value]="busqueda()" (input)="busqueda.set(buscadorPrograma.value)"
                placeholder="Buscar programa..." aria-label="Buscar programa"
                class="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:border-[#39A900]" />
            </div>
          </div>
        }

        <div class="px-1.5 pb-1.5 overflow-y-auto [scrollbar-width:thin]">
          @if (abierto() === 'programa') {
            @for (prog of programasVisibles(); track prog) {
              <ng-container *ngTemplateOutlet="opcion; context: { valor: prog, texto: prog, marcado: selectedProgramas().includes(prog), largo: true }" />
            } @empty {
              <p class="px-3 py-3 text-sm text-gray-400">{{ busqueda() ? 'Ningún programa coincide.' : 'No hay programas para filtrar.' }}</p>
            }
          } @else if (abierto() === 'area') {
            @for (area of areas(); track area) {
              <ng-container *ngTemplateOutlet="opcion; context: { valor: area, texto: area, marcado: selectedAreas().includes(area) }" />
            } @empty {
              <p class="px-3 py-3 text-sm text-gray-400">No hay áreas para filtrar.</p>
            }
          } @else {
            @for (s of statusOptions; track s.uid) {
              <ng-container *ngTemplateOutlet="opcion; context: { valor: s.uid, texto: s.name, marcado: selectedStatuses().includes(s.uid), punto: dotColor(s.uid) }" />
            }
          }
        </div>

        @if (seleccionados().length) {
          <div class="border-t px-3 py-2 flex justify-end" style="border-color: var(--border);">
            <button type="button" (click)="limpiar()"
              class="text-xs font-semibold text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
              Limpiar filtro
            </button>
          </div>
        }
      </div>
    }

    <!-- Opción con casilla propia (colores del tema, también en modo oscuro) -->
    <ng-template #opcion let-valor="valor" let-texto="texto" let-marcado="marcado" let-punto="punto" let-largo="largo">
      <button type="button" role="menuitemcheckbox" [attr.aria-checked]="marcado" (click)="elegir(valor)"
        class="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors">
        <span class="w-4 h-4 rounded-[5px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors"
          [style.background]="marcado ? 'var(--accent-brand)' : 'transparent'"
          [style.border-color]="marcado ? 'var(--accent-brand)' : 'var(--border-strong)'">
          @if (marcado) {
            <svg class="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
          }
        </span>
        @if (punto) {
          <span class="w-2 h-2 rounded-full flex-shrink-0" [style.background-color]="punto"></span>
        }
        <!-- Los nombres de programa son largos: se parten en 2 líneas en vez de cortarse. -->
        <span [class.truncate]="!largo" [class.line-clamp-2]="largo" [class.leading-snug]="largo" [class.font-semibold]="marcado">{{ texto }}</span>
      </button>
    </ng-template>
  `,
})
export class TableHeaderComponent implements OnDestroy {
  // ── Inputs ─────────────────────────────────────────────────────────────────
  columns          = input.required<Column[]>();
  areas            = input.required<string[]>();
  selectedAreas    = input.required<string[]>();
  programas        = input.required<string[]>();
  selectedProgramas = input.required<string[]>();
  selectedStatuses = input.required<string[]>();
  sortCol          = input.required<string>();
  sortDir          = input<'asc' | 'desc'>('asc');

  // ── Outputs ────────────────────────────────────────────────────────────────
  sortChange    = output<string>();
  toggleArea    = output<string>();
  clearAreas    = output<void>();
  togglePrograma = output<string>();
  clearProgramas = output<void>();
  toggleStatus  = output<string>();
  clearStatuses = output<void>();

  // ── Internos ───────────────────────────────────────────────────────────────
  statusOptions = STATUS_OPTIONS;
  dotColor = statusDotColor;

  readonly abierto = signal<Menu | null>(null);
  readonly pos = signal<PanelFijo | null>(null);
  /** Texto del buscador del panel de programas. */
  readonly busqueda = signal('');

  readonly titulo = computed(() => { const m = this.abierto(); return m ? TITULO_MENU[m] : ''; });

  /** Programas que coinciden con el buscador (sin tildes ni mayúsculas); los marcados siempre se ven. */
  readonly programasVisibles = computed(() => {
    const q = normalizar(this.busqueda().trim());
    if (!q) return this.programas();
    return this.programas().filter((p) => normalizar(p).includes(q) || this.selectedProgramas().includes(p));
  });

  /** Columnas cuyo título es un botón de filtro (el clic en el título no ordena). */
  conFiltro(uid: string): boolean {
    return uid === 'area' || uid === 'programa' || uid === 'estado';
  }

  private readonly cerrarFn = () => this.cerrar();
  private readonly alDesplazar = (e: Event) => { if (!fueDentroDelPanel(e)) this.cerrar(); };

  seleccionados(): string[] {
    switch (this.abierto()) {
      case 'area': return this.selectedAreas();
      case 'programa': return this.selectedProgramas();
      default: return this.selectedStatuses();
    }
  }

  alternar(menu: Menu, boton: HTMLElement): void {
    if (this.abierto() === menu) { this.cerrar(); return; }
    const opciones = menu === 'area' ? this.areas().length : menu === 'programa' ? this.programas().length : this.statusOptions.length;
    const extra = menu === 'programa' ? 48 : 0; // buscador
    this.busqueda.set('');
    this.pos.set(calcularPanelFijo(boton, {
      ancho: menu === 'programa' ? 320 : 240,
      altoEstimado: Math.min(400, 96 + extra + opciones * 38),
    }));
    this.abierto.set(menu);
    openOverlay(this.cerrarFn);
    // Fijo en pantalla: si la tabla o la página se desplazan, el panel quedaría
    // flotando lejos del botón; se cierra (captura: incluye el scroll horizontal de la tabla).
    window.addEventListener('scroll', this.alDesplazar, true);
    window.addEventListener('resize', this.alDesplazar);
  }

  elegir(valor: string): void {
    switch (this.abierto()) {
      case 'area': this.toggleArea.emit(valor); break;
      case 'programa': this.togglePrograma.emit(valor); break;
      default: this.toggleStatus.emit(valor);
    }
  }

  limpiar(): void {
    switch (this.abierto()) {
      case 'area': this.clearAreas.emit(); break;
      case 'programa': this.clearProgramas.emit(); break;
      default: this.clearStatuses.emit();
    }
  }

  cerrar(): void {
    if (!this.abierto()) return;
    this.abierto.set(null);
    this.pos.set(null);
    releaseOverlay(this.cerrarFn);
    window.removeEventListener('scroll', this.alDesplazar, true);
    window.removeEventListener('resize', this.alDesplazar);
  }

  @HostListener('document:keydown.escape')
  alEscape(): void { this.cerrar(); }

  ngOnDestroy(): void { this.cerrar(); }
}

/** Minúsculas y sin tildes, para buscar "gestion" y encontrar "GESTIÓN". */
function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
