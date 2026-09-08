import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';
import {
  MaterialesApiService,
  ResultadoImportacion,
  ResultadoPrevisualizacion,
  FilaImportacion,
  FilaConfirmada,
  TipoMaterial,
} from '../../core/services/materiales/materiales-api.service';

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
 * Ruta gateada por `materiales.productos.crear`.
 */
@Component({
  selector: 'app-materiales-importar',
  standalone: true,
  imports: [RouterLink, FormsModule],
  styles: [`
    :host { display:block; }
    .card { background:#fff; border:1px solid rgb(226 232 240 / .8); border-radius:1rem; }
    .field { border:1px solid #e2e8f0; border-radius:.5rem; font-size:.8125rem; padding:.375rem .5rem; background:#fff; transition:border-color .15s, box-shadow .15s; }
    .field:focus { outline:none; border-color:#39A900; box-shadow:0 0 0 3px rgb(57 169 0 / .12); }
    .field--warn { border-color:#fbbf24; background:#fffdf5; }
    select.field { padding-right:1.6rem; -webkit-appearance:none; appearance:none;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat:no-repeat; background-position:right .35rem center; }
    .btn-primary { display:inline-flex; align-items:center; justify-content:center; background:#39A900; color:#fff; border-radius:.625rem; font-weight:600; text-decoration:none; transition:background .15s, opacity .15s; }
    .btn-primary:hover:not(:disabled) { background:#2d8000; }
    .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
    .btn-ghost { display:inline-flex; align-items:center; justify-content:center; border:1px solid #e2e8f0; border-radius:.625rem; color:#475569; font-weight:500; background:#fff; text-decoration:none; transition:border-color .15s, color .15s; }
    .btn-ghost:hover:not(:disabled) { border-color:#39A900; color:#2d8000; }
    .dropzone { border-color:#e2e8f0; }
    .dropzone--drag { border-color:#39A900; background:rgb(57 169 0 / .06); }
    .dropzone--file { border-color:rgb(57 169 0 / .4); background:rgb(57 169 0 / .035); }
    tbody tr.row-warn { box-shadow: inset 3px 0 0 #fbbf24; background:rgb(255 251 235 / .35); }
    tbody tr:hover { background:rgb(248 250 252 / .8); }
    thead { background:rgb(248 250 252 / .95); }
    .revisar-shell { display:flex; flex-direction:column; height:calc(100dvh - 7rem); }
    @media (max-width:640px){ .revisar-shell { height:auto; } }
  `],
  template: `
    <div class="p-6 mx-auto" [class.max-w-xl]="fase === 'subir'" [class.max-w-7xl]="fase !== 'subir'" [class.revisar-shell]="fase === 'revisar'">

      <header class="mb-4 shrink-0">
        <h1 class="text-[1.35rem] font-bold text-gray-900 tracking-tight">Importar productos</h1>
        <p class="text-sm text-gray-500 mt-0.5">
          Carga masiva desde Excel o CSV. Siempre revisás un resumen antes de que se registre nada.
        </p>
      </header>

      <!-- ═══════════════ PASO 1 · SUBIR ═══════════════ -->
      @if (fase === 'subir') {
        <div class="card p-6 shadow-sm">
          <label
            class="dropzone group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors"
            [class.dropzone--drag]="arrastrando"
            [class.dropzone--file]="archivo && !arrastrando"
            (dragover)="$event.preventDefault(); arrastrando = true"
            (dragleave)="arrastrando = false"
            (drop)="onDrop($event)">
            <input type="file" accept=".xlsx,.csv" class="hidden" (change)="onPick($event)" />

            @if (archivo) {
              <span class="grid place-items-center w-12 h-12 rounded-full bg-green-50 text-green-700">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/></svg>
              </span>
              <div>
                <p class="text-sm font-semibold text-gray-800">{{ archivo.name }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ (archivo.size / 1024).toFixed(0) }} KB · hacé clic para cambiarlo</p>
              </div>
            } @else {
              <span class="grid place-items-center w-12 h-12 rounded-full bg-gray-100 text-gray-400 group-hover:bg-green-50 group-hover:text-green-700 transition-colors">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 13v8"/><path d="m8 17 4-4 4 4"/><path d="M20 16.7A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>
              </span>
              <div>
                <p class="text-sm font-medium text-gray-600">Arrastrá tu archivo acá o <span class="text-green-700 font-semibold">elegilo</span></p>
                <p class="text-xs text-gray-400 mt-0.5">.xlsx o .csv · hasta 500 filas</p>
              </div>
            }
          </label>

          <button (click)="analizar()" [disabled]="!archivo || analizando"
            class="btn-primary w-full mt-4 py-2.5 text-sm flex items-center justify-center gap-2">
            @if (analizando) {
              <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Analizando…
            } @else {
              Analizar archivo
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            }
          </button>

          <div class="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs">
            <span class="text-gray-400">¿No tenés el formato?</span>
            <button (click)="descargarPlantilla()" [disabled]="descargando"
              class="inline-flex items-center gap-1.5 text-gray-500 hover:text-green-700 font-medium disabled:opacity-60 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
              {{ descargando ? 'Generando…' : 'Descargar plantilla' }}
            </button>
          </div>
        </div>

        <div class="mt-5 grid grid-cols-3 gap-3">
          @for (p of pasos; track p.n) {
            <div class="card px-3 py-3 flex items-start gap-2.5">
              <span class="flex-none grid place-items-center w-6 h-6 rounded-full text-[11px] font-bold"
                [class]="p.n === 1 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'">{{ p.n }}</span>
              <div>
                <p class="text-xs font-semibold text-gray-700 leading-tight">{{ p.t }}</p>
                <p class="text-[11px] text-gray-400 leading-tight mt-0.5">{{ p.d }}</p>
              </div>
            </div>
          }
        </div>
      }

      <!-- ═══════════════ PASO 2 · REVISAR ═══════════════ -->
      @if (fase === 'revisar' && prev) {
        <!-- resumen -->
        <div class="card px-4 py-3 shadow-sm mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <div class="flex items-center gap-2 min-w-0">
            <svg class="flex-none text-gray-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            <span class="text-sm font-semibold text-gray-800 truncate">{{ prev.archivo }}</span>
          </div>

          <div class="flex items-center gap-1.5 text-xs">
            <span class="inline-flex items-center rounded-full bg-gray-100 text-gray-600 font-medium px-2 py-0.5">{{ filas.length }} leídas</span>
            @if (conAviso > 0) {
              <span class="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium px-2 py-0.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                {{ conAviso }} con aviso
              </span>
            }
          </div>

          <div class="flex items-center gap-2 ml-auto">
            <div class="hidden sm:flex items-center gap-2">
              <div class="w-28 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div class="h-full rounded-full transition-all duration-300"
                  [class]="listas === filas.length ? 'bg-green-500' : 'bg-amber-400'"
                  [style.width.%]="filas.length ? (listas / filas.length) * 100 : 0"></div>
              </div>
              <span class="text-xs font-medium tabular-nums"
                [class]="listas === filas.length ? 'text-green-700' : 'text-gray-500'">{{ listas }}/{{ filas.length }} listas</span>
            </div>
            <button (click)="volver()" class="btn-ghost px-2.5 py-1 text-xs">← Otro archivo</button>
          </div>
        </div>

        @if (prev.errores.length) {
          <div class="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 mb-3 text-sm">
            <p class="font-medium text-amber-800 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              {{ prev.errores.length }} fila(s) del archivo se ignoraron
            </p>
            <ul class="list-disc ml-6 mt-1 text-xs text-amber-700 space-y-0.5">
              @for (e of prev.errores; track e.fila) { <li>Fila {{ e.fila }}: {{ e.error }}</li> }
            </ul>
          </div>
        }

        <!-- completar en lote -->
        <div class="card px-4 py-3 mb-3">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Completar en lote</p>
          <div class="flex flex-wrap items-end gap-x-4 gap-y-3">
            <div class="flex flex-col gap-1">
              <label class="text-[11px] font-medium text-gray-500">Tipo de material</label>
              <select [(ngModel)]="bulkTipo" class="field w-40">
                <option value="">— sin cambiar —</option>
                <option value="CONSUMO">Consumo</option>
                <option value="DEVOLUTIVO">Devolutivo</option>
                <option value="PERECEDERO">Perecedero</option>
              </select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-[11px] font-medium text-gray-500">Bodega</label>
              <select [(ngModel)]="bulkSitio" class="field w-48">
                <option value="">— sin cambiar —</option>
                @for (s of prev.catalogos.sitios; track s.id_sitio) { <option [value]="s.id_sitio">{{ s.nombre }}</option> }
              </select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-[11px] font-medium text-gray-500">Categoría</label>
              <select [(ngModel)]="bulkCategoria" class="field w-48">
                <option value="">— sin cambiar —</option>
                @for (c of prev.catalogos.categorias; track c.id_categoria) { <option [value]="c.id_categoria">{{ c.nombre }}</option> }
              </select>
            </div>
            <button (click)="aplicarLote()" [disabled]="!haySeleccionLote"
              class="btn-primary px-4 py-1.5 text-xs">Aplicar a todas</button>
          </div>
          <p class="text-[11px] text-gray-400 mt-2">
            Copia a todas las filas solo los campos que hayas cambiado; los que queden en «— sin cambiar —» no se tocan.
          </p>
        </div>

        <!-- tabla -->
        <div class="card overflow-hidden shadow-sm flex-1 min-h-0 flex flex-col">
          <div class="overflow-auto flex-1 min-h-0">
            <table class="w-full text-sm min-w-[1060px] border-collapse">
              <thead class="text-[11px] uppercase tracking-wide text-gray-400 text-left">
                <tr class="border-b border-gray-200">
                  <th class="px-2.5 py-2.5 font-semibold w-9">#</th>
                  <th class="px-2.5 py-2.5 font-semibold">Producto</th>
                  <th class="px-2.5 py-2.5 font-semibold w-20">UNSPSC</th>
                  <th class="px-2.5 py-2.5 font-semibold w-14">Unidad</th>
                  <th class="px-2.5 py-2.5 font-semibold w-16 text-right">Cant.</th>
                  <th class="px-2.5 py-2.5 font-semibold w-32">Tipo <span class="text-amber-500">*</span></th>
                  <th class="px-2.5 py-2.5 font-semibold w-40">Bodega</th>
                  <th class="px-2.5 py-2.5 font-semibold w-40">Categoría <span class="text-amber-500">*</span></th>
                  <th class="px-2.5 py-2.5 font-semibold w-28">SKU</th>
                  <th class="px-2 py-2.5 font-semibold w-7"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (f of filas; track f.fila) {
                  <tr [class.row-warn]="!f.tipo_material || !f.id_categoria">
                    <td class="px-2.5 py-2 text-gray-300 tabular-nums">{{ f.fila }}</td>
                    <td class="px-2.5 py-2 max-w-[300px]">
                      <div class="font-medium text-gray-800 leading-tight truncate">{{ f.nombre }}</div>
                      @if (f.descripcion) {
                        <div class="text-[11px] text-gray-400 truncate" [title]="f.descripcion">{{ f.descripcion }}</div>
                      }
                    </td>
                    <td class="px-2.5 py-2 text-gray-500 tabular-nums">{{ f.codigo_unspsc || '—' }}</td>
                    <td class="px-2.5 py-2 text-gray-500">{{ f.unidad_medida }}</td>
                    <td class="px-2.5 py-2">
                      <input type="number" min="0" [(ngModel)]="f.cantidad" class="field w-16 text-right tabular-nums" />
                    </td>
                    <td class="px-2.5 py-2">
                      <select [(ngModel)]="f.tipo_material" class="field w-full" [class.field--warn]="!f.tipo_material">
                        <option [ngValue]="null">— elegí —</option>
                        <option [ngValue]="'CONSUMO'">Consumo</option>
                        <option [ngValue]="'DEVOLUTIVO'">Devolutivo</option>
                        <option [ngValue]="'PERECEDERO'">Perecedero</option>
                      </select>
                    </td>
                    <td class="px-2.5 py-2">
                      <select [(ngModel)]="f.id_sitio" class="field w-full">
                        <option value="">— sin bodega —</option>
                        @for (s of prev.catalogos.sitios; track s.id_sitio) { <option [value]="s.id_sitio">{{ s.nombre }}</option> }
                      </select>
                    </td>
                    <td class="px-2.5 py-2">
                      <select [(ngModel)]="f.id_categoria" class="field w-full" [class.field--warn]="!f.id_categoria">
                        <option value="">— elegí —</option>
                        @for (c of prev.catalogos.categorias; track c.id_categoria) { <option [value]="c.id_categoria">{{ c.nombre }}</option> }
                      </select>
                    </td>
                    <td class="px-2.5 py-2">
                      <input type="text" [(ngModel)]="f.sku" class="field w-28 font-mono text-xs bg-gray-50/60" />
                    </td>
                    <td class="px-2 py-2 text-center">
                      @if (f.advertencias.length) {
                        <span class="inline-grid place-items-center w-5 h-5 rounded-full bg-amber-100 text-amber-600 cursor-help align-middle"
                          [title]="f.advertencias.join('\n')">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/></svg>
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
        <div class="card mt-3 px-4 py-3 flex items-center gap-3 shrink-0">
          @if (pendientes > 0) {
            <span class="text-xs text-amber-600 flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              Faltan <b>{{ pendientes }}</b> fila(s) con tipo o categoría sin elegir
            </span>
          } @else {
            <span class="text-xs text-green-700 flex items-center gap-1.5 font-medium">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              Todo listo para registrar
            </span>
          }
          <button (click)="confirmar()" [disabled]="pendientes > 0 || confirmando || !filas.length"
            class="btn-primary ml-auto px-5 py-2 text-sm flex items-center gap-2">
            @if (confirmando) {
              <svg class="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Registrando…
            } @else {
              Confirmar y registrar ({{ filas.length }})
            }
          </button>
        </div>
      }

      <!-- ═══════════════ RESULTADO ═══════════════ -->
      @if (fase === 'resultado' && resultado) {
        <div class="max-w-2xl">
          <div class="card p-4 mb-4 flex items-center gap-3"
            [class.bg-red-50]="resultado.errores.length">
            <span class="flex-none grid place-items-center w-11 h-11 rounded-full"
              [class]="resultado.errores.length ? 'bg-amber-100 text-amber-600' : 'bg-green-50 text-green-700'">
              @if (resultado.errores.length) {
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              } @else {
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
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

          <div class="grid grid-cols-4 gap-3 mb-4">
            <div class="card p-3">
              <div class="text-2xl font-bold text-gray-700 tabular-nums">{{ resultado.total }}</div>
              <div class="text-[11px] text-gray-400 font-medium mt-0.5">Filas</div>
            </div>
            <div class="card p-3 border-green-200 bg-green-50">
              <div class="text-2xl font-bold text-green-700 tabular-nums">{{ resultado.productos_creados }}</div>
              <div class="text-[11px] text-green-700/80 font-medium mt-0.5">Productos</div>
            </div>
            <div class="card p-3 border-blue-100 bg-blue-50/60">
              <div class="text-2xl font-bold text-blue-600 tabular-nums">{{ resultado.stock_agregado }}</div>
              <div class="text-[11px] text-blue-600/80 font-medium mt-0.5">Stock</div>
            </div>
            <div class="card p-3" [class]="resultado.errores.length ? 'border-red-100 bg-red-50/60' : ''">
              <div class="text-2xl font-bold tabular-nums" [class]="resultado.errores.length ? 'text-red-600' : 'text-gray-300'">{{ resultado.errores.length }}</div>
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

          <div class="mt-5 flex gap-3">
            <a routerLink="/materiales/productos" class="btn-primary px-4 py-2 text-sm">Ver productos</a>
            <button (click)="volver()" class="btn-ghost px-4 py-2 text-sm">Importar otro archivo</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class MaterialesImportarComponent {
  fase: 'subir' | 'revisar' | 'resultado' = 'subir';

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

  readonly pasos = [
    { n: 1, t: 'Subís el archivo', d: 'Excel de la entrega o la plantilla' },
    { n: 2, t: 'Revisás y ajustás', d: 'Tipo, bodega y categoría por fila' },
    { n: 3, t: 'Confirmás', d: 'Recién ahí se registra todo' },
  ];

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  get pendientes(): number {
    return this.filas.filter((f) => !f.tipo_material || !f.id_categoria).length;
  }
  get listas(): number {
    return this.filas.length - this.pendientes;
  }
  get conAviso(): number {
    return this.filas.filter((f) => f.advertencias.length > 0).length;
  }

  onPick(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.archivo = input.files?.[0] ?? null;
    this.arrastrando = false;
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando = false;
    const f = ev.dataTransfer?.files?.[0];
    if (f && /\.(xlsx|csv)$/i.test(f.name)) {
      this.archivo = f;
    } else {
      this.toast.warn('Archivo inválido', 'Tiene que ser .xlsx o .csv.');
    }
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

  async analizar(): Promise<void> {
    if (!this.archivo) return;
    this.analizando = true;
    try {
      const prev = await this.api.previsualizarImportacion(this.archivo);
      this.prev = prev;
      this.filas = prev.filas.map((f) => ({
        ...f,
        id_categoria: '',
        id_sitio: f.id_sitio_sugerido ?? '',
      }));
      this.bulkTipo = '';
      this.bulkSitio = '';
      this.bulkCategoria = '';
      this.fase = 'revisar';
      if (!prev.filas.length) {
        this.toast.warn('Sin filas', 'El archivo no tenía filas de datos utilizables.');
      }
    } catch (e) {
      this.toast.httpError(e, 'No se pudo leer el archivo.');
    } finally {
      this.analizando = false;
    }
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
    for (const f of this.filas) {
      if (this.bulkTipo) f.tipo_material = this.bulkTipo as TipoMaterial;
      if (this.bulkSitio) f.id_sitio = this.bulkSitio;
      if (this.bulkCategoria) f.id_categoria = this.bulkCategoria;
    }
    this.toast.ok('Aplicado', `${campos.join(' y ')} en las ${this.filas.length} filas.`);
    this.bulkTipo = '';
    this.bulkSitio = '';
    this.bulkCategoria = '';
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

  volver(): void {
    this.fase = 'subir';
    this.archivo = null;
    this.prev = null;
    this.filas = [];
    this.resultado = null;
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
