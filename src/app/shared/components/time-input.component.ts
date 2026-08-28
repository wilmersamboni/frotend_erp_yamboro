import {
  Component, Input, forwardRef, OnDestroy,
  HostListener, ElementRef, ChangeDetectorRef, signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { openOverlay, releaseOverlay } from './overlay-registry';

const OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
})();

/**
 * <app-time-input>  —  Campo de hora: texto enmascarado "HH:mm" + panel
 * desplegable con horas cada 15 min para elegir con un clic.
 *
 * Usage:
 *   <app-time-input [(ngModel)]="miHora"></app-time-input>
 *   <app-time-input [formControl]="miControl"></app-time-input>
 *
 * Valor: string 'HH:mm' | ''  (mismo formato que <input type="time">).
 * No usa el selector nativo del navegador (evita el popup oscuro sin estilo).
 */
@Component({
  selector: 'app-time-input',
  standalone: true,
  imports: [LucideAngularModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimeInputComponent),
      multi: true,
    },
  ],
  template: `
    <div class="ti-root" [class.ti-open]="_open()" [class.ti-disabled]="disabled">
      <input
        #inp
        type="text"
        class="ti-input"
        inputmode="numeric"
        autocomplete="off"
        [placeholder]="placeholder"
        [disabled]="disabled"
        [value]="_display()"
        (input)="onInput($any($event.target).value)"
        (focus)="openPanel()"
        (blur)="onBlur()"
      />
      <button type="button" class="ti-icon-btn" tabindex="-1" [disabled]="disabled" (mousedown)="$event.preventDefault()" (click)="toggle()">
        <lucide-icon name="clock" [size]="15" class="ti-icon"></lucide-icon>
      </button>

      @if (_open() && _panelPos()) {
        <div class="ti-panel"
             [style.top.px]="_panelPos()!.top"
             [style.bottom.px]="_panelPos()!.bottom"
             [style.left.px]="_panelPos()!.left"
             [style.width.px]="_panelPos()!.width">
          <ul class="ti-list" [style.max-height.px]="_panelPos()!.maxH">
            @for (t of _options; track t) {
              <li class="ti-option" [class.ti-selected]="t === _value()"
                  (mousedown)="$event.preventDefault(); select(t)">{{ t }}</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: [`
    .ti-root {
      position: relative;
      width: 100%;
      font-size: 14px;
    }
    .ti-input {
      width: 100%;
      padding: 10px 34px 10px 12px;
      border-radius: 8px;
      border: 1.5px solid var(--border);
      background: var(--surface2);
      color: var(--text);
      font-size: 14px;
      outline: none;
      transition: border-color .15s, box-shadow .15s;
      box-sizing: border-box;
    }
    .ti-input::placeholder { color: var(--text-muted); }
    .ti-root:hover .ti-input:not(:disabled) { border-color: var(--tui-primary); }
    .ti-open .ti-input {
      border-color: var(--tui-primary);
      box-shadow: 0 0 0 3px rgba(57, 169, 0, .15);
    }
    .ti-input:disabled { opacity: .55; cursor: not-allowed; }
    .ti-icon-btn {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
    }
    .ti-icon { color: var(--text-muted); }
    .ti-disabled { opacity: .55; }

    .ti-panel {
      position: fixed;
      z-index: 99999;
      background: var(--surface);
      border: 1.5px solid var(--tui-primary);
      border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.18);
      overflow: hidden;
      animation: tiFadeIn .12s ease-out;
    }
    @keyframes tiFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .ti-list {
      max-height: 220px;
      overflow-y: auto;
      margin: 0;
      padding: 4px 0;
      list-style: none;
    }
    .ti-list::-webkit-scrollbar { width: 5px; }
    .ti-list::-webkit-scrollbar-thumb { background: var(--gray-300); border-radius: 3px; }
    .ti-option {
      padding: 7px 14px;
      font-size: 13px;
      cursor: pointer;
      color: var(--text);
    }
    .ti-option:hover { background: rgba(57,169,0,.1); color: #2d8500; }
    .ti-option.ti-selected { background: var(--tui-primary); color: #fff; font-weight: 600; }
  `],
})
export class TimeInputComponent implements ControlValueAccessor, OnDestroy {
  @Input() placeholder = '--:--';

  _options = OPTIONS;

  _value   = signal('');
  _display = signal('');
  _open    = signal(false);
  _panelPos = signal<{ top?: number; bottom?: number; left: number; width: number; maxH: number } | null>(null);

  disabled = false;

  private onChange:  (v: string) => void = () => {};
  private onTouched: () => void          = () => {};

  constructor(private el: ElementRef, private cdr: ChangeDetectorRef) {}

  toggle(): void {
    if (this.disabled) return;
    if (this._open()) { this.close(); } else { this.openPanel(); }
  }

  private readonly closeRef = () => this.close();
  private posRafId: number | null = null;

  private updatePos(): void {
    const root = this.el.nativeElement.querySelector('.ti-root') as HTMLElement;
    if (!root) return;
    const r = root.getBoundingClientRect();
    const margin = 8;
    const panelHeight = 228;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUp = spaceBelow < panelHeight && spaceAbove > spaceBelow;

    // maxH limitado al espacio real disponible — evita que la lista se salga
    // de la pantalla (ver mismo comentario en DateInputComponent.updatePos).
    const maxH = Math.max(80, Math.min(220, openUp ? spaceAbove : spaceBelow));

    this._panelPos.set(
      openUp
        ? { bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width, maxH }
        : { top: r.bottom + 4, left: r.left, width: r.width, maxH }
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
    if (this.disabled || this._open()) return;
    openOverlay(this.closeRef);
    this._display.set(this._value());
    this.updatePos();
    this._open.set(true);
    if (this.posRafId == null) this.posRafId = requestAnimationFrame(this.trackPos);

    setTimeout(() => {
      const el = this.el.nativeElement.querySelector('.ti-selected') as HTMLElement;
      el?.scrollIntoView({ block: 'center' });
    }, 0);
  }

  close(): void {
    releaseOverlay(this.closeRef);
    this._open.set(false);
    this._panelPos.set(null);
    if (this.posRafId != null) { cancelAnimationFrame(this.posRafId); this.posRafId = null; }
  }

  ngOnDestroy(): void {
    releaseOverlay(this.closeRef);
    if (this.posRafId != null) cancelAnimationFrame(this.posRafId);
  }

  select(t: string): void {
    this.commit(t);
    this.close();
  }

  onInput(raw: string): void {
    // Solo dígitos, máximo 4 (HHmm), auto-inserta ":" tras las primeras 2 cifras
    let digits = raw.replace(/\D/g, '').slice(0, 4);
    let formatted = digits;
    if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    }
    this._display.set(formatted);

    if (digits.length === 4) {
      this.commit(formatted);
    }
  }

  onBlur(): void {
    const val = this._display();
    if (val && /^\d{1,2}:\d{2}$/.test(val)) {
      this.commit(val);
    } else if (!val) {
      this.commit('');
    } else {
      // Entrada incompleta/inválida al salir del campo — descartar y volver al valor previo
      this._display.set(this._value());
    }
    this.onTouched();
  }

  private commit(val: string): void {
    if (!val) {
      this._value.set('');
      this._display.set('');
      this.onChange('');
      return;
    }
    const [hRaw, mRaw] = val.split(':');
    const h = Math.min(23, Math.max(0, parseInt(hRaw, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(mRaw ?? '0', 10) || 0));
    const normalized = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    this._value.set(normalized);
    this._display.set(normalized);
    this.onChange(normalized);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this._open() && !this.el.nativeElement.contains(e.target)) {
      this.close();
    }
  }

  writeValue(v: string | null): void {
    const val = v ?? '';
    this._value.set(val);
    if (!this._open()) this._display.set(val);
    this.cdr.markForCheck();
  }
  registerOnChange(fn: any)    { this.onChange   = fn; }
  registerOnTouched(fn: any)   { this.onTouched  = fn; }
  setDisabledState(d: boolean) { this.disabled   = d;  }
}
