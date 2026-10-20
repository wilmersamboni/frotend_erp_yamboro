import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { OpcionSelect } from '../services/admin.service';
import { CoordenadasMapComponent } from '../components/coordenadas-map.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select.component';
import { DateInputComponent } from '../../../shared/components/date-input.component';
import { TuiDay } from '@taiga-ui/cdk';
import { TuiDayCache } from '../../../shared/utils/tui-day.util';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { ACCEPT_DOCUMENTOS, ACCEPT_FOTOS, problemaDocumento, problemaFoto } from '../../../shared/utils/archivos-permitidos';
import { hoyIsoLocal } from '../../../core/utils/horarios.util';

/**
 * Modal genérico para crear/editar registros.
 * - Campos con `opciones`  → <app-ss> (select con buscador incorporado; sirve
 *                            igual para listas cortas y largas)
 * - Resto                  → <input> con el tipo correcto (date, number, email, text)
 */
@Component({
  selector: 'app-admin-modal',
  standalone: true,
  imports: [DialogDirective, FormsModule, CoordenadasMapComponent, SearchableSelectComponent, DateInputComponent],
  template: `
    @if (open) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
           (click)="onBackdropClick($event)">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">

          <!-- Header -->
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">
              {{ editando ? 'Editar ' + labelSingular : 'Nuevo ' + labelSingular }}
            </h2>
            <button aria-label="Cerrar" (click)="closed.emit()"
              class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <!-- Campos -->
          <div class="space-y-3">
            @for (col of columns; track col) {
              <!-- El campo lng de un par de coordenadas se absorbe en el
                   widget de mapa del campo lat — no lleva fila propia. -->
              @if (!parCoordenadas || col !== parCoordenadas.lng) {
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">
                  {{ parCoordenadas && col === parCoordenadas.lat ? 'Ubicación' : (columnLabels[col] || formatLabel(col)) }}
                </label>

                @if (parCoordenadas && col === parCoordenadas.lat) {
                  <!-- MAPA: selector de ubicación (lat + lng juntos). Dentro de
                       @defer: leaflet (~150 kB) solo se descarga cuando un
                       formulario realmente muestra el mapa — este modal lo usan
                       muchas pantallas que nunca piden coordenadas. -->
                  @defer (on immediate) {
                    <app-coordenadas-map
                      [lat]="form[parCoordenadas.lat]"
                      [lng]="form[parCoordenadas.lng]"
                      (latChange)="form[parCoordenadas!.lat] = $event"
                      (lngChange)="form[parCoordenadas!.lng] = $event" />
                  } @placeholder {
                    <div class="w-full h-56 rounded-lg border border-gray-200 bg-gray-50 animate-pulse" aria-hidden="true"></div>
                  }

                } @else if (opciones[col]?.length) {
                  <!-- SELECT con búsqueda incorporada (app-ss). Sirve igual para
                       listas cortas y largas — el propio dropdown filtra por
                       texto, así que no hace falta un autocomplete aparte. -->
                  <app-ss [options]="opciones[col]" placeholder="— Selecciona —"
                          [ngModel]="form[col]"
                          (ngModelChange)="form[col] = $event; fieldChange.emit({ col, value: $event })"></app-ss>

                } @else if (archivos[col]) {
                  <!-- ARCHIVO: se sube al elegirlo; el campo guarda lo que devuelve el servidor -->
                  <div class="flex flex-wrap items-center gap-2">
                    <label class="px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50"
                           [class.opacity-60]="subiendo()[col]">
                      {{ subiendo()[col] ? 'Subiendo…' : (form[col] ? 'Cambiar archivo' : (archivos[col].tipo === 'foto' ? 'Elegir imagen' : 'Elegir documento')) }}
                      <input type="file" class="hidden" [disabled]="subiendo()[col]"
                             [attr.accept]="archivos[col].tipo === 'foto' ? aceptarFotos : aceptarDocumentos"
                             (change)="elegirArchivo(col, $event)" />
                    </label>
                    @if (form[col]) {
                      <span class="text-xs text-gray-500 break-all">{{ nombreArchivo(form[col]) }}</span>
                      <button type="button" class="text-xs text-red-600 hover:underline" (click)="form[col] = ''">Quitar</button>
                    } @else {
                      <span class="text-xs text-gray-400">Ningún archivo seleccionado</span>
                    }
                  </div>
                  @if (errorArchivo()[col]) {
                    <p class="text-xs text-red-600 mt-1">{{ errorArchivo()[col] }}</p>
                  }

                } @else if (opciones[col]) {
                  <!-- Selector sin datos todavía (p. ej. aún no hay etapas): no se ofrece un cuadro libre
                       para escribir un UUID a mano. -->
                  <p class="px-3 py-2 border border-dashed border-gray-200 rounded-lg text-sm text-gray-400">
                    No hay opciones disponibles todavía.
                  </p>

                } @else if (tiposCampo[col] === 'date') {
                  <!-- FECHA: calendario -->
                  <app-date-input
                    [ngModel]="dateValue(col)"
                    (ngModelChange)="setDateValue(col, $event)"
                    [min]="minParaFecha(col)"
                    [clearable]="fechasLimpiables.includes(col)"></app-date-input>

                } @else if (tiposCampo[col] === 'tel') {
                  <!-- TELÉFONO: solo dígitos y un "+" inicial (ej. +573212327xx) -->
                  <input
                    type="tel"
                    inputmode="tel"
                    [ngModel]="form[col]"
                    (ngModelChange)="form[col] = sanitizeTelefono($event)"
                    [name]="col"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />

                } @else if (tiposCampo[col] === 'boolean') {
                  <!-- SWITCH: campo booleano — checkbox real oculto (sr-only) +
                       track/thumb pintados con peer-checked, el [type] dinámico
                       de abajo no enlaza [checked] correctamente para checkboxes.
                       El thumb es el ::after del track (no un <span> anidado
                       aparte): peer-checked usa el combinador "~" de hermanos,
                       así que solo alcanza a un elemento que sea hermano directo
                       del input — un <span> anidado DENTRO del track no calificaba
                       y por eso el círculo no se movía (el fondo sí, porque ese
                       cambio de color estaba en el propio track, el hermano real). -->
                  <label class="inline-flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox"
                      [(ngModel)]="form[col]"
                      [name]="col"
                      class="sr-only peer" />
                    <span class="relative w-10 h-6 rounded-full bg-gray-200 peer-checked:bg-[#39A900] transition-colors
                      after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5
                      after:rounded-full after:bg-white after:shadow after:transition-transform
                      peer-checked:after:translate-x-4"></span>
                    <span class="text-sm text-gray-700">{{ form[col] ? 'Sí' : 'No' }}</span>
                  </label>

                } @else {
                  <!-- INPUT normal -->
                  <input
                    [type]="tiposCampo[col] || 'text'"
                    [(ngModel)]="form[col]"
                    [name]="col"
                    [placeholder]="placeholders[col] || ''"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                }
              </div>
              }
            }
          </div>

          <!-- Contenido extra que el padre quiera colocar bajo los campos (ej. el
               escáner de placa en Novedades). Sin contenido proyectado no ocupa nada. -->
          <ng-content select="[campoExtra]" />

          <!-- Error -->
          @if (error) {
            <p class="text-red-500 text-xs mt-3 p-2 bg-red-50 rounded-lg">{{ error }}</p>
          }

          <!-- Footer -->
          <div class="flex justify-end gap-2 mt-6">
            <button (click)="closed.emit()"
              class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Cancelar
            </button>
            <button (click)="saved.emit(form)" [disabled]="saving"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg
                     disabled:opacity-60 transition-colors"
              style="background-color: var(--accent-brand)">
              {{ saving ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    }

    <style>
      div { scrollbar-width: none; -ms-overflow-style: none; }
      div::-webkit-scrollbar { display: none; }
    </style>
  `,
})
export class AdminModalComponent {
  @Input() open          = false;
  @Input() editando:     any    = null;
  @Input() labelSingular = 'registro';
  @Input() columns:      string[] = [];
  @Input() form:         Record<string, any> = {};
  @Input() opciones:     Record<string, OpcionSelect[]> = {};
  @Input() tiposCampo:   Record<string, string> = {};
  @Input() saving        = false;
  @Input() error:        string | null = null;
  @Input() parCoordenadas?: { lat: string; lng: string };

  /** Etiqueta legible opcional por campo — si falta, se calcula con formatLabel(col). */
  @Input() columnLabels: Record<string, string> = {};

  /** Para un campo de fecha, el nombre de otro campo cuyo valor es la fecha mínima seleccionable. */
  @Input() minDateFields: Record<string, string> = {};

  /** Campos de fecha que no pueden quedar en el pasado (ej. `fecha_vencimiento` de un lote). */
  @Input() minDateToday: string[] = [];
  /** Campos de fecha opcionales: muestran un "×" para vaciarlos. */
  @Input() fechasLimpiables: string[] = [];

  /**
   * Placeholder de ejemplo opcional por campo, para el `<input>` normal
   * (Ronda 6). Los `<select>` (`app-ss`) no lo necesitan.
   */
  @Input() placeholders: Record<string, string> = {};

  /** Campos que se llenan subiendo un archivo (ver `ModuloConfig.archivos`). */
  @Input() archivos: Record<string, { endpoint: string; clave: string; tipo: 'documento' | 'foto' }> = {};

  private readonly http = inject(HttpClient);
  readonly aceptarDocumentos = ACCEPT_DOCUMENTOS;
  readonly aceptarFotos = ACCEPT_FOTOS;
  subiendo = signal<Record<string, boolean>>({});
  errorArchivo = signal<Record<string, string>>({});

  nombreArchivo(valor: string): string {
    return String(valor).split('/').pop() ?? String(valor);
  }

  async elegirArchivo(col: string, ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const cfg = this.archivos[col];
    if (!file || !cfg) return;

    const problema = cfg.tipo === 'foto' ? problemaFoto(file) : problemaDocumento(file);
    this.errorArchivo.update((e) => ({ ...e, [col]: problema ?? '' }));
    if (problema) return;

    this.subiendo.update((s) => ({ ...s, [col]: true }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      const resp: any = await firstValueFrom(this.http.post(cfg.endpoint, fd));
      const valor = resp?.[cfg.clave];
      if (!valor) throw new Error('El servidor no devolvió el archivo');
      this.form[col] = valor;
    } catch (e: any) {
      const msg = e?.error?.message;
      this.errorArchivo.update((er) => ({
        ...er,
        [col]: (Array.isArray(msg) ? msg.join(' ') : msg) || 'No se pudo subir el archivo. Intenta de nuevo.',
      }));
    } finally {
      this.subiendo.update((s) => ({ ...s, [col]: false }));
    }
  }

  /**
   * @deprecated Ya no hace nada — todos los campos con `opciones` usan
   * `<app-ss>` (select con buscador), sin importar cuántas opciones tengan.
   * Se mantiene el Input para no romper a los que todavía lo pasan.
   */
  @Input() forzarSelect: string[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() saved  = new EventEmitter<Record<string, any>>();

  /**
   * Se emite cuando cambia un campo tipo <select> (app-ss). Lo usa el padre
   * para reaccionar a un campo — ej. lotes precarga el sitio del producto
   * elegido. Los <input> normales no lo emiten (no hace falta hasta hoy).
   */
  @Output() fieldChange = new EventEmitter<{ col: string; value: any }>();

  // ── Helper de teléfono: solo dígitos, con un único "+" opcional al inicio ──
  sanitizeTelefono(valor: string): string {
    let limpio = (valor ?? '').replace(/[^\d+]/g, '');
    const conPrefijo = limpio.startsWith('+');
    limpio = limpio.replace(/\+/g, '');
    return conPrefijo ? '+' + limpio : limpio;
  }

  onBackdropClick(_e: MouseEvent): void {
    /* el backdrop cierra el modal desde el componente padre (output closed) */
  }

  // ── Helpers de fecha (form[col] guarda 'yyyy-MM-dd', igual que <input type="date">) ──
  // Cacheado por string ISO: sin cachear, cada llamada devolvía un TuiDay NUEVO
  // para la misma fecha lógica y <app-date-input> lo trataba como un cambio
  // real, reemitiendo (ngModelChange) y disparando un loop infinito de CD que
  // congelaba la pestaña (mismo bug ya corregido en programador-eventos.component.ts).
  private readonly dateValCache = new Map<string, TuiDay>();

  dateValue(col: string): TuiDay | null {
    const iso = this.form[col];
    if (!iso) return null;
    const key = String(iso).substring(0, 10);
    const parts = key.split('-');
    if (parts.length !== 3) return null;
    let day = this.dateValCache.get(key);
    if (!day) {
      day = new TuiDay(+parts[0], +parts[1] - 1, +parts[2]);
      this.dateValCache.set(key, day);
    }
    return day;
  }

  setDateValue(col: string, day: TuiDay | null): void {
    if (!day) { this.form[col] = ''; return; }
    const m = String(day.month + 1).padStart(2, '0');
    const d = String(day.day).padStart(2, '0');
    this.form[col] = `${day.year}-${m}-${d}`;
  }

  /**
   * Mínimo seleccionable para un campo de fecha: combina `minDateFields`
   * (otro campo del mismo form) y `minDateToday` (no puede ser pasado) — si
   * aplican los dos, gana el más restrictivo (el más tarde de los dos).
   */
  minParaFecha(col: string): TuiDay | null {
    const candidatosIso: string[] = [];
    const otroCampo = this.minDateFields[col];
    if (otroCampo && this.form[otroCampo]) {
      candidatosIso.push(String(this.form[otroCampo]).slice(0, 10));
    }
    if (this.minDateToday.includes(col)) {
      candidatosIso.push(hoyIsoLocal());
    }
    if (candidatosIso.length === 0) return null;
    const maxIso = candidatosIso.reduce((a, b) => (a > b ? a : b));
    return TuiDayCache.fromIso(maxIso);
  }

  // ── Formato de etiquetas ──────────────────────────────────────
  formatLabel(col: string): string {
    return col
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/\s*Id\s*$/i, '')
      .trim()
      .toLowerCase()
      .replace(/^\w/, c => c.toUpperCase());
  }
}
