import { Component, DestroyRef, ElementRef, Injector, OnInit, afterNextRender, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import gsap from 'gsap';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import {
  MaterialesApiService,
  ResultadoImportacion,
  ResultadoPrevisualizacion,
  FilaImportacion,
  FilaConfirmada,
  TipoMaterial,
} from './data-access/materiales-api.service';
import { SearchableSelectComponent, SSOption } from '../../shared/components/searchable-select.component';

/** Fila del resumen: lo parseado + lo que el encargado elige antes de confirmar. */
type FilaRevision = FilaImportacion & { id_categoria: string; id_sitio: string };

/**
 * #5 — Importación masiva de productos (.xlsx / .csv), en DOS pasos.
 *
 *  PASO 1  subir archivo → el backend lo parsea y devuelve un RESUMEN. No se
 *          registra nada. Detecta la fila de encabezados sola y acepta nombres
 *          de reportes de entrega SENA ("Producto", "Cantidad entrega 1"...).
 *  PASO 2  el encargado revisa el resumen — elige tipo de material, bodega y
 *          categoría de cada fila (el SKU se autogenera) — y confirma. Recién
 *          ahí se crean los productos y su stock (ítems o lote).
 *
 * Animaciones con GSAP (2026-09-25): zona de arrastre (hover al arrastrar,
 * entrada de la tarjeta del archivo, sacudida si el archivo es inválido),
 * progreso REAL de subida + barra indeterminada mientras el backend procesa,
 * y la transición subir → revisar (secciones, contadores y primeras filas).
 * Todo se desactiva con `prefers-reduced-motion`.
 *
 * Ruta gateada por `materiales.productos.crear`.
 */
@Component({
  selector: 'app-materiales-importar',
  standalone: true,
  imports: [RouterLink, FormsModule, SearchableSelectComponent],
  styles: [`
    :host { display:block; }
    .card { background:#fff; border:1px solid rgb(226 232 240 / .8); border-radius:1rem; }
    .field { border:1px solid #e2e8f0; border-radius:.5rem; font-size:.8125rem; padding:.45rem .6rem; background:#fff; transition:border-color .15s, box-shadow .15s; }
    .field:focus { outline:none; border-color:#39A900; box-shadow:0 0 0 3px rgb(57 169 0 / .12); }
    .ss-warn ::ng-deep .ss-trigger { border-color:#fbbf24; background:#fffdf5; }
    .btn-primary { display:inline-flex; align-items:center; justify-content:center; background:#39A900; color:#fff; border-radius:.625rem; font-weight:600; text-decoration:none; transition:background .15s, opacity .15s; }
    .btn-primary:hover:not(:disabled) { background:#2d8000; }
    .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
    .btn-ghost { display:inline-flex; align-items:center; justify-content:center; border:1px solid #e2e8f0; border-radius:.625rem; color:#475569; font-weight:500; background:#fff; text-decoration:none; transition:border-color .15s, color .15s; }
    .btn-ghost:hover:not(:disabled) { border-color:#39A900; color:#2d8000; }
    .dropzone { border-color:#e2e8f0; will-change:transform; }
    .dropzone--drag { border-color:#39A900; background:rgb(57 169 0 / .06); }
    .dropzone--file { border-color:rgb(57 169 0 / .4); background:rgb(57 169 0 / .035); }
    .label { font-size:.75rem; font-weight:600; color:#64748b; }
    /* Tabla del resumen: encabezado fijo al hacer scroll dentro de la tarjeta. */
    .tabla-scroll { max-height:calc(100dvh - 26rem); min-height:360px; overflow:auto; scrollbar-width:none; }
    .tabla-scroll::-webkit-scrollbar { display:none; }
    .tabla-scroll thead th { position:sticky; top:0; z-index:2; background:#f8fafc; box-shadow:inset 0 -1px 0 #e2e8f0; }
    tbody tr.row-warn { box-shadow: inset 3px 0 0 #fbbf24; background:rgb(255 251 235 / .35); }
    tbody tr:hover { background:rgb(248 250 252 / .8); }
  `],
  template: `
    <div class="px-4 sm:px-8 lg:px-10 py-8 w-full max-w-[1600px] mx-auto">

      <!-- ═══════════════ ENCABEZADO + PASOS ═══════════════ -->
      <header class="mb-8">
        <a [routerLink]="destino()"
          class="group inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-full pl-2.5 pr-3.5 py-2 shadow-sm hover:border-[#39A900] hover:text-[#2d8000] hover:bg-[#39A900]/[0.06] hover:shadow transition-all mb-4">
          <svg class="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
          {{ destino() === '/mi-bodega' ? 'Volver a Mi Bodega' : 'Volver a Productos' }}
        </a>

        <div class="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
          <div class="min-w-0">
            <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Importar productos</h1>
            <p class="text-sm text-gray-500 mt-1">
              Carga masiva desde Excel o CSV. Siempre revisás un resumen antes de que se registre nada.
            </p>
          </div>

          <ol class="flex flex-wrap items-center gap-2 text-xs shrink-0">
            @for (p of pasos; track p.n; let ultimo = $last) {
              <li class="flex items-center gap-2">
                <span class="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border transition-colors"
                  [class]="estadoPaso(p.n) === 'actual' ? 'border-[#39A900]/40 bg-[#39A900]/[0.07] text-[#2d8000]'
                         : estadoPaso(p.n) === 'hecho' ? 'border-gray-200 bg-white text-gray-600'
                         : 'border-gray-200 bg-white text-gray-400'">
                  <span class="grid place-items-center w-6 h-6 rounded-full text-[11px] font-bold"
                    [class]="estadoPaso(p.n) === 'pendiente' ? 'bg-gray-100 text-gray-400' : 'bg-[#39A900] text-white'">
                    @if (estadoPaso(p.n) === 'hecho') {
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                    } @else { {{ p.n }} }
                  </span>
                  <span class="font-semibold whitespace-nowrap">{{ p.t }}</span>
                </span>
                @if (!ultimo) { <span class="hidden sm:block w-5 h-px bg-gray-200"></span> }
              </li>
            }
          </ol>
        </div>
      </header>

      <!-- ═══════════════ PASO 1 · SUBIR ═══════════════ -->
      @if (fase === 'subir') {
        <div data-anim="subir" class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div class="card p-6 sm:p-8 shadow-sm">
          <label data-anim="dropzone"
            class="dropzone relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-20 text-center cursor-pointer transition-colors"
            [class.dropzone--drag]="arrastrando"
            [class.dropzone--file]="archivo && !arrastrando"
            (dragover)="onDragOver($event)"
            (dragleave)="onDragLeave($event)"
            (drop)="onDrop($event)">
            <input type="file" accept=".xlsx,.csv" class="hidden" (change)="onPick($event)" [disabled]="analizando" />

            @if (archivo) {
              <span data-anim="dz-icono" class="grid place-items-center w-14 h-14 rounded-full bg-green-50 text-green-700">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/></svg>
              </span>
              <div data-anim="dz-texto">
                <p class="text-base font-semibold text-gray-800">{{ archivo.name }}</p>
                <p class="text-xs text-gray-400 mt-1">{{ (archivo.size / 1024).toFixed(0) }} KB · hacé clic para cambiarlo</p>
              </div>
            } @else {
              <span data-anim="dz-icono" class="grid place-items-center w-14 h-14 rounded-full bg-gray-100 text-gray-400 transition-colors"
                [class.bg-green-50]="arrastrando" [class.text-green-700]="arrastrando">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"/><path d="m8 17 4-4 4 4"/><path d="M20 16.7A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>
              </span>
              <div data-anim="dz-texto">
                <p class="text-base font-medium text-gray-600">
                  {{ arrastrando ? 'Soltalo para cargarlo' : 'Arrastrá tu archivo acá o ' }}
                  @if (!arrastrando) { <span class="text-green-700 font-semibold">elegilo</span> }
                </p>
                <p class="text-xs text-gray-400 mt-1">.xlsx o .csv · hasta 500 filas</p>
              </div>
            }
          </label>

          <button (click)="analizar()" [disabled]="!archivo || analizando"
            class="btn-primary w-full mt-5 py-3 text-sm flex items-center justify-center gap-2">
            @if (analizando) {
              <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Analizando…
            } @else {
              Analizar archivo
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            }
          </button>

          <!-- progreso: % real de subida, luego barra indeterminada mientras el backend procesa -->
          @if (analizando) {
            <div class="mt-4">
              <div class="relative h-1.5 rounded-full bg-gray-100 overflow-hidden">
                @if (!procesando()) {
                  <div class="h-full rounded-full bg-[#39A900] transition-[width] duration-200" [style.width.%]="progresoSubida()"></div>
                } @else {
                  <div data-anim="barra-indet" class="absolute inset-y-0 left-0 w-1/3 rounded-full bg-[#39A900]"
                    [class.w-full]="reducirMovimiento" [class.opacity-60]="reducirMovimiento"></div>
                }
              </div>
              <div class="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span data-anim="msg-analisis">{{ procesando() ? mensajesAnalisis[mensajeIdx()] : 'Subiendo archivo…' }}</span>
                @if (!procesando()) { <span class="tabular-nums font-medium">{{ progresoSubida() }}%</span> }
              </div>
            </div>
          }

        </div>

        <!-- panel de ayuda -->
        <aside class="card p-6 shadow-sm space-y-6">
          <div>
            <p class="text-sm font-semibold text-gray-800 mb-3">Cómo funciona</p>
            <ol class="space-y-3">
              @for (p of ayudaPasos; track p.t; let i = $index) {
                <li class="flex gap-3">
                  <span class="flex-none grid place-items-center w-6 h-6 rounded-full bg-green-50 text-green-700 text-[11px] font-bold">{{ i + 1 }}</span>
                  <div>
                    <p class="text-sm font-medium text-gray-700 leading-tight">{{ p.t }}</p>
                    <p class="text-xs text-gray-400 mt-0.5 leading-snug">{{ p.d }}</p>
                  </div>
                </li>
              }
            </ol>
          </div>

          <div class="pt-5 border-t border-gray-100">
            <p class="text-sm font-semibold text-gray-800 mb-2">Qué lee del archivo</p>
            <p class="text-xs text-gray-500 leading-relaxed">
              Nombre del producto, cantidad, unidad de medida, código UNSPSC y descripción.
              Encuentra solo la fila de encabezados, así que sirve el reporte de entrega del SENA tal cual.
              El tipo, la bodega y la categoría los elegís en el paso 2; el SKU se genera solo.
            </p>
          </div>

          <div class="pt-5 border-t border-gray-100">
            <p class="text-sm font-semibold text-gray-800 mb-1">¿No tenés el formato?</p>
            <p class="text-xs text-gray-400 mb-3">Bajá la plantilla con las columnas listas para completar.</p>
            <button (click)="descargarPlantilla()" [disabled]="descargando"
              class="btn-ghost w-full gap-2 px-4 py-2.5 text-sm disabled:opacity-60">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
              {{ descargando ? 'Generando…' : 'Descargar plantilla' }}
            </button>
          </div>
        </aside>
        </div>
      }

      <!-- ═══════════════ PASO 2 · REVISAR ═══════════════ -->
      @if (fase === 'revisar' && prev) {
        <div class="space-y-5">
          <!-- resumen -->
          <div data-anim="seccion" class="card px-5 py-4 shadow-sm flex flex-wrap items-center gap-x-6 gap-y-3">
            <div class="flex items-center gap-3 min-w-0">
              <span class="flex-none grid place-items-center w-10 h-10 rounded-xl bg-green-50 text-green-700">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
              </span>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-gray-800 truncate">{{ prev.archivo }}</p>
                <div class="flex items-center gap-1.5 text-xs mt-1">
                  <span class="inline-flex items-center rounded-full bg-gray-100 text-gray-600 font-medium px-2 py-0.5 tabular-nums">{{ contLeidas() }} leídas</span>
                  @if (conAviso > 0) {
                    <span class="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium px-2 py-0.5 tabular-nums">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                      {{ contAviso() }} con aviso
                    </span>
                  }
                </div>
              </div>
            </div>

            <div class="flex items-center gap-4 ml-auto">
              <div class="hidden sm:block w-56">
                <div class="flex items-center justify-between text-xs mb-1.5">
                  <span class="text-gray-400 font-medium">Filas listas</span>
                  <span class="font-semibold tabular-nums" [class]="listas === filas.length ? 'text-green-700' : 'text-gray-600'">{{ listasVisibles() ?? listas }}/{{ filas.length }}</span>
                </div>
                <div class="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div data-anim="barra-listas" class="h-full rounded-full transition-[width,background-color] duration-300"
                    [class]="listas === filas.length ? 'bg-green-500' : 'bg-amber-400'"
                    [style.width.%]="filas.length ? (listas / filas.length) * 100 : 0"></div>
                </div>
              </div>
              <button (click)="volver()" class="btn-ghost px-3 py-1.5 text-xs">← Otro archivo</button>
            </div>
          </div>

          @if (prev.errores.length) {
            <div data-anim="seccion" class="rounded-xl border border-amber-200 bg-amber-50/70 px-5 py-4 text-sm">
              <p class="font-medium text-amber-800 flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                {{ prev.errores.length }} fila(s) del archivo se ignoraron
              </p>
              <ul class="list-disc ml-6 mt-1.5 text-xs text-amber-700 space-y-0.5">
                @for (e of prev.errores; track e.fila) { <li>Fila {{ e.fila }}: {{ e.error }}</li> }
              </ul>
            </div>
          }

          <!-- completar en lote -->
          <div data-anim="seccion" class="card px-5 py-4 shadow-sm">
            <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
              <p class="text-sm font-semibold text-gray-800">Completar en lote</p>
              <p class="text-xs text-gray-400">
                Copia a todas las filas solo los campos que elijas; los que queden en «-Sin cambiar-» no se tocan.
              </p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] gap-4 items-end">
              <div class="flex flex-col gap-1.5">
                <label class="label">Tipo de material</label>
                <app-ss [options]="opcionesTipo" placeholder="-Sin cambiar-" [(ngModel)]="bulkTipo"></app-ss>
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="label">Bodega</label>
                <app-ss [options]="opcionesSitio" placeholder="-Sin cambiar-" [(ngModel)]="bulkSitio"></app-ss>
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="label">Categoría</label>
                <app-ss [options]="opcionesCategoria" placeholder="-Sin cambiar-" [(ngModel)]="bulkCategoria"></app-ss>
              </div>
              <button (click)="aplicarLote()" [disabled]="!haySeleccionLote"
                class="btn-primary px-5 py-2.5 text-sm whitespace-nowrap">Aplicar a todas</button>
            </div>
          </div>

          <!-- tabla -->
          <div data-anim="seccion" class="card overflow-hidden shadow-sm">
            <div class="tabla-scroll">
              <table class="w-full text-sm min-w-[1280px] border-collapse">
                <thead class="text-[11px] uppercase tracking-wide text-gray-500 text-left">
                  <tr>
                    <th class="px-3 py-3 font-semibold w-12">#</th>
                    <th class="px-3 py-3 font-semibold min-w-[280px]">Producto</th>
                    <th class="px-3 py-3 font-semibold w-24">UNSPSC</th>
                    <th class="px-3 py-3 font-semibold w-24">Unidad</th>
                    <th class="px-3 py-3 font-semibold w-24 text-right">Cant.</th>
                    <th class="px-3 py-3 font-semibold w-44">Tipo <span class="text-amber-500">*</span></th>
                    <th class="px-3 py-3 font-semibold w-52">Bodega</th>
                    <th class="px-3 py-3 font-semibold w-64">Categoría <span class="text-amber-500">*</span></th>
                    <th class="px-3 py-3 font-semibold w-40">SKU</th>
                    <th class="px-3 py-3 font-semibold w-10"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (f of filas; track f.fila) {
                    <tr [class.row-warn]="!f.tipo_material || !f.id_categoria">
                      <td class="px-3 py-3 text-gray-300 tabular-nums">{{ f.fila }}</td>
                      <td class="px-3 py-3 max-w-[340px]">
                        <div class="font-medium text-gray-800 leading-snug truncate" [title]="f.nombre">{{ f.nombre }}</div>
                        @if (f.descripcion) {
                          <div class="text-xs text-gray-400 truncate mt-0.5" [title]="f.descripcion">{{ f.descripcion }}</div>
                        }
                      </td>
                      <td class="px-3 py-3 text-gray-500 tabular-nums">{{ f.codigo_unspsc || '—' }}</td>
                      <td class="px-3 py-3 text-gray-500">{{ f.unidad_medida }}</td>
                      <td class="px-3 py-3 text-right">
                        <input type="number" min="0" [(ngModel)]="f.cantidad" class="field w-20 text-right tabular-nums" />
                      </td>
                      <td class="px-3 py-3" data-col="tipo">
                        <div [class.ss-warn]="!f.tipo_material">
                          <app-ss [options]="opcionesTipo" placeholder="-Elegí-" [(ngModel)]="f.tipo_material"></app-ss>
                        </div>
                      </td>
                      <td class="px-3 py-3" data-col="bodega">
                        <app-ss [options]="opcionesSitio" placeholder="-Sin bodega-" [(ngModel)]="f.id_sitio"></app-ss>
                      </td>
                      <td class="px-3 py-3" data-col="categoria">
                        <div [class.ss-warn]="!f.id_categoria">
                          <app-ss [options]="opcionesCategoria" placeholder="-Elegí-" [(ngModel)]="f.id_categoria"></app-ss>
                        </div>
                      </td>
                      <td class="px-3 py-3">
                        <input type="text" [(ngModel)]="f.sku" class="field w-full min-w-[130px] font-mono text-xs bg-gray-50/60" />
                      </td>
                      <td class="px-3 py-3 text-center">
                        @if (f.advertencias.length) {
                          <span class="inline-grid place-items-center w-6 h-6 rounded-full bg-amber-100 text-amber-600 cursor-help align-middle"
                            [title]="f.advertencias.join('\n')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/></svg>
                          </span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- barra de acción -->
          <div data-anim="seccion" class="card px-5 py-4 flex flex-wrap items-center gap-3 shadow-sm">
            @if (pendientes > 0) {
              <span class="text-sm text-amber-600 flex items-center gap-1.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                Faltan <b>{{ filas.length - (listasVisibles() ?? listas) }}</b> fila(s) con tipo o categoría sin elegir
              </span>
            } @else {
              <span class="text-sm text-green-700 flex items-center gap-1.5 font-medium">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                Todo listo para registrar
              </span>
            }
            <button (click)="confirmar()" [disabled]="pendientes > 0 || confirmando || !filas.length"
              class="btn-primary ml-auto px-6 py-2.5 text-sm flex items-center gap-2">
              @if (confirmando) {
                <svg class="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                Registrando…
              } @else {
                Confirmar y registrar ({{ filas.length }})
              }
            </button>
          </div>
        </div>
      }

      <!-- ═══════════════ RESULTADO ═══════════════ -->
      @if (fase === 'resultado' && resultado) {
        <div class="max-w-4xl mx-auto">
          <div data-anim="res-card" class="card p-5 mb-5 flex items-center gap-3"
            [class.bg-red-50]="resultado.errores.length">
            <span data-anim="res-icono" class="flex-none grid place-items-center w-11 h-11 rounded-full"
              [class]="resultado.errores.length ? 'bg-amber-100 text-amber-600' : 'bg-green-50 text-green-700'">
              @if (resultado.errores.length) {
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              } @else {
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path data-anim="check-path" d="M20 6 9 17l-5-5"/></svg>
              }
            </span>
            <div>
              <p class="text-sm font-semibold text-gray-800">
                {{ resultado.errores.length ? 'Importación con observaciones' : 'Importación completa' }}
              </p>
              <p class="text-xs text-gray-500">
                {{ resultado.productos_creados }} producto(s) · {{ resultado.stock_agregado }} de stock
                @if (resultado.errores.length) { · {{ resultado.errores.length }} fila(s) con error }
              </p>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div data-anim="res-card" class="card p-4">
              <div class="text-2xl font-bold text-gray-700 tabular-nums">{{ resTotal() }}</div>
              <div class="text-[11px] text-gray-400 font-medium mt-0.5">Filas</div>
            </div>
            <div data-anim="res-card" class="card p-4 border-green-200 bg-green-50">
              <div class="text-2xl font-bold text-green-700 tabular-nums">{{ resProductos() }}</div>
              <div class="text-[11px] text-green-700/80 font-medium mt-0.5">Productos</div>
            </div>
            <div data-anim="res-card" class="card p-4 border-blue-100 bg-blue-50/60">
              <div class="text-2xl font-bold text-blue-600 tabular-nums">{{ resStock() }}</div>
              <div class="text-[11px] text-blue-600/80 font-medium mt-0.5">Stock</div>
            </div>
            <div data-anim="res-card" class="card p-4" [class]="resultado.errores.length ? 'border-red-100 bg-red-50/60' : ''">
              <div class="text-2xl font-bold tabular-nums" [class]="resultado.errores.length ? 'text-red-600' : 'text-gray-300'">{{ resErrores() }}</div>
              <div class="text-[11px] font-medium mt-0.5" [class]="resultado.errores.length ? 'text-red-600/80' : 'text-gray-400'">Errores</div>
            </div>
          </div>

          @if (resultado.errores.length) {
            <div class="flex items-center justify-between mb-2">
              <h2 class="text-sm font-semibold text-gray-700">Filas con error</h2>
              <button (click)="copiarErrores()" class="text-xs text-gray-500 hover:text-gray-700">Copiar</button>
            </div>
            <div class="card overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 text-gray-400 text-left text-[11px] uppercase tracking-wide">
                  <tr><th class="px-3 py-2 font-semibold w-16">Fila</th><th class="px-3 py-2 font-semibold">Error</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (e of resultado.errores; track e.fila) {
                    <tr><td class="px-3 py-2 text-gray-400 tabular-nums">{{ e.fila }}</td><td class="px-3 py-2 text-red-700">{{ e.error }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <div class="mt-6 flex gap-3">
            <a [routerLink]="destino()" class="btn-primary px-4 py-2 text-sm">{{ destino() === '/mi-bodega' ? 'Ver en Mi Bodega' : 'Ver productos' }}</a>
            <button (click)="volver()" class="btn-ghost px-4 py-2 text-sm">Importar otro archivo</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class MaterialesImportarComponent implements OnInit {
  fase: 'subir' | 'revisar' | 'resultado' = 'subir';

  /**
   * A dónde "Volver"/"Ver productos" — no siempre `/materiales/productos`.
   * Un encargado de bodega (sin acceso general al catálogo, ver plan
   * "quitar Sitios/Productos del instructor común") tiene que volver a "Mi
   * Bodega", que es la única pantalla de productos que sí puede usar; admin
   * y líder de área sí usan la pantalla general, así que van ahí.
   */
  destino = signal<'/materiales/productos' | '/mi-bodega'>('/materiales/productos');

  archivo: File | null = null;
  arrastrando = false;
  descargando = false;
  analizando = false;
  confirmando = false;

  prev: ResultadoPrevisualizacion | null = null;
  filas: FilaRevision[] = [];
  resultado: ResultadoImportacion | null = null;

  bulkTipo: '' | TipoMaterial = '';
  bulkSitio = '';
  bulkCategoria = '';

  readonly opcionesTipo: SSOption[] = [
    { value: 'CONSUMO', label: 'Consumo' },
    { value: 'DEVOLUTIVO', label: 'Devolutivo' },
    { value: 'PERECEDERO', label: 'Perecedero' },
  ];

  // Sin opción vacía: «-Sin bodega-»/«-Sin cambiar-» son solo placeholder.
  opcionesSitio: SSOption[] = [];
  opcionesCategoria: SSOption[] = [];

  readonly pasos = [
    { n: 1, t: 'Subir archivo' },
    { n: 2, t: 'Revisar y ajustar' },
    { n: 3, t: 'Confirmar' },
  ];

  readonly ayudaPasos = [
    { t: 'Subís el archivo', d: 'El Excel de la entrega o la plantilla, .xlsx o .csv.' },
    { t: 'Revisás el resumen', d: 'Elegís tipo, bodega y categoría por fila o para todas de una vez.' },
    { t: 'Confirmás', d: 'Recién ahí se crean los productos y su stock.' },
  ];

  // ── Progreso del análisis ─────────────────────────────────────────
  /** % REAL de subida del archivo (evento UploadProgress de HttpClient). */
  progresoSubida = signal(0);
  /** true cuando el archivo ya subió y se espera la respuesta del backend. */
  procesando = signal(false);
  mensajeIdx = signal(0);
  /** Decorativos: el backend responde todo en una sola petición, no reporta etapas. */
  readonly mensajesAnalisis = [
    'Leyendo filas…',
    'Detectando encabezados…',
    'Sugiriendo tipos de material…',
    'Armando el resumen…',
  ];

  // ── Contadores animados del resumen ───────────────────────────────
  contLeidas = signal(0);
  contAviso = signal(0);
  /** Mientras anima "Aplicar a todas" muestra este valor; `null` = el real (`listas`). */
  listasVisibles = signal<number | null>(null);

  // ── Contadores animados del resultado ─────────────────────────────
  resTotal = signal(0);
  resProductos = signal(0);
  resStock = signal(0);
  resErrores = signal(0);

  readonly reducirMovimiento =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly injector = inject(Injector);
  private pulsoDropzone: gsap.core.Tween | null = null;
  private barraIndet: gsap.core.Tween | null = null;
  private mensajesTimer: ReturnType<typeof setInterval> | null = null;
  private fallbackProcesando: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private api: MaterialesApiService,
    private toast: ToastService,
    private auth: AuthService,
  ) {
    inject(DestroyRef).onDestroy(() => {
      this.detenerProgreso();
      this.pulsoDropzone?.kill();
    });
  }

  async ngOnInit(): Promise<void> {
    if (this.auth.isAdmin()) return; // ya queda en '/materiales/productos', su pantalla normal
    try {
      const aCargo = await this.api.sitiosACargo();
      if (aCargo.length > 0) this.destino.set('/mi-bodega');
    } catch {
      // Sin poder resolverlo, se queda en Productos (mejor eso que romper el flujo de importar).
    }
  }

  get pendientes(): number {
    return this.filas.filter((f) => !f.tipo_material || !f.id_categoria).length;
  }
  get listas(): number {
    return this.filas.length - this.pendientes;
  }
  get conAviso(): number {
    return this.filas.filter((f) => f.advertencias.length > 0).length;
  }

  estadoPaso(n: number): 'hecho' | 'actual' | 'pendiente' {
    const actual = this.fase === 'subir' ? 1 : this.fase === 'revisar' ? 2 : 4; // resultado: los 3 hechos
    return n < actual ? 'hecho' : n === actual ? 'actual' : 'pendiente';
  }

  private el(nombre: string): HTMLElement | null {
    return this.host.querySelector(`[data-anim="${nombre}"]`);
  }

  // ── 1 · Zona de arrastre ──────────────────────────────────────────
  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    if (this.arrastrando || this.analizando) return;
    this.arrastrando = true;
    if (this.reducirMovimiento) return;
    const zona = this.el('dropzone');
    if (zona) {
      this.pulsoDropzone?.kill();
      this.pulsoDropzone = gsap.to(zona, { scale: 1.012, duration: 0.6, ease: 'sine.inOut', repeat: -1, yoyo: true });
    }
    const icono = this.el('dz-icono');
    if (icono) gsap.to(icono, { y: -8, scale: 1.12, duration: 0.3, ease: 'back.out(2)' });
  }

  onDragLeave(ev: DragEvent): void {
    // dragleave también se dispara al pasar sobre un hijo de la zona: ignorarlo.
    const zona = this.el('dropzone');
    if (zona && ev.relatedTarget instanceof Node && zona.contains(ev.relatedTarget)) return;
    this.arrastrando = false;
    this.soltarPulso();
  }

  private soltarPulso(): void {
    this.pulsoDropzone?.kill();
    this.pulsoDropzone = null;
    if (this.reducirMovimiento) return;
    const zona = this.el('dropzone');
    if (zona) gsap.to(zona, { scale: 1, duration: 0.2 });
    const icono = this.el('dz-icono');
    if (icono) gsap.to(icono, { y: 0, scale: 1, duration: 0.2 });
  }

  onPick(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    input.value = ''; // permite volver a elegir el mismo archivo
    this.arrastrando = false;
    if (f) this.cambiarArchivo(f);
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando = false;
    this.soltarPulso();
    if (this.analizando) return;
    const f = ev.dataTransfer?.files?.[0];
    if (f && /\.(xlsx|csv)$/i.test(f.name)) {
      this.cambiarArchivo(f);
    } else {
      this.sacudirDropzone();
      this.toast.warn('Archivo inválido', 'Tiene que ser .xlsx o .csv.');
    }
  }

  /** La nube (o el archivo anterior) sale hacia arriba y entra la tarjeta del archivo nuevo. */
  private cambiarArchivo(f: File): void {
    const salientes = [this.el('dz-icono'), this.el('dz-texto')].filter((x): x is HTMLElement => !!x);
    if (this.reducirMovimiento || salientes.length === 0) {
      this.archivo = f;
      return;
    }
    gsap.to(salientes, {
      y: -18,
      opacity: 0,
      duration: 0.18,
      ease: 'power2.in',
      onComplete: () => {
        this.archivo = f;
        afterNextRender(() => this.entrarTarjetaArchivo(), { injector: this.injector });
      },
    });
  }

  private entrarTarjetaArchivo(): void {
    const icono = this.el('dz-icono');
    const texto = this.el('dz-texto');
    if (icono) gsap.fromTo(icono, { scale: 0.5, opacity: 0, y: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.2)' });
    if (texto) gsap.fromTo(texto, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, delay: 0.08, ease: 'power2.out' });
  }

  private sacudirDropzone(): void {
    const zona = this.el('dropzone');
    if (!zona || this.reducirMovimiento) return;
    gsap.fromTo(zona, { x: 0 }, { keyframes: { x: [-10, 10, -7, 7, -3, 0] }, duration: 0.45, ease: 'power1.out' });
  }

  async descargarPlantilla(): Promise<void> {
    this.descargando = true;
    try {
      const blob = await this.api.descargarPlantillaProductos();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla-productos.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo descargar la plantilla.');
    } finally {
      this.descargando = false;
    }
  }

  // ── 2 · Progreso del análisis ─────────────────────────────────────
  private iniciarProcesando(): void {
    if (this.procesando()) return;
    if (this.fallbackProcesando) clearTimeout(this.fallbackProcesando);
    this.procesando.set(true);
    this.mensajeIdx.set(0);
    if (this.reducirMovimiento) {
      this.mensajesTimer = setInterval(() => this.mensajeIdx.update((i) => (i + 1) % this.mensajesAnalisis.length), 1600);
      return;
    }
    afterNextRender(() => {
      const barra = this.el('barra-indet');
      if (barra) {
        this.barraIndet = gsap.fromTo(barra, { xPercent: -100 }, { xPercent: 300, duration: 1.1, ease: 'power1.inOut', repeat: -1 });
      }
    }, { injector: this.injector });
    this.mensajesTimer = setInterval(() => {
      const msg = this.el('msg-analisis');
      if (!msg) return;
      gsap.to(msg, {
        y: -6,
        opacity: 0,
        duration: 0.15,
        onComplete: () => {
          this.mensajeIdx.update((i) => (i + 1) % this.mensajesAnalisis.length);
          gsap.fromTo(msg, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2 });
        },
      });
    }, 1600);
  }

  private detenerProgreso(): void {
    if (this.mensajesTimer) clearInterval(this.mensajesTimer);
    if (this.fallbackProcesando) clearTimeout(this.fallbackProcesando);
    this.mensajesTimer = null;
    this.fallbackProcesando = null;
    this.barraIndet?.kill();
    this.barraIndet = null;
    this.procesando.set(false);
    this.progresoSubida.set(0);
  }

  async analizar(): Promise<void> {
    if (!this.archivo) return;
    this.analizando = true;
    this.progresoSubida.set(0);
    this.procesando.set(false);
    // Si el navegador no reporta progreso de subida (archivo chico / sin total),
    // igual pasamos a "procesando" para no dejar la barra congelada en 0%.
    this.fallbackProcesando = setTimeout(() => this.iniciarProcesando(), 1200);
    try {
      const prev = await this.api.previsualizarImportacion(this.archivo, (pct) => {
        this.progresoSubida.set(pct);
        if (pct >= 100) this.iniciarProcesando();
      });
      this.detenerProgreso();
      await this.salirDeSubir();
      this.prev = prev;
      this.opcionesSitio = prev.catalogos.sitios.map((s) => ({ value: s.id_sitio, label: s.nombre }));
      this.opcionesCategoria = prev.catalogos.categorias.map((c) => ({ value: c.id_categoria, label: c.nombre }));
      this.filas = prev.filas.map((f) => ({
        ...f,
        id_categoria: '',
        id_sitio: f.id_sitio_sugerido ?? '',
      }));
      this.bulkTipo = '';
      this.bulkSitio = '';
      this.bulkCategoria = '';
      this.fase = 'revisar';
      afterNextRender(() => this.entrarARevisar(), { injector: this.injector });
      if (!prev.filas.length) {
        this.toast.warn('Sin filas', 'El archivo no tenía filas de datos utilizables.');
      }
    } catch (e) {
      this.detenerProgreso();
      this.toast.httpError(e, 'No se pudo leer el archivo.');
    } finally {
      this.analizando = false;
    }
  }

  // ── 3 · Transición subir → revisar ────────────────────────────────
  private salirDeSubir(): Promise<void> {
    const card = this.el('subir');
    if (!card || this.reducirMovimiento) return Promise.resolve();
    return new Promise((resolve) => {
      gsap.to(card, { y: -20, opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: () => resolve() });
    });
  }

  private entrarARevisar(): void {
    const leidas = this.filas.length;
    const aviso = this.conAviso;
    if (this.reducirMovimiento) {
      this.contLeidas.set(leidas);
      this.contAviso.set(aviso);
      return;
    }

    const secciones = this.host.querySelectorAll('[data-anim="seccion"]');
    gsap.from(secciones, { y: 18, opacity: 0, duration: 0.4, stagger: 0.08, ease: 'power2.out', clearProps: 'transform,opacity' });

    // Solo las primeras filas: animar las 200 no se ve y cuesta.
    const filas = Array.from(this.host.querySelectorAll('tbody tr')).slice(0, 12);
    gsap.from(filas, { x: -10, opacity: 0, duration: 0.3, stagger: 0.03, delay: 0.3, ease: 'power2.out', clearProps: 'transform,opacity' });

    // Sin clearProps: el ancho final es el que Angular ya puso en [style.width.%].
    const barra = this.el('barra-listas');
    if (barra) gsap.from(barra, { width: 0, duration: 0.8, delay: 0.3, ease: 'power2.out' });

    const proxy = { leidas: 0, aviso: 0 };
    this.contLeidas.set(0);
    this.contAviso.set(0);
    gsap.to(proxy, {
      leidas,
      aviso,
      duration: 0.9,
      delay: 0.15,
      ease: 'power2.out',
      onUpdate: () => {
        this.contLeidas.set(Math.round(proxy.leidas));
        this.contAviso.set(Math.round(proxy.aviso));
      },
    });
  }

  get haySeleccionLote(): boolean {
    return !!this.bulkTipo || !!this.bulkSitio || !!this.bulkCategoria;
  }

  /** Copia a TODAS las filas solo los selectores que el encargado cambió. */
  aplicarLote(): void {
    if (!this.haySeleccionLote) return;
    const campos: string[] = [];
    if (this.bulkTipo) campos.push('tipo');
    if (this.bulkSitio) campos.push('bodega');
    if (this.bulkCategoria) campos.push('categoría');
    const cols = [
      this.bulkTipo ? 'tipo' : null,
      this.bulkSitio ? 'bodega' : null,
      this.bulkCategoria ? 'categoria' : null,
    ].filter((c): c is string => !!c);
    const listasAntes = this.listas;
    for (const f of this.filas) {
      if (this.bulkTipo) f.tipo_material = this.bulkTipo as TipoMaterial;
      if (this.bulkSitio) f.id_sitio = this.bulkSitio;
      if (this.bulkCategoria) f.id_categoria = this.bulkCategoria;
    }
    this.toast.ok('Aplicado', `${campos.join(' y ')} en las ${this.filas.length} filas.`);
    this.bulkTipo = '';
    this.bulkSitio = '';
    this.bulkCategoria = '';
    if (!this.reducirMovimiento) {
      afterNextRender(() => this.animarAplicado(cols, listasAntes), { injector: this.injector });
    }
  }

  // ── 4 · "Aplicar a todas" ─────────────────────────────────────────
  /** Ola verde sobre las celdas cambiadas + contador de "listas" avanzando. */
  private animarAplicado(cols: string[], listasAntes: number): void {
    const selector = cols.map((c) => `tbody td[data-col="${c}"]`).join(',');
    // querySelectorAll devuelve las celdas en orden de documento (fila por
    // fila), así que el stagger baja como una ola; `amount` fija la duración
    // total sin importar si son 20 o 600 celdas.
    const celdas = this.host.querySelectorAll(selector);
    gsap.fromTo(
      celdas,
      { backgroundColor: 'rgba(57,169,0,0.22)' },
      {
        backgroundColor: 'rgba(57,169,0,0)',
        duration: 0.9,
        ease: 'power2.out',
        stagger: { amount: Math.min(1.2, celdas.length * 0.01) },
        clearProps: 'backgroundColor',
      },
    );

    const listasDespues = this.listas;
    if (listasDespues === listasAntes) return;
    const proxy = { v: listasAntes };
    this.listasVisibles.set(listasAntes);
    gsap.to(proxy, {
      v: listasDespues,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate: () => this.listasVisibles.set(Math.round(proxy.v)),
      onComplete: () => this.listasVisibles.set(null),
    });
  }

  async confirmar(): Promise<void> {
    if (this.pendientes > 0 || !this.filas.length) return;
    this.confirmando = true;
    try {
      const payload: FilaConfirmada[] = this.filas.map((f) => ({
        nombre: f.nombre,
        descripcion: f.descripcion,
        codigo_unspsc: f.codigo_unspsc,
        unidad_medida: f.unidad_medida,
        tipo_material: f.tipo_material as TipoMaterial,
        id_categoria: f.id_categoria,
        id_sitio: f.id_sitio || null,
        sku: f.sku?.trim() || undefined,
        marca: f.marca,
        modelo: f.modelo,
        stock_minimo: Number(f.stock_minimo) || 0,
        cantidad: Math.max(0, Math.floor(Number(f.cantidad) || 0)),
        codigo_lote: f.codigo_lote,
        fecha_vencimiento: f.fecha_vencimiento,
        fila_origen: f.fila,
      }));
      this.resultado = await this.api.confirmarImportacion(payload);
      this.fase = 'resultado';
      afterNextRender(() => this.entrarAResultado(), { injector: this.injector });
      const { productos_creados, stock_agregado, errores } = this.resultado;
      if (errores.length === 0) {
        this.toast.ok('Importación completa', `${productos_creados} producto(s), ${stock_agregado} de stock.`);
      } else {
        this.toast.warn('Importación con errores', `${errores.length} fila(s) fallaron — revisá el detalle.`);
      }
    } catch (e) {
      this.toast.httpError(e, 'No se pudo registrar la importación.');
    } finally {
      this.confirmando = false;
    }
  }

  // ── 5 · Resultado ─────────────────────────────────────────────────
  /** El ✓ se dibuja, las tarjetas entran y los números suben desde 0. */
  private entrarAResultado(): void {
    const r = this.resultado;
    if (!r) return;
    const finales = { total: r.total, productos: r.productos_creados, stock: r.stock_agregado, errores: r.errores.length };
    const fijar = (p: typeof finales) => {
      this.resTotal.set(Math.round(p.total));
      this.resProductos.set(Math.round(p.productos));
      this.resStock.set(Math.round(p.stock));
      this.resErrores.set(Math.round(p.errores));
    };
    if (this.reducirMovimiento) {
      fijar(finales);
      return;
    }

    const tarjetas = this.host.querySelectorAll('[data-anim="res-card"]');
    gsap.from(tarjetas, { y: 14, opacity: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out', clearProps: 'transform,opacity' });

    const icono = this.el('res-icono');
    if (icono) gsap.from(icono, { scale: 0.4, opacity: 0, duration: 0.5, ease: 'back.out(2.4)', clearProps: 'transform,opacity' });

    const check = this.host.querySelector<SVGPathElement>('[data-anim="check-path"]');
    if (check) {
      const largo = check.getTotalLength();
      gsap.fromTo(check,
        { strokeDasharray: largo, strokeDashoffset: largo },
        { strokeDashoffset: 0, duration: 0.55, delay: 0.2, ease: 'power2.out' });
    }

    const proxy = { total: 0, productos: 0, stock: 0, errores: 0 };
    fijar(proxy);
    gsap.to(proxy, { ...finales, duration: 1, delay: 0.25, ease: 'power2.out', onUpdate: () => fijar(proxy) });
  }

  volver(): void {
    this.fase = 'subir';
    this.archivo = null;
    this.prev = null;
    this.filas = [];
    this.resultado = null;
    if (!this.reducirMovimiento) {
      afterNextRender(() => {
        const card = this.el('subir');
        if (card) gsap.from(card, { y: 16, opacity: 0, duration: 0.35, ease: 'power2.out', clearProps: 'transform,opacity' });
      }, { injector: this.injector });
    }
  }

  copiarErrores(): void {
    if (!this.resultado) return;
    const txt = this.resultado.errores.map((e) => `Fila ${e.fila}: ${e.error}`).join('\n');
    navigator.clipboard?.writeText(txt).then(
      () => this.toast.ok('Errores copiados'),
      () => this.toast.warn('No se pudo copiar', 'Copialos a mano.'),
    );
  }
}
