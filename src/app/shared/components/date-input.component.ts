import {
  Component, Input, forwardRef, OnDestroy,
  HostListener, ElementRef, ChangeDetectorRef,
  signal, computed,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { TuiDay } from '@taiga-ui/cdk';
import { TuiCalendar } from '@taiga-ui/core';
import { openOverlay, releaseOverlay } from './overlay-registry';

/**
 * <app-date-input>  —  Selector de fecha (botón + calendario desplegable)
 *
 * Usage:
 *   <app-date-input placeholder="DD/MM/AAAA" [(ngModel)]="miFecha"></app-date-input>
 *   <app-date-input [formControl]="miControl"></app-date-input>
 *
 * Valor: TuiDay | null (mismo tipo que usa tui-calendar en el resto del proyecto).
 */
@Component({
  selector: 'app-date-input',
  standalone: true,
  imports: [LucideAngularModule, TuiCalendar],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="di-root" [class.di-open]="_open()" [class.di-disabled]="disabled">

      <!-- Trigger button -->
      <button type="button" class="di-trigger" (click)="toggle()" [disabled]="disabled">
        <span class="di-trigger-label" [class.di-placeholder]="!_value()">
          {{ _formatted() || placeholder }}
        </span>
        <lucide-icon name="calendar" [size]="15" class="di-icon"></lucide-icon>
      </button>

      <!-- Panel — position:fixed para no quedar cortado por overflow del modal -->
      @if (_open() && _panelPos()) {
        <div class="di-panel"
             [style.top.px]="_panelPos()!.top"
             [style.bottom.px]="_panelPos()!.bottom"
             [style.left.px]="_panelPos()!.left"
             [style.max-height.px]="_panelPos()!.maxH">
          <tui-calendar
            [value]="_value()"
            [min]="min ?? null"
            [max]="max ?? null"
            (dayClick)="onDayClick($event)"
          />
        </div>
      }
    </div>
  `,
  styles: [`
    .di-root {
      position: relative;
      width: 100%;
      font-size: 14px;
    }

    /* Trigger */
    .di-trigger {
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
    .di-trigger:hover:not(:disabled) {
      border-color: var(--tui-primary);
    }
    .di-open .di-trigger {
      border-color: var(--tui-primary);
      box-shadow: 0 0 0 3px rgba(57, 169, 0, .15);
    }
    .di-disabled .di-trigger {
      opacity: .55;
      cursor: not-allowed;
    }
    .di-trigger-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .di-placeholder {
      color: var(--text-muted);
    }
    .di-icon {
      flex-shrink: 0;
      color: var(--text-muted);
    }

    /* Panel */
    .di-panel {
      position: fixed;
      z-index: 99999;
      background: var(--surface);
      border: 1.5px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 8px 28px rgba(0,0,0,.18);
      padding: 10px;
      max-height: calc(100vh - 16px);
      overflow-y: auto;
      animation: diFadeIn .12s ease-out;
    }
    @keyframes diFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class DateInputComponent implements ControlValueAccessor, OnDestroy {
  @Input() placeholder = 'DD/MM/AAAA';
  @Input() min?: TuiDay | null;
  @Input() max?: TuiDay | null;

  _value    = signal<TuiDay | null>(null);
  _open     = signal(false);

  /** Posición del panel en coordenadas viewport (position:fixed) */
  _panelPos = signal<{ top?: number; bottom?: number; left: number; maxH: number } | null>(null);

  disabled = false;

  _formatted = computed(() => {
    const v = this._value();
    if (!v) return '';
    const d = String(v.day).padStart(2, '0');
    const m = String(v.month + 1).padStart(2, '0');
    return `${d}/${m}/${v.year}`;
  });

  private onChange:  (v: TuiDay | null) => void = () => {};
  private onTouched: () => void                 = () => {};

  constructor(private el: ElementRef, private cdr: ChangeDetectorRef) {}

  toggle(): void {
    if (this.disabled) return;
    if (this._open()) { this.close(); } else { this.openPanel(); }
  }

  /** Alto aproximado del panel del calendario (header + 6 filas de días) */
  private static readonly PANEL_HEIGHT = 320;
  private static readonly PANEL_WIDTH  = 280;

  private readonly closeRef = () => this.close();
  private posRafId: number | null = null;

  private updatePos(): void {
    const btn = this.el.nativeElement.querySelector('.di-trigger') as HTMLElement;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const margin = 8;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;

    // Voltea hacia arriba si no cabe abajo pero sí arriba — evita que el
    // calendario quede cortado por el borde de la ventana (o del modal).
    const openUp = spaceBelow < DateInputComponent.PANEL_HEIGHT
                   && spaceAbove > spaceBelow;

    const left = Math.min(
      Math.max(margin, r.left),
      window.innerWidth - DateInputComponent.PANEL_WIDTH - margin,
    );

    // maxH siempre limitado al espacio REAL disponible en esa dirección —
    // .di-panel ya tiene overflow-y:auto, así que si no cabe entero, scrollea
    // en vez de salirse de la pantalla. Sin este límite, un floor fijo más
    // grande que el espacio real es exactamente lo que causaba el overflow.
    const maxH = Math.max(80, openUp ? spaceAbove : spaceBelow);

    this._panelPos.set(
      openUp
        ? { bottom: window.innerHeight - r.top + 4, left, maxH }
        : { top: r.bottom + 4, left, maxH }
    );
  }

  // Ver comentario equivalente en SearchableSelectComponent.trackPos — el
  // panel es position:fixed y sin esto se "despega" del trigger cuando el
  // layout se mueve (aparece/desaparece otro campo del form, scroll, etc.).
  private trackPos = (): void => {
    if (!this._open()) { this.posRafId = null; return; }
    this.updatePos();
    this.posRafId = requestAnimationFrame(this.trackPos);
  };

  openPanel(): void {
    openOverlay(this.closeRef);
    this.updatePos();
    this._open.set(true);
    if (this.posRafId == null) this.posRafId = requestAnimationFrame(this.trackPos);
  }

  close(): void {
    releaseOverlay(this.closeRef);
    this._open.set(false);
    this._panelPos.set(null);
    this.onTouched();
    if (this.posRafId != null) { cancelAnimationFrame(this.posRafId); this.posRafId = null; }
  }

  ngOnDestroy(): void {
    releaseOverlay(this.closeRef);
    if (this.posRafId != null) cancelAnimationFrame(this.posRafId);
  }

  onDayClick(day: TuiDay): void {
    this._value.set(day);
    this.onChange(day);
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this._open() && !this.el.nativeElement.contains(e.target)) {
      this.close();
    }
  }

  writeValue(v: TuiDay | null): void {
    this._value.set(v ?? null);
    this.cdr.markForCheck();
  }
  registerOnChange(fn: any)    { this.onChange   = fn; }
  registerOnTouched(fn: any)   { this.onTouched  = fn; }
  setDisabledState(d: boolean) { this.disabled   = d;  }
}
