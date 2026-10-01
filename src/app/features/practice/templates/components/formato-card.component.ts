import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Formato } from '../../../../shared/models';
import {
  urlFormato, etiquetaTipo, tonoTipo, infoArchivo, tamanoLegible, fechaCorta, esNuevo,
} from './formato-utils';

/**
 * Tarjeta de un formato (vista de cuadrícula). La "portada" toma el color del
 * tipo; al pasar el mouse (o con el teclado) ofrece la vista previa, que abre
 * el visor integrado del padre (`ver`) en vez de una pestaña nueva.
 */
@Component({
  selector: 'app-formato-card',
  standalone: true,
  styles: [`
    @keyframes entrar {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    :host { display: block; animation: entrar .32s cubic-bezier(.2,.7,.3,1) both; animation-delay: var(--retraso, 0ms); }
    .portada {
      background-image: repeating-linear-gradient(135deg, transparent 0 14px, rgba(255,255,255,.35) 14px 15px);
    }
    :host-context([data-theme="dark"]) .portada {
      background-image: repeating-linear-gradient(135deg, transparent 0 14px, rgba(255,255,255,.04) 14px 15px);
    }
    .hoja { transition: transform .25s cubic-bezier(.2,.7,.3,1); }
    .tarjeta:hover .hoja { transform: translateY(-3px) rotate(-2deg); }
  `],
  template: `
    <article class="tarjeta group h-full flex flex-col rounded-2xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl"
      style="background: var(--surface); border-color: var(--border);">

      <!-- Portada: clic = vista previa -->
      <button type="button" (click)="ver.emit(formato)"
        [attr.aria-label]="(archivo.vista === 'ninguna' ? 'Ver detalles de ' : 'Vista previa de ') + formato.nombre"
        class="portada relative h-32 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#39A900]"
        [style.background-color]="tono.bg">

        <!-- Hoja con la extensión -->
        <div class="hoja relative w-[58px] h-[72px] rounded-md shadow-md flex flex-col items-center justify-end pb-2"
          style="background: var(--surface);">
          <span class="absolute top-0 right-0 w-4 h-4 rounded-bl-md" [style.background]="tono.bg"></span>
          <span class="absolute left-2 right-5 top-3 h-[3px] rounded-full opacity-25" [style.background]="archivo.tono.text"></span>
          <span class="absolute left-2 right-3 top-[18px] h-[3px] rounded-full opacity-20" [style.background]="archivo.tono.text"></span>
          <span class="absolute left-2 right-4 top-[25px] h-[3px] rounded-full opacity-20" [style.background]="archivo.tono.text"></span>
          <span class="px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-wider text-white"
            [style.background]="archivo.tono.text">{{ archivo.ext }}</span>
        </div>

        @if (nuevo) {
          <span class="absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white shadow-sm"
            style="background: var(--accent-brand);">Nuevo</span>
        }

        <!-- Sugerencia al pasar el mouse -->
        <span class="absolute inset-x-0 bottom-0 flex justify-center pb-2.5 opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200">
          <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-sm"
            style="background: var(--surface); color: var(--text);">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
            {{ archivo.vista === 'ninguna' ? 'Ver detalles' : 'Vista previa' }}
          </span>
        </span>
      </button>

      <!-- Contenido -->
      <div class="flex-1 flex flex-col px-4 pt-3.5 pb-3">
        <span class="self-start inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
          [style.color]="tono.text">
          <span class="w-1.5 h-1.5 rounded-full" [style.background]="tono.text"></span>
          {{ etiqueta }}
        </span>
        <h3 class="mt-1 font-semibold text-[15px] text-gray-800 leading-snug line-clamp-2 break-words" [title]="formato.nombre">
          {{ formato.nombre }}
        </h3>
        <p class="mt-auto pt-2 text-[11px] text-gray-400 truncate" [title]="formato.nombre_original">
          {{ detalle || formato.nombre_original }}
        </p>
      </div>

      <!-- Acciones -->
      <div class="px-3 pb-3 flex gap-2">
        <a [href]="url" [download]="formato.nombre_original"
          class="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl text-white transition-[filter] hover:brightness-110"
          style="background: var(--accent-brand);">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>
          Descargar
        </a>
        <a [href]="url" target="_blank" rel="noopener" title="Abrir en una pestaña nueva" aria-label="Abrir en una pestaña nueva"
          class="w-9 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
        </a>
        @if (esAdmin) {
          <button type="button" (click)="eliminar.emit(formato.id)" title="Eliminar formato" aria-label="Eliminar formato"
            class="w-9 inline-flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>
          </button>
        }
      </div>
    </article>
  `,
})
export class FormatoCardComponent {
  @Input({ required: true }) formato!: Formato;
  @Input() esAdmin = false;
  @Output() eliminar = new EventEmitter<string>();
  @Output() ver = new EventEmitter<Formato>();

  get url(): string { return urlFormato(this.formato); }
  get etiqueta(): string { return etiquetaTipo(this.formato.tipo); }
  get tono() { return tonoTipo(this.formato.tipo); }
  get archivo() { return infoArchivo(this.formato); }
  get tamano(): string | null { return tamanoLegible(this.formato.tamanio); }
  get fecha(): string | null { return fechaCorta(this.formato.created_at); }
  get nuevo(): boolean { return esNuevo(this.formato.created_at); }
  /** "245 KB · 1 oct 2026" (lo que se conozca). */
  get detalle(): string { return [this.tamano, this.fecha].filter(Boolean).join(' · '); }
}
