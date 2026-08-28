import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OpcionSelect } from '../../features/admin/services/admin.service';
import { CoordenadasMapComponent } from '../../features/admin/components/coordenadas-map.component';
import { SearchableSelectComponent } from './searchable-select.component';
import { DateInputComponent } from './date-input.component';
import { TuiDay } from '@taiga-ui/cdk';

const AUTOCOMPLETE_THRESHOLD = 10; // más de este número → búsqueda en lugar de select

/**
 * Modal genérico para crear/editar registros.
 * - Campos FK con ≤10 opciones  → <select>
 * - Campos FK con >10 opciones  → autocomplete con búsqueda por texto
 * - Resto                       → <input> con el tipo correcto (date, number, email, text)
 */
@Component({
  selector: 'app-admin-modal',
  standalone: true,
  imports: [FormsModule, CoordenadasMapComponent, SearchableSelectComponent, DateInputComponent],
  template: `
    @if (open) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
           (click)="onBackdropClick($event)">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
             (click)="$event.stopPropagation()">

          <!-- Header -->
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-800">
              {{ editando ? 'Editar ' + labelSingular : 'Nuevo ' + labelSingular }}
            </h2>
            <button (click)="closed.emit()"
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
                  {{ parCoordenadas && col === parCoordenadas.lat ? 'Ubicación' : (columnLabels[col] ?? formatLabel(col)) }}
                </label>

                @if (parCoordenadas && col === parCoordenadas.lat) {
                  <!-- MAPA: selector de ubicación (lat + lng juntos) -->
                  <app-coordenadas-map
                    [lat]="form[parCoordenadas.lat]"
                    [lng]="form[parCoordenadas.lng]"
                    (latChange)="form[parCoordenadas!.lat] = $event"
                    (lngChange)="form[parCoordenadas!.lng] = $event" />

                } @else if (esAutocomplete(col)) {
                  <!-- AUTOCOMPLETE: lista grande → búsqueda por texto -->
                  <div class="relative">
                    <input
                      type="text"
                      [value]="getLabelSeleccionado(col)"
                      (input)="onBusqueda(col, $any($event.target).value)"
                      (focus)="abrirLista(col)"
                      [placeholder]="'Buscar ' + (columnLabels[col] ?? formatLabel(col)) + '...'"
                      autocomplete="off"
                      class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />

                    @if (listasAbiertas[col]) {
                      <div class="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        @if (filtradas(col).length === 0) {
                          <p class="px-3 py-2 text-sm text-gray-400">Sin resultados</p>
                        }
                        @for (opt of filtradas(col); track opt.value) {
                          <button type="button"
                            (click)="seleccionar(col, opt)"
                            class="w-full text-left px-3 py-2 text-sm hover:bg-[#39A900]/10
                                   hover:text-[#39A900] transition-colors"
                            [class.bg-green-50]="form[col] === opt.value"
                            [class.text-green-700]="form[col] === opt.value">
                            {{ opt.label }}
                          </button>
                        }
                      </div>
                    }
                  </div>

                } @else if (opciones[col]?.length) {
                  <!-- SELECT: lista pequeña -->
                  <app-ss [options]="opciones[col]" placeholder="— Selecciona —"
                          [(ngModel)]="form[col]"></app-ss>

                } @else if (tiposCampo[col] === 'date') {
                  <!-- FECHA: calendario -->
                  <app-date-input
                    [ngModel]="dateValue(col)"
                    (ngModelChange)="setDateValue(col, $event)"></app-date-input>

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
                  <!-- CHECKBOX: campo booleano — el [type] dinámico de abajo no
                       enlaza [checked] correctamente para checkboxes en Angular. -->
                  <label class="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox"
                      [(ngModel)]="form[col]"
                      [name]="col"
                      class="w-4 h-4 rounded border-gray-300 text-[#39A900] focus:ring-[#39A900]/30 cursor-pointer" />
                    <span class="text-sm text-gray-700">{{ form[col] ? 'Sí' : 'No' }}</span>
                  </label>

                } @else {
                  <!-- INPUT normal -->
                  <input
                    [type]="tiposCampo[col] ?? 'text'"
                    [(ngModel)]="form[col]"
                    [name]="col"
                    class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                }
              </div>
              }
            }
          </div>

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
              style="background-color: #39A900">
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
export class AdminModalComponent implements OnChanges {
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

  @Output() closed = new EventEmitter<void>();
  @Output() saved  = new EventEmitter<Record<string, any>>();

  // ── Estado interno del autocomplete ──────────────────────────
  busquedas:     Record<string, string>  = {};  // texto escrito por campo
  listasAbiertas: Record<string, boolean> = {}; // si el dropdown está visible

  ngOnChanges(): void {
    // Al abrir el modal, inicializar el texto del autocomplete con el label ya seleccionado
    if (this.open) {
      this.busquedas     = {};
      this.listasAbiertas = {};
    }
  }

  // ── Helpers autocomplete ──────────────────────────────────────

  esAutocomplete(col: string): boolean {
    return (this.opciones[col]?.length ?? 0) > AUTOCOMPLETE_THRESHOLD;
  }

  getLabelSeleccionado(col: string): string {
    // Si el usuario está escribiendo, mostrar lo que escribe
    if (this.busquedas[col] !== undefined) return this.busquedas[col];
    // Si hay un valor seleccionado, mostrar su label
    const valor = this.form[col];
    if (!valor) return '';
    const opt = this.opciones[col]?.find(o => o.value === valor);
    return opt?.label ?? '';
  }

  onBusqueda(col: string, texto: string): void {
    this.busquedas[col]      = texto;
    this.listasAbiertas[col] = true;
    // Si borra el texto, limpiar el valor del form
    if (!texto.trim()) this.form[col] = '';
  }

  abrirLista(col: string): void {
    this.listasAbiertas[col] = true;
    // Mostrar el texto actual del label si hay valor
    if (this.form[col] && this.busquedas[col] === undefined) {
      const opt = this.opciones[col]?.find(o => o.value === this.form[col]);
      this.busquedas[col] = opt?.label ?? '';
    }
  }

  seleccionar(col: string, opt: OpcionSelect): void {
    this.form[col]           = opt.value;
    this.busquedas[col]      = opt.label;   // mostrar el nombre elegido
    this.listasAbiertas[col] = false;
  }

  filtradas(col: string): OpcionSelect[] {
    const texto = (this.busquedas[col] ?? '').toLowerCase().trim();
    const lista = this.opciones[col] ?? [];
    if (!texto) return lista;
    return lista.filter(o => o.label.toLowerCase().includes(texto));
  }

  // ── Helper de teléfono: solo dígitos, con un único "+" opcional al inicio ──
  sanitizeTelefono(valor: string): string {
    let limpio = (valor ?? '').replace(/[^\d+]/g, '');
    const conPrefijo = limpio.startsWith('+');
    limpio = limpio.replace(/\+/g, '');
    return conPrefijo ? '+' + limpio : limpio;
  }

  onBackdropClick(e: MouseEvent): void {
    // Cerrar listas abiertas al hacer clic en el fondo
    this.listasAbiertas = {};
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
