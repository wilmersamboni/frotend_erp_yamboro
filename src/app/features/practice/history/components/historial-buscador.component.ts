import {
  Component, Input, Output, EventEmitter, ElementRef, ViewChild,
  signal, computed, HostListener,
} from '@angular/core';

/** Una parte del nombre/cédula, marcada si coincide con lo buscado. */
interface Trozo { texto: string; marca: boolean; }

/**
 * Buscador de aprendices: por nombre (en cualquier orden, sin tildes) o por
 * cédula. Flechas para moverse, Enter para elegir, Escape para cerrar; "/"
 * enfoca el buscador desde cualquier parte de la página.
 *
 * El padre pasa la lista completa de personas y escucha (seleccionar) / (limpiar).
 */
@Component({
  selector: 'app-historial-buscador',
  standalone: true,
  template: `
    <div class="relative w-full" (click)="$event.stopPropagation()">

      <div class="relative group">
        <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none transition-colors group-focus-within:text-[#39A900]"
          fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7"/><path stroke-linecap="round" d="m20 20-3.5-3.5"/>
        </svg>
        <input #campo
          type="text"
          role="combobox"
          aria-label="Buscar aprendiz por nombre o cédula"
          aria-autocomplete="list"
          [attr.aria-expanded]="abierto()"
          aria-controls="historial-sugerencias"
          [attr.aria-activedescendant]="abierto() && sugerencias().length ? 'sug-' + activo() : null"
          [value]="query()"
          (input)="onQueryChange(campo.value)"
          (focus)="onFocus()"
          (keydown)="alTeclear($event)"
          placeholder="Busca por nombre o número de cédula..."
          autocomplete="off"
          class="w-full pl-12 pr-24 py-3.5 rounded-2xl border text-[15px] shadow-sm transition-all focus:outline-none focus:ring-4 focus:ring-[#39A900]/10 focus:border-[#39A900]"
          style="background: var(--surface); border-color: var(--border);"
        />

        <div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          @if (buscando) {
            <span class="w-4 h-4 border-2 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin" aria-label="Buscando"></span>
          }
          @if (query()) {
            <button type="button" aria-label="Limpiar búsqueda" (click)="limpiarQuery()"
              class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          } @else {
            <kbd class="hidden sm:inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-md border text-[11px] font-semibold text-gray-400"
              style="border-color: var(--border); background: var(--surface2);" title="Pulsa / para buscar">/</kbd>
          }
        </div>
      </div>

      <!-- Sugerencias -->
      @if (abierto()) {
        <div id="historial-sugerencias" role="listbox" aria-label="Aprendices"
          class="absolute z-50 left-0 right-0 mt-2 rounded-2xl border shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          style="background: var(--surface); border-color: var(--border);">

          @if (cargandoPersonas) {
            <div class="flex items-center gap-2.5 px-4 py-4 text-sm text-gray-400">
              <span class="w-4 h-4 border-2 border-gray-200 border-t-[#39A900] rounded-full animate-spin"></span>
              Cargando aprendices...
            </div>
          } @else if (sugerencias().length === 0) {
            <div class="px-4 py-6 text-center">
              <p class="text-sm font-medium text-gray-600">Sin coincidencias para "{{ query().trim() }}"</p>
              <p class="text-xs text-gray-400 mt-1">Revisa la cédula o prueba con otra parte del nombre.</p>
            </div>
          } @else {
            <p class="px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {{ totalCoincidencias() > sugerencias().length ? 'Primeros ' + sugerencias().length + ' de ' + totalCoincidencias() : totalCoincidencias() + ' resultado' + (totalCoincidencias() !== 1 ? 's' : '') }}
            </p>
            <div class="max-h-80 overflow-y-auto pb-1.5 px-1.5">
              @for (s of sugerencias(); track s.id; let i = $index) {
                <button type="button" role="option" [id]="'sug-' + i" [attr.aria-selected]="i === activo()"
                  (click)="elegir(s.persona)" (mouseenter)="activo.set(i)"
                  class="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition-colors"
                  [style.background]="i === activo() ? 'var(--accent-soft)' : null">
                  <span class="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style="background: var(--accent-soft); color: var(--accent-text);">{{ s.iniciales }}</span>
                  <span class="flex-1 min-w-0">
                    <span class="block text-sm font-medium text-gray-800 truncate">
                      @for (t of s.nombre; track $index) {<span [class.font-bold]="t.marca" [style.color]="t.marca ? 'var(--accent-text)' : null">{{ t.texto }}</span>}
                    </span>
                    <span class="block text-xs text-gray-400 truncate">{{ s.cargo }}</span>
                  </span>
                  <span class="text-xs font-mono flex-shrink-0 text-gray-500">
                    @for (t of s.cedula; track $index) {<span [class.font-bold]="t.marca" [style.color]="t.marca ? 'var(--accent-text)' : null">{{ t.texto }}</span>}
                  </span>
                </button>
              }
            </div>
            <p class="hidden sm:flex items-center gap-3 px-4 py-2 border-t text-[11px] text-gray-400" style="border-color: var(--border);">
              <span><kbd class="font-sans font-semibold">↑ ↓</kbd> moverse</span>
              <span><kbd class="font-sans font-semibold">Enter</kbd> abrir</span>
              <span><kbd class="font-sans font-semibold">Esc</kbd> cerrar</span>
            </p>
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

  @ViewChild('campo', { static: true }) private campo!: ElementRef<HTMLInputElement>;

  query              = signal('');
  mostrarSugerencias = signal(false);
  /** Índice resaltado con las flechas. */
  activo             = signal(0);

  /** Personas que coinciden: cédula que empieza igual, o todas las palabras en el nombre. */
  private coincidencias = computed(() => {
    const q = this.query().trim();
    if (!q) return [];
    const soloDigitos = /^\d+$/.test(q);
    const palabras = normalizar(q).split(/\s+/).filter(Boolean);
    return this.personas.filter((p: any) => {
      const doc = String(p.cedula ?? p.numeroDocumento ?? '').trim();
      if (soloDigitos) return doc.startsWith(q);
      const nombre = normalizar(`${p.nombre ?? ''} ${p.apellido ?? ''}`);
      return palabras.every((w) => nombre.includes(w));
    });
  });

  totalCoincidencias = computed(() => this.coincidencias().length);

  sugerencias = computed(() => {
    const q = this.query().trim();
    const palabras = normalizar(q).split(/\s+/).filter(Boolean);
    return this.coincidencias().slice(0, 8).map((p: any) => {
      const nombre = `${p.nombre ?? ''} ${p.apellido ?? ''}`.replace(/\s+/g, ' ').trim() || 'Sin nombre';
      const cedula = String(p.cedula ?? p.numeroDocumento ?? '');
      return {
        id: p.idPersona ?? p.id_persona ?? cedula,
        persona: p,
        iniciales: iniciales(nombre),
        nombre: resaltar(nombre, palabras),
        cedula: /^\d+$/.test(q) && cedula.startsWith(q)
          ? [{ texto: q, marca: true }, { texto: cedula.slice(q.length), marca: false }]
          : [{ texto: cedula, marca: false }],
        // /personas no trae el programa (está en sus matrículas): se muestra el cargo.
        cargo: etiquetaCargo(p.cargo),
      };
    });
  });

  /** Abierto si hay texto y el usuario está en el buscador. */
  abierto = computed(() => this.mostrarSugerencias() && !!this.query().trim());

  @HostListener('document:click')
  onDocumentClick(): void { this.mostrarSugerencias.set(false); }

  /** "/" enfoca el buscador (salvo que ya se esté escribiendo en otro campo). */
  @HostListener('document:keydown', ['$event'])
  atajo(e: KeyboardEvent): void {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
    e.preventDefault();
    this.enfocar();
  }

  enfocar(): void { this.campo.nativeElement.focus(); }

  onFocus(): void {
    this.inicioBusqueda.emit();
    if (this.query().trim()) this.mostrarSugerencias.set(true);
  }

  onQueryChange(valor: string): void {
    this.query.set(valor);
    this.activo.set(0);
    this.inicioBusqueda.emit();
    this.mostrarSugerencias.set(!!valor.trim());
  }

  alTeclear(e: KeyboardEvent): void {
    const total = this.sugerencias().length;
    if (e.key === 'Escape') { this.mostrarSugerencias.set(false); return; }
    if (!total) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.mostrarSugerencias.set(true);
      this.activo.update((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + total) % total);
      document.getElementById('sug-' + this.activo())?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && this.abierto()) {
      e.preventDefault();
      this.elegir(this.sugerencias()[this.activo()].persona);
    }
  }

  elegir(p: any): void {
    const nombre = `${p.nombre ?? ''} ${p.apellido ?? ''}`.replace(/\s+/g, ' ').trim();
    this.query.set(nombre || String(p.cedula ?? p.numeroDocumento ?? ''));
    this.mostrarSugerencias.set(false);
    this.seleccionar.emit(p);
  }

  /** Lo usa el padre al abrir un aprendiz desde "recientes": deja su nombre en el buscador. */
  mostrarNombre(nombre: string): void {
    this.query.set(nombre);
    this.mostrarSugerencias.set(false);
  }

  limpiarQuery(): void {
    this.query.set('');
    this.mostrarSugerencias.set(false);
    this.limpiar.emit();
    this.enfocar();
  }
}

/** Minúsculas y sin tildes. */
function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** "aprendiz" → "Aprendiz", "administrador_erp" → "Administrador ERP"; vacío si no hay cargo. */
export function etiquetaCargo(cargo: string | null | undefined): string {
  const c = String(cargo ?? '').trim().toLowerCase();
  if (!c) return '';
  if (c === 'administrador_erp') return 'Administrador ERP';
  return c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' ');
}

export function iniciales(nombre: string): string {
  return (nombre ?? '').trim().split(/\s+/).slice(0, 2)
    .map((n) => n[0] ?? '').join('').toUpperCase() || '?';
}

/**
 * Parte el texto en trozos marcando dónde aparece cada palabra buscada. La
 * comparación ignora tildes, pero los trozos conservan el texto original
 * (NFD no cambia la cantidad de letras base, así que las posiciones calzan
 * sobre la versión sin marcas diacríticas del mismo texto).
 */
function resaltar(texto: string, palabras: string[]): Trozo[] {
  if (!palabras.length) return [{ texto, marca: false }];
  const base = normalizar(texto);
  if (base.length !== texto.length) return [{ texto, marca: false }];
  const marcas = new Array<boolean>(texto.length).fill(false);
  for (const w of palabras) {
    let i = base.indexOf(w);
    while (i !== -1) {
      for (let k = i; k < i + w.length; k++) marcas[k] = true;
      i = base.indexOf(w, i + w.length);
    }
  }
  const trozos: Trozo[] = [];
  for (let i = 0; i < texto.length; i++) {
    const ultimo = trozos[trozos.length - 1];
    if (ultimo && ultimo.marca === marcas[i]) ultimo.texto += texto[i];
    else trozos.push({ texto: texto[i], marca: marcas[i] });
  }
  return trozos;
}
