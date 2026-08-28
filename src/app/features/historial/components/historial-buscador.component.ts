import {
  Component, Input, Output, EventEmitter,
  signal, computed, HostListener,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

/**
 * Barra de busqueda de aprendices con autocomplete por cedula.
 *
 * El padre pasa la lista completa de personas y escucha (seleccionar) / (limpiar).
 */
@Component({
  selector: 'app-historial-buscador',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="w-full  relative" (click)="$event.stopPropagation()">

      <!-- Input -->
      <div class="relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-4 text-gray-400"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
        </svg>
        <input
          type="text"
          [ngModel]="query()"
          (ngModelChange)="onQueryChange($event)"
          (focus)="onFocus()"
          placeholder="Ingrese el numero de documento (cedula)"
          autocomplete="off"
          class="w-full pl-10 pr-10 py-3 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900] shadow-sm transition-colors"
          [class.rounded-b-none]="mostrarDropdown"
          [class.border-b-0]="mostrarDropdown"
        />

        @if (buscando) {
          <div class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2
                      border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
        } @else if (query()) {
          <button (click)="limpiarQuery()"
            class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center">
            x
          </button>
        }
      </div>

      <!-- Dropdown de sugerencias -->
      @if (mostrarDropdown) {
        <div class="absolute z-50 w-full bg-white border border-gray-200 border-t-0 rounded-b-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">

          @if (cargandoPersonas) {
            <div class="flex items-center gap-2 px-4 py-3 text-xs text-gray-400">
              <div class="w-3 h-3 border-2 border-gray-200 border-t-[#39A900] rounded-full animate-spin"></div>
              Cargando aprendices...
            </div>
          } @else {
            @for (p of sugerencias(); track p.idPersona ?? p.id_persona) {
              <button
                (click)="elegir(p)"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left
                       hover:bg-[#39A900]/5 transition-colors border-b border-gray-50
                       last:border-b-0">
                <div class="w-8 h-8 rounded-full bg-[#39A900]/10 text-[#39A900]
                            flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {{ iniciales(p.nombre) }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-gray-800 truncate">{{ p.nombre }}</p>
                  <p class="text-xs text-gray-400">
                    {{ p.cedula ?? p.numeroDocumento }}
                    @if (p.programa) { &middot; {{ p.programa }} }
                  </p>
                </div>
                <span class="text-xs font-mono text-[#39A900] flex-shrink-0">
                  {{ p.cedula ?? p.numeroDocumento }}
                </span>
              </button>
            }
          }
        </div>
      }
    </div>
  `,
})
export class HistorialBuscadorComponent {
  /** Lista completa de personas activas para filtrar localmente */
  @Input() personas: any[] = [];
  @Input() cargandoPersonas = false;
  /** Muestra spinner en el input mientras se consulta el historial */
  @Input() buscando = false;

  @Output() seleccionar    = new EventEmitter<any>();
  @Output() limpiar        = new EventEmitter<void>();
  /** Se emite la primera vez (y cada vez) que el usuario enfoca o escribe,
   *  para que el padre dispare la carga lazy de personas. */
  @Output() inicioBusqueda = new EventEmitter<void>();

  // Signal para que computed() pueda trackearla y re-ejecutarse al escribir
  query              = signal('');
  mostrarSugerencias = signal(false);

  sugerencias = computed(() => {
    const q = this.query().trim(); // signal → computed se re-ejecuta al cambiar
    if (!q) return [];
    return this.personas
      .filter((p: any) => {
        const doc = String(p.cedula ?? p.numeroDocumento ?? '').trim();
        return doc.startsWith(q);
      })
      .slice(0, 8);
  });

  /** El dropdown se muestra si hay texto Y (hay sugerencias O está cargando) */
  get mostrarDropdown(): boolean {
    return this.mostrarSugerencias() && !!this.query().trim() &&
           (this.sugerencias().length > 0 || this.cargandoPersonas);
  }

  @HostListener('document:click')
  onDocumentClick(): void { this.mostrarSugerencias.set(false); }

  onFocus(): void {
    this.inicioBusqueda.emit();
    if (this.query().trim()) this.mostrarSugerencias.set(true);
  }

  onQueryChange(valor: string): void {
    this.query.set(valor);
    this.inicioBusqueda.emit();
    this.mostrarSugerencias.set(!!valor.trim());
  }

  elegir(p: any): void {
    this.query.set(String(p.cedula ?? p.numeroDocumento ?? ''));
    this.mostrarSugerencias.set(false);
    this.seleccionar.emit(p);
  }

  limpiarQuery(): void {
    this.query.set('');
    this.mostrarSugerencias.set(false);
    this.limpiar.emit();
  }

  iniciales(nombre: string): string {
    return (nombre ?? '').split(/\s+/).slice(0, 2)
      .map((n: string) => n[0] ?? '').join('').toUpperCase() || '?';
  }
}
