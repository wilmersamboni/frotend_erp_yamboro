// ─────────────────────────────────────────────────────────────────────────────
// table-toolbar.component.ts  — Búsqueda · Columnas visibles · Filas por página
// ─────────────────────────────────────────────────────────────────────────────
import {
  Component, input, output, signal, computed, HostListener, OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { COLUMNS, INITIAL_VISIBLE_COLS } from './table-info.types';
import { PageSizeSelectComponent } from '../../../../shared/components/page-size-select.component';
import { EsperaDirective } from '../../../../shared/directives/espera.directive';
import { calcularPanelFijo, fueDentroDelPanel, PanelFijo } from '../../../../shared/utils/panel-fijo';
import { openOverlay, releaseOverlay } from '../../../../shared/components/overlay-registry';

@Component({
  selector: 'app-table-toolbar',
  standalone: true,
  imports: [EsperaDirective, FormsModule, PageSizeSelectComponent],
  template: `
    <div class="px-5 pt-5 pb-4 flex flex-col gap-4">

      <!-- Fila principal: búsqueda + botón columnas -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

        <!-- Búsqueda -->
        <div class="relative w-full sm:max-w-md">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7"/><path stroke-linecap="round" d="m20 20-3.5-3.5"/>
          </svg>
          <input appEspera
            type="text"
            [ngModel]="filter()"
            (ngModelChange)="filterChange.emit($event)"
            placeholder="Buscar por nombre o identificación..."
            aria-label="Buscar aprendices"
            class="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 hover:border-gray-300 focus:bg-white focus:outline-none focus:border-[#39A900] focus:ring-2 focus:ring-[#39A900]/15 transition-colors"/>
          @if (filter()) {
            <button type="button" aria-label="Limpiar búsqueda" (click)="filterChange.emit('')"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          }
        </div>

        <!-- Botón Columnas -->
        <button type="button" #btnCol (click)="$event.stopPropagation(); alternar(btnCol)"
          [attr.aria-expanded]="!!pos()" aria-haspopup="true"
          class="self-start sm:self-auto inline-flex items-center gap-2 px-3.5 py-2.5 border rounded-xl text-sm font-medium text-gray-600 bg-gray-50 hover:border-gray-300 transition-colors"
          [class.border-gray-200]="!pos()"
          [style.border-color]="pos() ? 'var(--accent-brand)' : null">
          <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>
          </svg>
          Columnas
          <span class="text-[11px] font-semibold px-1.5 py-0.5 rounded-md"
            [style.background]="ocultas() ? 'var(--accent-soft)' : null"
            [style.color]="ocultas() ? 'var(--accent-text)' : null"
            [class.text-gray-400]="!ocultas()">{{ visibles() }}/{{ seleccionables.length }}</span>
          <svg class="w-3.5 h-3.5 text-gray-400 transition-transform" [class.rotate-180]="!!pos()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="m19 9-7 7-7-7"/>
          </svg>
        </button>
      </div>

      <!-- Sub-toolbar: total + filas por página -->
      <div class="flex justify-between items-center">
        <span class="text-sm text-gray-500"><span class="font-semibold text-gray-700">{{ total() }}</span> aprendices</span>
        <app-page-size-select
          [value]="rowsPerPage()"
          [sizes]="[5, 10, 15, 20]"
          (valueChange)="rowsPerPageChange.emit($event)" />
      </div>

    </div>

    <!-- Panel de columnas: fijo y en la capa más alta — antes el selector de
         "filas por página" se pintaba encima de este menú. -->
    @if (pos(); as p) {
      <div class="fixed inset-0 z-[99998]" (click)="cerrar()"></div>
      <div data-panel-fijo role="menu" aria-label="Columnas visibles"
        class="fixed z-[99999] rounded-2xl border shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100"
        style="background: var(--surface); border-color: var(--border);"
        [style.top.px]="p.top" [style.bottom.px]="p.bottom" [style.left.px]="p.left"
        [style.width.px]="p.ancho" [style.max-height.px]="p.altoMax">

        <div class="flex items-center justify-between px-4 pt-3 pb-2">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Columnas visibles</span>
          <span class="text-[11px] font-semibold text-gray-400">{{ visibles() }} de {{ seleccionables.length }}</span>
        </div>

        <div class="px-1.5 pb-1.5 overflow-y-auto [scrollbar-width:thin]">
          @for (col of seleccionables; track col.uid) {
            <button type="button" role="menuitemcheckbox" [attr.aria-checked]="visibleCols().has(col.uid)"
              (click)="alternarColumna(col.uid)"
              [disabled]="visibleCols().has(col.uid) && visibles() === 1"
              class="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <span class="w-4 h-4 rounded-[5px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors"
                [style.background]="visibleCols().has(col.uid) ? 'var(--accent-brand)' : 'transparent'"
                [style.border-color]="visibleCols().has(col.uid) ? 'var(--accent-brand)' : 'var(--border-strong)'">
                @if (visibleCols().has(col.uid)) {
                  <svg class="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                }
              </span>
              <span [class.font-semibold]="visibleCols().has(col.uid)">{{ col.name }}</span>
            </button>
          }
        </div>

        <div class="border-t px-3 py-2 flex items-center justify-between gap-2" style="border-color: var(--border);">
          <button type="button" (click)="mostrarTodas()" [disabled]="!ocultas()"
            class="text-xs font-semibold px-2 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-default hover:bg-gray-50"
            style="color: var(--accent-text);">
            Mostrar todas
          </button>
          <button type="button" (click)="restablecer()" [disabled]="esPredeterminado()"
            class="text-xs font-semibold text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-default">
            Restablecer
          </button>
        </div>
      </div>
    }
  `,
})
export class TableToolbarComponent implements OnDestroy {
  // ── Inputs ─────────────────────────────────────────────────────────────────
  filter       = input.required<string>();
  total        = input.required<number>();
  rowsPerPage  = input.required<number>();
  visibleCols  = input.required<Set<string>>();

  // ── Outputs ────────────────────────────────────────────────────────────────
  filterChange      = output<string>();
  rowsPerPageChange = output<number>();
  toggleCol         = output<string>();

  // ── Internos ───────────────────────────────────────────────────────────────
  /** "Acciones" siempre se muestra: no aparece en el selector. */
  readonly seleccionables = COLUMNS.filter((c) => c.uid !== 'actions');
  readonly pos = signal<PanelFijo | null>(null);

  readonly visibles = computed(() => this.seleccionables.filter((c) => this.visibleCols().has(c.uid)).length);
  readonly ocultas = computed(() => this.seleccionables.length - this.visibles());
  readonly esPredeterminado = computed(() =>
    this.seleccionables.every((c) => this.visibleCols().has(c.uid) === INITIAL_VISIBLE_COLS.has(c.uid)),
  );

  private readonly cerrarFn = () => this.cerrar();
  private readonly alDesplazar = (e: Event) => { if (!fueDentroDelPanel(e)) this.cerrar(); };

  alternar(boton: HTMLElement): void {
    if (this.pos()) { this.cerrar(); return; }
    this.pos.set(calcularPanelFijo(boton, {
      ancho: 260, altoEstimado: 110 + this.seleccionables.length * 38, alinear: 'der',
    }));
    openOverlay(this.cerrarFn);
    window.addEventListener('scroll', this.alDesplazar, true);
    window.addEventListener('resize', this.alDesplazar);
  }

  alternarColumna(uid: string): void {
    // Nunca dejar la tabla sin ninguna columna de datos.
    if (this.visibleCols().has(uid) && this.visibles() === 1) return;
    this.toggleCol.emit(uid);
  }

  mostrarTodas(): void {
    for (const c of this.seleccionables) if (!this.visibleCols().has(c.uid)) this.toggleCol.emit(c.uid);
  }

  /** Vuelve a las columnas por defecto (INITIAL_VISIBLE_COLS) alternando solo las que difieren. */
  restablecer(): void {
    for (const c of this.seleccionables) {
      if (this.visibleCols().has(c.uid) !== INITIAL_VISIBLE_COLS.has(c.uid)) this.toggleCol.emit(c.uid);
    }
  }

  cerrar(): void {
    if (!this.pos()) return;
    this.pos.set(null);
    releaseOverlay(this.cerrarFn);
    window.removeEventListener('scroll', this.alDesplazar, true);
    window.removeEventListener('resize', this.alDesplazar);
  }

  @HostListener('document:keydown.escape')
  alEscape(): void { this.cerrar(); }

  ngOnDestroy(): void { this.cerrar(); }
}
