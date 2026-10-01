import { Component, ElementRef, OnDestroy, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';
import { openOverlay, releaseOverlay } from './overlay-registry';

export interface TableFilterOption {
  value: string;
  label: string;
}

/**
 * Filtro tipo "chip" de las tablas (Estado, Origen, Destino…).
 *
 * El menú se dibuja con position:fixed y una capa muy alta, calculado desde el chip. Antes vivía
 * dentro del chip con z-20, la misma capa que el texto del chip siguiente: cuando los filtros
 * quedaban apilados (móvil), el texto del filtro de abajo se pintaba encima del menú abierto.
 * Así además no lo recorta ningún contenedor con overflow.
 */
@Component({
  selector: 'app-table-filter',
  standalone: true,
  template: `
    <div class="relative flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200">
      <button type="button" (click)="toggle()" [attr.aria-label]="label + ': ' + selectedLabel" [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        class="absolute inset-0 z-0 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#39A900]/30"></button>
      <span class="pointer-events-none relative z-10 text-xs font-semibold text-gray-500 uppercase tracking-wide">{{ label }}</span>
      <span class="relative z-10 pointer-events-none flex items-center gap-1.5 text-sm font-semibold text-gray-700 min-w-0">
        <span class="truncate">{{ selectedLabel }}</span>
        <svg class="w-3.5 h-3.5 flex-shrink-0 text-gray-400 transition-transform duration-200" [class.rotate-180]="open()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </span>
    </div>

    @if (open() && pos(); as p) {
      <div class="fixed inset-0 z-[99998]" (click)="cerrar()"></div>
      <div role="listbox" [attr.aria-label]="label"
           class="fixed z-[99999] rounded-xl border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
           style="background-color: var(--surface); border-color: var(--border);"
           [style.top.px]="p.top" [style.bottom.px]="p.bottom" [style.left.px]="p.left"
           [style.min-width.px]="p.ancho" [style.max-width.px]="p.anchoMax">
        <div class="p-1 space-y-0.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" [style.max-height.px]="p.altoMax">
          @for (option of options; track option.value) {
            <button type="button" role="option" [attr.aria-selected]="value === option.value" (click)="select(option.value)"
              class="w-full px-3 py-2 text-sm text-left rounded-lg transition-colors font-medium"
              [class.bg-green-50]="value === option.value"
              [class.text-green-700]="value === option.value"
              [class.text-gray-600]="value !== option.value"
              [class.hover:bg-gray-50]="value !== option.value">
              {{ option.label }}
            </button>
          }
        </div>
      </div>
    }
  `,
})
export class TableFilterComponent implements OnDestroy {
  @Input({ required: true }) options: TableFilterOption[] = [];
  @Input() value = '';
  @Input() label = 'Filtro';
  @Output() valueChange = new EventEmitter<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  open = signal(false);
  pos = signal<{ top?: number; bottom?: number; left: number; ancho: number; anchoMax: number; altoMax: number } | null>(null);
  private readonly closeRef = () => this.cerrar();
  /** En captura: la página se desplaza dentro de <main>, no en la ventana. El propio menú sí puede desplazarse. */
  private readonly alDesplazar = (e: Event) => {
    const t = e.target as Node | null;
    if (t instanceof Element && t.closest('[role="listbox"]')) return;
    this.cerrar();
  };

  get selectedLabel(): string {
    return this.options.find((option) => option.value === this.value)?.label ?? this.value;
  }

  select(value: string): void {
    this.valueChange.emit(value);
    this.cerrar();
  }

  toggle(): void {
    if (this.open()) this.cerrar();
    else {
      openOverlay(this.closeRef);
      this.calcularPosicion();
      this.open.set(true);
      window.addEventListener('scroll', this.alDesplazar, true);
    }
  }

  cerrar(): void {
    this.open.set(false);
    this.pos.set(null);
    window.removeEventListener('scroll', this.alDesplazar, true);
    releaseOverlay(this.closeRef);
  }

  /** Abre hacia abajo; si no cabe, hacia arriba. Nunca se sale por los lados de la pantalla. */
  private calcularPosicion(): void {
    const r = this.host.nativeElement.firstElementChild!.getBoundingClientRect();
    const margen = 8;
    const vw = window.innerWidth, vh = window.innerHeight;
    const abajo = vh - r.bottom - margen, arriba = r.top - margen;
    const anchoMax = Math.min(320, vw - 2 * margen);
    const ancho = Math.min(Math.max(r.width, 176), anchoMax);
    const left = Math.max(margen, Math.min(r.left, vw - ancho - margen));
    if (abajo >= 200 || abajo >= arriba) {
      this.pos.set({ top: r.bottom + 6, left, ancho, anchoMax, altoMax: Math.min(256, abajo - 6) });
    } else {
      this.pos.set({ bottom: vh - r.top + 6, left, ancho, anchoMax, altoMax: Math.min(256, arriba - 6) });
    }
  }

  // El menú es fixed: si la pantalla cambia de tamaño se cierra, en vez de quedar flotando fuera de su chip.
  @HostListener('window:resize')
  alMoverse(): void { if (this.open()) this.cerrar(); }

  @HostListener('document:keydown.escape')
  alEscape(): void { if (this.open()) this.cerrar(); }

  ngOnDestroy(): void { if (this.open()) this.cerrar(); }
}
