import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Formato } from '../../../../shared/models';
import { DialogDirective } from '../../../../shared/directives/dialog.directive';
import {
  urlFormato, etiquetaTipo, tonoTipo, infoArchivo, tamanoLegible, fechaCorta,
} from './formato-utils';

/**
 * Visor de formatos dentro de la app: PDF en un iframe (mismo origen; nginx y
 * helmet permiten SAMEORIGIN) e imágenes directas. Word/Excel no se pueden
 * mostrar en el navegador: ficha con descarga. ← / → recorren la lista que
 * se está viendo (ya filtrada).
 */
@Component({
  selector: 'app-formato-visor',
  standalone: true,
  imports: [DialogDirective, NgTemplateOutlet],
  template: `
    @if (actual(); as f) {
      <div appDialog [dialogGuard]="false" class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-[2px]"
        (click)="cerrar.emit()">
        <div class="w-full max-w-5xl h-[min(88vh,900px)] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
          style="background: var(--surface); border-color: var(--border);" (click)="$event.stopPropagation()">

          <!-- Barra superior -->
          <header class="flex items-center gap-3 px-4 sm:px-5 py-3 border-b" style="border-color: var(--border);">
            <span class="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-extrabold tracking-wider flex-shrink-0"
              [style.background]="archivo().tono.bg" [style.color]="archivo().tono.text">{{ archivo().ext }}</span>
            <div class="min-w-0 flex-1">
              <h2 class="text-sm sm:text-base font-semibold text-gray-800 truncate">{{ f.nombre }}</h2>
              <p class="text-xs text-gray-400 truncate">
                <span class="font-semibold" [style.color]="tono().text">{{ etiqueta() }}</span>
                @if (detalle()) { · {{ detalle() }} }
              </p>
            </div>

            @if (lista.length > 1) {
              <span class="hidden sm:inline text-xs text-gray-400 tabular-nums">{{ indice() + 1 }} / {{ lista.length }}</span>
              <div class="flex">
                <button type="button" (click)="mover(-1)" aria-label="Formato anterior" title="Anterior (←)"
                  class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m15 18-6-6 6-6"/></svg>
                </button>
                <button type="button" (click)="mover(1)" aria-label="Formato siguiente" title="Siguiente (→)"
                  class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="m9 18 6-6-6-6"/></svg>
                </button>
              </div>
            }

            <a [href]="url()" target="_blank" rel="noopener" title="Abrir en una pestaña nueva" aria-label="Abrir en una pestaña nueva"
              class="hidden sm:inline-flex w-8 h-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
            </a>
            <a [href]="url()" [download]="f.nombre_original"
              class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white hover:brightness-110 transition-[filter]"
              style="background: var(--accent-brand);">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>
              <span class="hidden sm:inline">Descargar</span>
            </a>
            <button type="button" (click)="cerrar.emit()" aria-label="Cerrar"
              class="w-8 h-8 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </header>

          <!-- Contenido -->
          <div class="relative flex-1 min-h-0" style="background: var(--surface2);">
            @switch (archivo().vista) {
              @case ('pdf') {
                @if (cargando()) { <ng-container [ngTemplateOutlet]="spinner" /> }
                <iframe [src]="urlSegura()" [title]="'Vista previa de ' + f.nombre" (load)="cargando.set(false)"
                  class="w-full h-full border-0"></iframe>
              }
              @case ('imagen') {
                @if (cargando()) { <ng-container [ngTemplateOutlet]="spinner" /> }
                <div class="w-full h-full overflow-auto flex items-center justify-center p-4">
                  <img [src]="url()" [alt]="f.nombre" (load)="cargando.set(false)" (error)="cargando.set(false)"
                    class="max-w-full max-h-full object-contain rounded-lg shadow-md" />
                </div>
              }
              @default {
                <div class="h-full flex flex-col items-center justify-center text-center px-6">
                  <span class="w-20 h-24 rounded-xl flex items-center justify-center text-sm font-extrabold tracking-wider shadow-sm mb-5"
                    [style.background]="archivo().tono.bg" [style.color]="archivo().tono.text">{{ archivo().ext }}</span>
                  <p class="font-semibold text-gray-700">Este tipo de archivo no se puede ver en el navegador</p>
                  <p class="text-sm text-gray-400 mt-1 max-w-sm">Descárgalo para abrirlo con {{ archivo().ext === 'XLS' ? 'Excel' : archivo().ext === 'DOC' ? 'Word' : 'el programa correspondiente' }}.</p>
                  <a [href]="url()" [download]="f.nombre_original"
                    class="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white hover:brightness-110 transition-[filter]"
                    style="background: var(--accent-brand);">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>
                    Descargar {{ f.nombre_original }}
                  </a>
                </div>
              }
            }
          </div>
        </div>
      </div>
    }

    <ng-template #spinner>
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span class="w-8 h-8 rounded-full border-[3px] border-gray-200 animate-spin" style="border-top-color: var(--accent-brand);"></span>
      </div>
    </ng-template>
  `,
})
export class FormatoVisorComponent implements OnChanges {
  private readonly sanitizer = inject(DomSanitizer);

  /** Lista que se está viendo (ya filtrada y ordenada): ← / → la recorren. */
  @Input() lista: Formato[] = [];
  /** Formato a mostrar; null = cerrado. */
  @Input() formato: Formato | null = null;
  @Output() cerrar = new EventEmitter<void>();

  readonly actual = signal<Formato | null>(null);
  readonly cargando = signal(true);

  readonly indice = computed(() => {
    const a = this.actual();
    return a ? Math.max(0, this.lista.findIndex((f) => f.id === a.id)) : 0;
  });
  readonly archivo = computed(() => infoArchivo(this.actual()!));
  readonly tono = computed(() => tonoTipo(this.actual()!.tipo));
  readonly etiqueta = computed(() => etiquetaTipo(this.actual()!.tipo));
  readonly url = computed(() => urlFormato(this.actual()!));
  // Ruta del mismo origen armada por nosotros (/uploads/formatos/…): seguro marcarla como recurso.
  readonly urlSegura = computed((): SafeResourceUrl => this.sanitizer.bypassSecurityTrustResourceUrl(this.url()));
  readonly detalle = computed(() => {
    const f = this.actual()!;
    return [tamanoLegible(f.tamanio), fechaCorta(f.created_at)].filter(Boolean).join(' · ');
  });

  ngOnChanges(cambios: SimpleChanges): void {
    // Solo cuando el padre abre/cierra otro formato: lo navegado con ← / → no se pisa.
    if (cambios['formato']) this.mostrar(this.formato);
  }

  mover(paso: number): void {
    if (this.lista.length < 2) return;
    const i = (this.indice() + paso + this.lista.length) % this.lista.length;
    this.mostrar(this.lista[i]);
  }

  private mostrar(f: Formato | null): void {
    if (f?.id !== this.actual()?.id) this.cargando.set(true);
    this.actual.set(f);
  }

  @HostListener('document:keydown', ['$event'])
  alTeclear(e: KeyboardEvent): void {
    if (!this.actual()) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.mover(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); this.mover(1); }
  }
}
