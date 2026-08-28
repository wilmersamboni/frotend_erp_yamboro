import {
  Component, Input, OnChanges, OnDestroy, SimpleChanges,
  forwardRef, HostListener, ElementRef, ChangeDetectorRef,
  signal, computed,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { openOverlay, releaseOverlay } from './overlay-registry';

export interface SSOption {
  value: any;
  label: string;
  disabled?: boolean;
}

/**
 * <app-ss>  —  Searchable Select (dropdown with live search)
 *
 * Usage:
 *   <app-ss [options]="opts" placeholder="Seleccionar..." [(ngModel)]="myValue"></app-ss>
 *
 * options: SSOption[]  →  { value: any, label: string, disabled?: boolean }
 *
 * Portado tal cual desde ChronoGest (src/app/shared/components/searchable-select.component.ts).
 */
@Component({
  selector: 'app-ss',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchableSelectComponent),
      multi: true,
    },
  ],
  template: `
    <div class="ss-root" [class.ss-open]="_open()" [class.ss-disabled]="disabled">

      <!-- Trigger button -->
      <button type="button" class="ss-trigger" (click)="toggle()" [disabled]="disabled">
        <span class="ss-trigger-label" [class.ss-placeholder]="!_selectedLabel()">
          {{ _selectedLabel() || placeholder }}
        </span>
        <lucide-icon name="chevron-down" [size]="14" class="ss-chevron"></lucide-icon>
      </button>

      <!-- Dropdown panel — renderizado en position:fixed para no quedar cortado por overflow del modal -->
      @if (_open() && _panelPos()) {
      <div class="ss-panel"
           [style.top.px]="_panelPos()!.top"
           [style.bottom.px]="_panelPos()!.bottom"
           [style.left.px]="_panelPos()!.left"
           [style.width.px]="_panelPos()!.width">
        <!-- Search -->
        <div class="ss-search-wrap">
          <lucide-icon name="search" [size]="13" class="ss-search-icon"></lucide-icon>
          <input
            class="ss-search-input"
            [ngModel]="_query()"
            (ngModelChange)="_query.set($event)"
            placeholder="Buscar..."
            (keydown.escape)="close()"
            autocomplete="off">
        </div>

        <!-- Options list -->
        <ul class="ss-list" role="listbox" [style.max-height.px]="_panelPos()!.maxH">
          @if (_filteredOptions().length === 0) {
            <li class="ss-empty">Sin resultados</li>
          }
          @for (opt of _filteredOptions(); track opt.value) {
            <li class="ss-option"
                [class.ss-selected]="opt.value === _value()"
                [class.ss-opt-disabled]="opt.disabled"
                (mousedown)="$event.preventDefault(); !opt.disabled && select(opt)"
                role="option"
                [attr.aria-selected]="opt.value === _value()"
                [attr.aria-disabled]="opt.disabled">
              @if (opt.value === _value()) {
                <lucide-icon name="check" [size]="12" class="ss-check-icon"></lucide-icon>
              } @else {
                <span style="display:inline-block;width:16px;flex-shrink:0;"></span>
              }
              <span>{{ opt.label }}</span>
              @if (opt.disabled) {
                <span class="ss-opt-tag">Ocupado</span>
              }
            </li>
          }
        </ul>
      </div>
      }
    </div>
  `,
  styles: [`
    .ss-root {
      position: relative;
      width: 100%;
      font-size: 14px;
    }

    /* Trigger */
    .ss-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1.5px solid var(--border);
      background: var(--surface2);
      color: var(--text);
      cursor: pointer;
      text-align: left;
      font-size: 14px;
      transition: border-color .15s, box-shadow .15s;
      gap: 8px;
    }
    .ss-trigger:hover:not(:disabled) {
      border-color: var(--blue);
    }
    .ss-open .ss-trigger {
      border-color: var(--blue);
      box-shadow: 0 0 0 3px rgba(37,99,235,.12);
    }
    .ss-disabled .ss-trigger {
      opacity: .55;
      cursor: not-allowed;
    }
    .ss-trigger-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ss-placeholder {
      color: var(--text-muted);
    }
    .ss-chevron {
      flex-shrink: 0;
      color: var(--text-muted);
      transition: transform .2s;
    }
    .ss-open .ss-chevron {
      transform: rotate(180deg);
    }

    /* Panel — position:fixed para que no quede cortado por overflow del modal */
    .ss-panel {
      position: fixed;
      z-index: 99999;
      background: var(--surface);
      border: 1.5px solid var(--blue);
      border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.18);
      overflow: hidden;
      animation: ssFadeIn .12s ease-out;
    }
    @keyframes ssFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* Search */
    .ss-search-wrap {
      position: relative;
      padding: 8px;
      border-bottom: 1px solid var(--border);
    }
    .ss-search-icon {
      position: absolute;
      left: 18px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      pointer-events: none;
    }
    .ss-search-input {
      width: 100%;
      padding: 7px 10px 7px 30px;
      border-radius: 6px;
      border: 1.5px solid var(--border);
      background: var(--surface2);
      color: var(--text);
      font-size: 13px;
      outline: none;
      transition: border-color .15s;
    }
    .ss-search-input:focus {
      border-color: var(--blue);
    }

    /* List */
    .ss-list {
      max-height: 220px;
      overflow-y: auto;
      padding: 4px 0;
      margin: 0;
      list-style: none;
    }
    .ss-list::-webkit-scrollbar { width: 5px; }
    .ss-list::-webkit-scrollbar-thumb { background: var(--gray-300); border-radius: 3px; }

    .ss-option {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 9px 14px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text);
      transition: background .1s;
    }
    .ss-option:hover:not(.ss-opt-disabled) {
      background: #eff6ff;
      color: var(--blue);
    }
    .ss-option.ss-selected {
      background: #eff6ff;
      color: var(--blue);
      font-weight: 600;
    }
    .ss-check-icon {
      color: var(--blue);
      flex-shrink: 0;
    }
    .ss-opt-disabled {
      opacity: .5;
      cursor: not-allowed;
    }
    .ss-opt-tag {
      margin-left: auto;
      font-size: 10px;
      background: #fee2e2;
      color: #991b1b;
      border-radius: 10px;
      padding: 1px 7px;
      font-weight: 600;
      white-space: nowrap;
    }

    .ss-empty {
      padding: 14px;
      text-align: center;
      color: var(--text-muted);
      font-size: 12px;
    }
  `],
})
export class SearchableSelectComponent implements ControlValueAccessor, OnChanges, OnDestroy {
  // ── Inputs ────────────────────────────────────────────────────────
  @Input() set options(v: SSOption[]) { this._options.set(v ?? []); }
  @Input() placeholder = 'Seleccionar...';

  // ── Internal signals (all reactive) ──────────────────────────────
  _options  = signal<SSOption[]>([]);
  _query    = signal('');
  _value    = signal<any>(null);
  _open     = signal(false);

  /** Posición del panel en coordenadas viewport (position:fixed) */
  _panelPos = signal<{ top?: number; bottom?: number; left: number; width: number; maxH: number } | null>(null);

  disabled = false;

  // ── Derived state ─────────────────────────────────────────────────
  _filteredOptions = computed(() => {
    const q = this._query().trim().toLowerCase();
    const opts = this._options();
    if (!q) return opts;
    return opts.filter(o => o.label.toLowerCase().includes(q));
  });

  _selectedLabel = computed(() => {
    // Usar == en lugar de === para mitigar desajustes string vs number
    const found = this._options().find(o => o.value == this._value());
    return found ? found.label : '';
  });

  // ── CVA callbacks ─────────────────────────────────────────────────
  private onChange:   (v: any) => void = () => {};
  private onTouched:  () => void       = () => {};

  constructor(private el: ElementRef, private cdr: ChangeDetectorRef) {}

  ngOnChanges(_: SimpleChanges) { /* options setter handles it */ }

  // ── Panel control ─────────────────────────────────────────────────
  toggle() {
    if (this.disabled) return;
    if (this._open()) { this.close(); } else { this.openPanel(); }
  }

  private readonly closeRef = () => this.close();
  private posRafId: number | null = null;

  /** Voltea hacia arriba si no cabe bien abajo pero sí hay más espacio arriba;
   *  la altura de la lista se limita SIEMPRE al espacio real disponible en esa
   *  dirección, para que el panel nunca se salga de la pantalla. */
  private updatePos(): void {
    const btn = this.el.nativeElement.querySelector('.ss-trigger') as HTMLElement;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const margin       = 8;
    const searchWrapH  = 52; // alto aprox de la barra de búsqueda
    const spaceBelow   = window.innerHeight - r.bottom - margin;
    const spaceAbove   = r.top - margin;
    const openUp       = spaceBelow < 160 && spaceAbove > spaceBelow;

    const avail = Math.max(0, (openUp ? spaceAbove : spaceBelow) - searchWrapH);
    const listH = Math.max(80, Math.min(220, avail));

    this._panelPos.set({
      top:    openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      left:   r.left,
      width:  r.width,
      maxH:   listH,
    });
  }

  // El panel es position:fixed calculado desde el trigger — si el layout se
  // mueve mientras está abierto (aparece/desaparece otro campo del form,
  // scroll, resize) sin esto el panel se queda "pegado" a coordenadas viejas
  // en vez de seguir al trigger. Se recalcula cada frame solo mientras está abierto.
  private trackPos = (): void => {
    if (!this._open()) { this.posRafId = null; return; }
    this.updatePos();
    this.posRafId = requestAnimationFrame(this.trackPos);
  };

  openPanel() {
    openOverlay(this.closeRef);
    this.updatePos();
    this._query.set('');
    this._open.set(true);
    if (this.posRafId == null) this.posRafId = requestAnimationFrame(this.trackPos);
    // Auto-focus search input after render
    setTimeout(() => {
      const inp = this.el.nativeElement.querySelector('.ss-search-input') as HTMLInputElement;
      inp?.focus();
    }, 40);
  }

  close() {
    releaseOverlay(this.closeRef);
    this._open.set(false);
    this._query.set('');
    this._panelPos.set(null);
    this.onTouched();
    if (this.posRafId != null) { cancelAnimationFrame(this.posRafId); this.posRafId = null; }
  }

  ngOnDestroy() {
    releaseOverlay(this.closeRef);
    if (this.posRafId != null) cancelAnimationFrame(this.posRafId);
  }

  select(opt: SSOption) {
    this._value.set(opt.value);
    this.onChange(opt.value);
    this.close();
  }

  // ── Click-outside ─────────────────────────────────────────────────
  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    if (this._open() && !this.el.nativeElement.contains(e.target)) {
      this.close();
    }
  }

  // ── ControlValueAccessor ──────────────────────────────────────────
  writeValue(v: any) {
    this._value.set(v ?? null);
    this.cdr.markForCheck();
  }
  registerOnChange(fn: any)    { this.onChange   = fn; }
  registerOnTouched(fn: any)   { this.onTouched  = fn; }
  setDisabledState(d: boolean) { this.disabled   = d;  }
}
