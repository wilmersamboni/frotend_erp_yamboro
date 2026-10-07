import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ClaseSalida,
  ConfigSalida,
  EstadoSalida,
  MaterialesApiService,
  OpcionesSalida,
  SalidaDetalle,
  SalidaResumen,
  TipoDestinoSalida,
} from '../data-access/materiales-api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { log } from '../../../core/utils/log';
import { construirExcel, descargarLibro, lineasPorFormato } from './salida-export.util';
import { HojaVista, hojaAVista } from './vista-previa-excel';
import type { Workbook } from 'exceljs';

type TipoLinea = 'lote' | 'item';

interface LineaForm {
  /** lote = consumible, item = unidad devolutiva. Sin valor: lo que diga la clase de la salida. */
  tipo?: TipoLinea;
  clave: string | null; // id_lote (consumo) o id_item (devolutivo)
  cantidad: number;
  valor: number | null;
  serial: string;
  /** La cantidad se bajó al máximo libre del lote (para avisarlo). */
  ajustada?: boolean;
}

const ESTILO_ESTADO: Record<EstadoSalida, string> = {
  PENDIENTE: 'bg-amber-50 text-amber-700 border-amber-200',
  APROBADA: 'bg-green-50 text-green-700 border-green-200',
  RECHAZADA: 'bg-red-50 text-red-700 border-red-200',
  CANCELADA: 'bg-gray-100 text-gray-500 border-gray-200',
  REGRESADA: 'bg-blue-50 text-blue-700 border-blue-200',
};
interface Hito {
  titulo: string;
  detalle: string;
  estado: 'hecho' | 'actual' | 'pendiente' | 'error';
}

/** Minúsculas y sin tildes, para buscar. */
const normalizar = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const MEDIOS = ['Automóvil', 'Camioneta', 'Camión', 'Bus', 'Moto', 'Otro'];

/**
 * Salidas de material (2026-10-05). Consumible: salida permanente, para uno
 * mismo o como intermediario de otra persona (quizá de otra sede, fuera del
 * ERP), la aprueba el administrador. Devolutivo: despacho con valor asegurado
 * y reporte de póliza (Excel), lo aprueba el jefe inmediato elegido; las
 * unidades quedan fuera de la sede hasta que se registre su regreso.
 */
@Component({
  selector: 'app-materiales-salidas',
  standalone: true,
  imports: [DialogDirective, FormsModule, SearchableSelectComponent],
  template: `
    <div class="p-4 md:p-6 space-y-4">
      <!-- Encabezado -->
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-xl font-bold text-gray-900">Salidas de Material</h1>
          <p class="text-sm text-gray-500">Lo que sale de la sede: consumibles, que no vuelven, y devolutivos, que llevan el reporte de póliza y pueden regresar o no.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          @if (esAdmin()) {
            <button type="button" (click)="abrirConfig()"
              class="px-3 py-2 rounded-full text-sm font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400">Datos de la póliza</button>
          }
          @if (puedeCrear()) {
            <button type="button" (click)="abrirNueva()"
              class="px-4 py-2 rounded-full text-sm font-semibold text-white" style="background-color: var(--accent-brand)">+ Nueva salida</button>
          }
        </div>
      </div>

      <!-- Contadores por estado (también filtran) -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        @for (k of tarjetas; track k.valor) {
          <button type="button" (click)="filtro.set(filtro() === k.valor ? '' : k.valor)"
            class="text-left rounded-2xl border px-4 py-3 transition-colors"
            [class]="filtro() === k.valor ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:border-gray-300'">
            <p class="text-[11px] font-semibold uppercase tracking-wide" [class]="filtro() === k.valor ? 'text-white/70' : 'text-gray-400'">{{ k.label }}</p>
            <p class="text-2xl font-bold leading-tight mt-0.5">{{ conteos()[k.valor] }}</p>
            <p class="text-[11px] mt-0.5" [class]="filtro() === k.valor ? 'text-white/70' : 'text-gray-400'">{{ k.ayuda }}</p>
          </button>
        }
      </div>

      <!-- Búsqueda y filtros -->
      <div class="flex flex-col md:flex-row md:items-center gap-2">
        <input type="search" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" placeholder="Buscar por código, persona, bodega o destino…"
          class="w-full md:max-w-sm px-3 py-2 border border-gray-200 rounded-full text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
        <div class="flex flex-wrap gap-1.5">
          @for (c of filtrosClase; track c.valor) {
            <button type="button" (click)="claseFiltro.set(c.valor)"
              class="px-3 py-1.5 rounded-full text-xs font-semibold border"
              [class]="claseFiltro() === c.valor ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'">{{ c.label }}</button>
          }
          <span class="w-px bg-gray-200 mx-1 hidden md:block"></span>
          @for (f of filtros; track f.valor) {
            <button type="button" (click)="filtro.set(f.valor)"
              class="px-3 py-1.5 rounded-full text-xs font-semibold border"
              [class]="filtro() === f.valor ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'">{{ f.label }}</button>
          }
        </div>
      </div>

      @if (cargando()) {
        <div class="space-y-2">
          @for (i of [1, 2, 3]; track i) { <div class="h-[74px] rounded-2xl bg-gray-100 animate-pulse"></div> }
        </div>
      } @else if (error()) {
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{{ error() }}</span>
          <button type="button" (click)="cargar()" class="font-semibold underline">Reintentar</button>
        </div>
      } @else if (visibles().length === 0) {
        <div class="rounded-2xl border border-dashed border-gray-300 bg-white py-12 px-4 text-center">
          @if (salidas().length === 0) {
            <p class="text-sm font-semibold text-gray-700">Todavía no hay salidas</p>
            <p class="text-xs text-gray-500 mt-1">Registra aquí el material que sale de la sede para que quede quién lo sacó y para quién fue.</p>
            @if (puedeCrear()) {
              <button type="button" (click)="abrirNueva()" class="mt-4 px-4 py-2 rounded-full text-sm font-semibold text-white" style="background-color: var(--accent-brand)">Registrar la primera</button>
            }
          } @else {
            <p class="text-sm font-semibold text-gray-700">Ninguna salida coincide</p>
            <button type="button" (click)="limpiarFiltros()" class="mt-2 text-xs font-semibold text-[#2d8000] hover:underline">Quitar filtros</button>
          }
        </div>
      } @else {
        <p class="text-xs text-gray-400">{{ visibles().length }} de {{ salidas().length }} salida(s)</p>
        <ul class="space-y-2">
          @for (s of visibles(); track s.id_salida) {
            <li class="rounded-2xl border bg-white transition-shadow" [class]="detalle()?.id_salida === s.id_salida ? 'border-gray-300 shadow-sm' : 'border-gray-200'">
              <button type="button" (click)="alternarDetalle(s)" [attr.aria-expanded]="detalle()?.id_salida === s.id_salida"
                class="w-full text-left flex items-center gap-3 px-4 py-3">
                <span class="shrink-0 w-10 h-10 rounded-xl grid place-items-center text-[11px] font-bold" [class]="estiloClase(s)">{{ s.clase === 'CONSUMO' ? 'CON' : s.clase === 'MIXTA' ? 'MIX' : 'DEV' }}</span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-gray-900 flex flex-wrap items-center gap-x-2">
                    {{ s.codigo }}
                    <span class="font-medium text-gray-500">{{ etiquetaClase(s) }}</span>
                  </p>
                  <p class="text-xs text-gray-500 mt-0.5 sm:truncate">
                    {{ s.sitio_nombre || 'Bodega' }} → <strong class="font-semibold text-gray-700">{{ destinoCorto(s) }}</strong>
                    · {{ s.solicitante_nombre || 'Alguien' }} · {{ fecha(s.fecha) }}
                  </p>
                  <span class="sm:hidden inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border" [class]="estilo(s.estado)">{{ estadoLabel(s) }}</span>
                </div>
                <div class="shrink-0 hidden sm:flex flex-col items-end gap-1">
                  <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold border" [class]="estilo(s.estado)">{{ estadoLabel(s) }}</span>
                  <span class="text-[11px] text-gray-400">{{ s.lineas_count }} {{ s.lineas_count === 1 ? 'línea' : 'líneas' }}@if (s.con_regreso && s.valor_total) { · {{ moneda(s.valor_total) }} }</span>
                </div>
                <span class="shrink-0 text-gray-300 transition-transform" [class.rotate-90]="detalle()?.id_salida === s.id_salida" aria-hidden="true">›</span>
              </button>

              @if (detalle()?.id_salida === s.id_salida) {
                @let d = detalle()!;
                <div class="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">
                  <!-- Línea de tiempo -->
                  <ol class="flex flex-col sm:flex-row gap-2 sm:gap-0">
                    @for (h of hitos(d); track h.titulo; let ultimo = $last) {
                      <li class="flex sm:flex-col sm:flex-1 items-start gap-2 sm:gap-1.5">
                        <div class="flex sm:w-full items-center">
                          <span class="w-3 h-3 rounded-full border-2 shrink-0" [class]="puntoHito(h.estado)"></span>
                          @if (!ultimo) { <span class="hidden sm:block h-0.5 flex-1 mx-1" [class]="h.estado === 'hecho' ? 'bg-green-500' : 'bg-gray-200'"></span> }
                        </div>
                        <div class="min-w-0 -mt-0.5 sm:mt-0">
                          <p class="text-xs font-semibold" [class]="h.estado === 'error' ? 'text-red-700' : h.estado === 'pendiente' ? 'text-gray-400' : 'text-gray-800'">{{ h.titulo }}</p>
                          <p class="text-[11px] text-gray-500">{{ h.detalle }}</p>
                        </div>
                      </li>
                    }
                  </ol>

                  <div class="rounded-xl bg-gray-50 px-3 py-2.5">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Motivo</p>
                    <p class="text-sm text-gray-700 mt-0.5">{{ d.motivo }}</p>
                  </div>

                  <dl class="grid gap-3 grid-cols-2 lg:grid-cols-4 text-xs">
                    <div><dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Sale de</dt><dd class="text-gray-800 mt-0.5">{{ d.sitio_nombre || '—' }}</dd></div>
                    <div><dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Recibe</dt>
                      <dd class="text-gray-800 mt-0.5">
                        @if (d.tipo_destino === 'TERCERO') {
                          {{ d.dest_nombre }}<span class="block text-gray-500">{{ [d.dest_documento ? 'doc. ' + d.dest_documento : '', d.dest_cargo, d.dest_sede].filter(esTexto).join(' · ') }}</span>
                        } @else { {{ d.solicitante_nombre }} <span class="text-gray-500">(uso propio)</span> }
                      </dd>
                    </div>
                    @if (d.con_regreso) {
                      <div><dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Destino y transporte</dt><dd class="text-gray-800 mt-0.5">{{ d.lugar_destino }} · {{ d.medio_transporte }}</dd></div>
                      <div><dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Valor asegurado</dt><dd class="text-gray-800 mt-0.5 font-semibold">{{ moneda(d.valor_total) }}</dd></div>
                      <div><dt class="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Jefe inmediato</dt><dd class="text-gray-800 mt-0.5">{{ d.jefe_nombre || '—' }}</dd></div>
                    }
                    @if (d.motivo_rechazo) {
                      <div class="col-span-2 lg:col-span-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-red-700"><dt class="inline font-semibold">Motivo del rechazo:</dt> <dd class="inline">{{ d.motivo_rechazo }}</dd></div>
                    }
                  </dl>

                  <div class="overflow-x-auto rounded-xl border border-gray-100">
                    <table class="w-full text-xs">
                      <thead class="bg-gray-50 text-gray-500 uppercase text-[11px]">
                        <tr>
                          <th class="text-left px-3 py-2 w-8">#</th>
                          <th class="text-left px-3 py-2">Material</th>
                          <th class="text-left px-3 py-2">{{ d.clase === 'CONSUMO' ? 'Lote' : d.clase === 'DEVOLUTIVO' ? 'Placa / serial' : 'Lote / placa' }}</th>
                          <th class="text-right px-3 py-2">Cantidad</th>
                          @if (d.con_regreso) {
                            <th class="text-left px-3 py-2">Cuentadante</th>
                            <th class="text-right px-3 py-2">Valor</th>
                          }
                        </tr>
                      </thead>
                      <tbody>
                        @for (l of d.lineas; track l.id_linea; let i = $index) {
                          <tr class="border-t border-gray-100">
                            <td class="px-3 py-2 text-gray-400">{{ i + 1 }}</td>
                            <td class="px-3 py-2"><span class="font-medium text-gray-800">{{ l.producto_nombre }}</span>
                              @if (l.marca || l.modelo) { <span class="block text-gray-400">{{ [l.marca, l.modelo].filter(esTexto).join(' · ') }}</span> }
                            </td>
                            <td class="px-3 py-2">
                              @if (l.id_lote) { {{ l.codigo_lote || '—' }} }
                              @else if (l.placa_sena || l.serial) { {{ [l.placa_sena, l.serial].filter(esTexto).join(' / ') }} }
                              @else { <span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold">SIN PLACA</span> }
                            </td>
                            <td class="px-3 py-2 text-right whitespace-nowrap">{{ l.cantidad }} {{ l.id_lote ? (l.unidad_medida || '').toLowerCase() : '' }}</td>
                            @if (d.con_regreso) {
                              <td class="px-3 py-2">{{ l.cuentadante_nombre || '—' }}</td>
                              <td class="px-3 py-2 text-right whitespace-nowrap">{{ moneda(l.valor_unitario) }}</td>
                            }
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>

                  <!-- Acciones -->
                  <div class="flex flex-wrap items-center gap-2">
                    @if (d.puede_resolver) {
                      <button type="button" (click)="aprobar(s)" [disabled]="enviando()"
                        class="px-4 py-2 rounded-full text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">Aprobar</button>
                      <button type="button" (click)="rechazando.set(!rechazando())"
                        class="px-4 py-2 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-red-300 hover:text-red-600">Rechazar</button>
                    }
                    @if (d.estado === 'PENDIENTE' && d.id_usuario_solicita === miId()) {
                      <button type="button" (click)="cancelar(s)" [disabled]="enviando()"
                        class="px-4 py-2 rounded-full text-xs font-semibold border border-gray-200 text-gray-600 bg-white hover:border-gray-400">Cancelar mi salida</button>
                    }
                    @if (d.con_regreso && d.estado === 'APROBADA') {
                      <button type="button" (click)="regreso(s)" [disabled]="enviando()"
                        class="px-4 py-2 rounded-full text-xs font-semibold border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100">Registrar regreso</button>
                    }
                    @if (d.estado === 'APROBADA' || d.estado === 'REGRESADA') {
                      <button type="button" (click)="previsualizar(s)" [disabled]="enviando()"
                        class="sm:ml-auto inline-flex items-center px-4 py-2 rounded-full text-xs font-semibold border border-gray-200 text-gray-700 bg-white hover:border-gray-400 disabled:opacity-50">Vista previa</button>
                      <button type="button" (click)="descargar(s)" [disabled]="enviando()" [title]="formatoDescarga(d).ayuda"
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border border-green-200 text-[#1d6f42] bg-green-50 hover:bg-green-100 disabled:opacity-50">
                        Descargar Excel <span class="font-normal text-green-700/70">· {{ formatoDescarga(d).nombre }}</span>
                      </button>
                    }
                  </div>
                  @if (rechazando()) {
                    <div class="flex flex-col sm:flex-row gap-2">
                      <input type="text" [(ngModel)]="motivoRechazo" placeholder="Motivo del rechazo (mín. 5 caracteres)"
                        class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-red-200" />
                      <button type="button" (click)="rechazar(s)" [disabled]="motivoRechazo.trim().length < 5 || enviando()"
                        class="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-600 disabled:opacity-50">Rechazar salida</button>
                    </div>
                  }
                </div>
              }
            </li>
          }
        </ul>
      }
    </div>

    @if (nueva()) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="nueva.set(false)">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between shrink-0 px-4 pt-4 pb-3 sm:px-6 sm:pt-5 border-b border-gray-100">
            <div>
              <h2 class="text-lg font-bold text-gray-800">Nueva salida</h2>
              <p class="text-xs text-gray-400 mt-0.5">Queda pendiente hasta que la apruebe {{ conPoliza() && f.clase === 'DEVOLUTIVO' ? 'el jefe inmediato' : 'el administrador' }}.</p>
            </div>
            <button aria-label="Cerrar" (click)="nueva.set(false)" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>

          <div id="salida-cuerpo" class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 space-y-6">
            <!-- Qué sale y de dónde -->
            <section class="space-y-3">
              <h3 class="flex items-center gap-2 text-sm font-semibold text-gray-800"><span class="w-5 h-5 rounded-full bg-gray-900 text-white text-[11px] grid place-items-center">{{ paso('que') }}</span> ¿Qué sale y de dónde?</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                @for (c of tiposClase; track c.value) {
                  <button type="button" (click)="elegirClase(c.value)"
                    class="text-left rounded-xl border p-3 transition-colors"
                    [class]="f.clase === c.value ? 'border-[#39A900] bg-[#39A900]/10' : 'border-gray-200 hover:border-gray-300 bg-white'">
                    <p class="text-sm font-semibold" [class]="f.clase === c.value ? 'text-[#2d8000]' : 'text-gray-800'">{{ c.titulo }}</p>
                    <p class="text-xs text-gray-500 mt-0.5">{{ c.descripcion }}</p>
                  </button>
                }
              </div>
              <div [attr.data-error]="err('id_sitio') ? 'true' : null">
                <label class="block text-xs font-medium text-gray-600 mb-1">Bodega de la que sale <span class="text-red-500">*</span></label>
                <app-ss [options]="opcionesSitio()" placeholder="— Selecciona la bodega —" [tone]="err('id_sitio') ? 'danger' : ''"
                  [(ngModel)]="f.id_sitio" (ngModelChange)="cambioSitio()"></app-ss>
                @if (err('id_sitio'); as m) { <p class="text-xs text-red-500 mt-1">{{ m }}</p> }
              </div>
            </section>

            <!-- ¿Regresa? (solo devolutivos) -->
            @if (f.clase !== 'CONSUMO') {
              <section class="space-y-2.5" [attr.data-error]="err('con_regreso') ? 'true' : null">
                <h3 class="flex items-center gap-2 text-sm font-semibold text-gray-800"><span class="w-5 h-5 rounded-full bg-gray-900 text-white text-[11px] grid place-items-center">{{ paso('regreso') }}</span> ¿El material regresa a la sede? <span class="text-red-500">*</span></h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  @for (r of tiposRegreso; track r.titulo) {
                    <button type="button" (click)="regresa.set(r.value)"
                      class="text-left rounded-xl border p-3 transition-colors"
                      [class]="regresa() === r.value ? 'border-[#39A900] bg-[#39A900]/10' : (err('con_regreso') ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300 bg-white')">
                      <p class="text-sm font-semibold" [class]="regresa() === r.value ? 'text-[#2d8000]' : 'text-gray-800'">{{ r.titulo }}</p>
                      <p class="text-xs text-gray-500 mt-0.5">{{ r.descripcion }}</p>
                    </button>
                  }
                </div>
                @if (err('con_regreso'); as m) { <p class="text-xs text-red-500">{{ m }}</p> }
              </section>
            }

            <!-- Para quién -->
            <section class="space-y-2.5">
              <h3 class="flex items-center gap-2 text-sm font-semibold text-gray-800"><span class="w-5 h-5 rounded-full bg-gray-900 text-white text-[11px] grid place-items-center">{{ paso('quien') }}</span> ¿Para quién es el material?</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                @for (d of tiposDestino; track d.value) {
                  <button type="button" (click)="f.tipo_destino = d.value"
                    class="text-left rounded-xl border p-3 transition-colors"
                    [class]="f.tipo_destino === d.value ? 'border-[#39A900] bg-[#39A900]/10' : 'border-gray-200 hover:border-gray-300 bg-white'">
                    <p class="text-sm font-semibold" [class]="f.tipo_destino === d.value ? 'text-[#2d8000]' : 'text-gray-800'">{{ d.titulo }}</p>
                    <p class="text-xs text-gray-500 mt-0.5">{{ d.descripcion }}</p>
                  </button>
                }
              </div>
              @if (f.tipo_destino === 'TERCERO') {
                <div class="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2.5">
                  <p class="text-xs text-gray-500">Puede ser de otra sede y no estar en el sistema. Queda registrado que el material fue para esta persona y que tú lo sacaste como intermediario.</p>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div [attr.data-error]="err('dest_nombre') ? 'true' : null">
                      <label class="block text-xs font-medium text-gray-600 mb-1">Nombre de quien recibe <span class="text-red-500">*</span></label>
                      <input type="text" [(ngModel)]="f.dest_nombre" maxlength="150" placeholder="Ej: Carlos Pérez" [class]="clase('dest_nombre')" />
                      @if (err('dest_nombre'); as m) { <p class="text-xs text-red-500 mt-1">{{ m }}</p> }
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Documento <span class="text-gray-400 font-normal">(opcional)</span></label>
                      <input type="text" [(ngModel)]="f.dest_documento" maxlength="30" placeholder="Cédula" [class]="clase('')" />
                    </div>
                    <div [attr.data-error]="err('dest_sede') ? 'true' : null">
                      <label class="block text-xs font-medium text-gray-600 mb-1">Sede donde trabaja <span class="text-red-500">*</span></label>
                      <input type="text" [(ngModel)]="f.dest_sede" maxlength="200" placeholder="Ej: San Agustín" [class]="clase('dest_sede')" />
                      @if (err('dest_sede'); as m) { <p class="text-xs text-red-500 mt-1">{{ m }}</p> }
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">Cargo <span class="text-gray-400 font-normal">(opcional)</span></label>
                      <input type="text" [(ngModel)]="f.dest_cargo" maxlength="100" placeholder="Ej: Instructor" [class]="clase('')" />
                    </div>
                  </div>
                </div>
              }
            </section>

            <!-- Despacho (solo si regresa) -->
            @if (pideDespacho()) {
              <section class="space-y-2.5">
                <h3 class="flex items-center gap-2 text-sm font-semibold text-gray-800"><span class="w-5 h-5 rounded-full bg-gray-900 text-white text-[11px] grid place-items-center">{{ paso('despacho') }}</span> Datos del despacho</h3>
                <p class="text-xs text-gray-500 -mt-1">Salen en el reporte de transporte de mercancías (póliza).</p>
                <div class="grid grid-cols-1 gap-2.5" [class]="conPoliza() ? 'sm:grid-cols-3' : 'sm:grid-cols-2'">
                  <div [attr.data-error]="err('lugar_destino') ? 'true' : null">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Lugar de destino <span class="text-red-500">*</span></label>
                    <input type="text" [(ngModel)]="f.lugar_destino" maxlength="200" placeholder="Ej: Pitalito" [class]="clase('lugar_destino')" />
                    @if (err('lugar_destino'); as m) { <p class="text-xs text-red-500 mt-1">{{ m }}</p> }
                  </div>
                  <div [attr.data-error]="err('medio_transporte') ? 'true' : null">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Medio de transporte <span class="text-red-500">*</span></label>
                    <app-ss [options]="opcionesMedio" placeholder="— Selecciona —" [tone]="err('medio_transporte') ? 'danger' : ''" [(ngModel)]="f.medio_transporte"></app-ss>
                    @if (err('medio_transporte'); as m) { <p class="text-xs text-red-500 mt-1">{{ m }}</p> }
                  </div>
                  @if (conPoliza()) {
                  <div [attr.data-error]="err('id_jefe_inmediato') ? 'true' : null">
                    <label class="block text-xs font-medium text-gray-600 mb-1">Jefe inmediato <span class="text-red-500">*</span></label>
                    <app-ss [options]="candidatos()" [placeholder]="f.id_sitio ? '— Coordinador o administrador —' : 'Elige primero la bodega'"
                      [tone]="err('id_jefe_inmediato') ? 'danger' : ''" [(ngModel)]="f.id_jefe_inmediato"></app-ss>
                    @if (err('id_jefe_inmediato'); as m) { <p class="text-xs text-red-500 mt-1">{{ m }}</p> }
                  </div>
                  }
                </div>
              </section>
            }

            <!-- Material -->
            <section class="space-y-2.5">
              <div class="flex items-center justify-between gap-2">
                <h3 class="flex items-center gap-2 text-sm font-semibold text-gray-800"><span class="w-5 h-5 rounded-full bg-gray-900 text-white text-[11px] grid place-items-center">{{ paso('material') }}</span>
                  {{ f.clase === 'CONSUMO' ? 'Material (por lote)' : 'Unidades' }} <span class="text-red-500">*</span></h3>
                <button type="button" (click)="agregarLinea()" [disabled]="!f.id_sitio" class="text-xs font-semibold text-[#2d8000] hover:underline disabled:opacity-40 disabled:no-underline">+ Agregar otro</button>
              </div>
              @if (!f.id_sitio) {
                <p class="text-xs rounded-lg bg-gray-50 p-2.5 text-gray-500">Elige primero la bodega para ver su material.</p>
              } @else if (cargandoOpciones()) {
                <p class="text-xs text-gray-500 rounded-lg bg-gray-50 p-2.5">Cargando el material de la bodega…</p>
              } @else if (f.clase === 'CONSUMO' && opcionesLote().length === 0) {
                <p class="text-xs text-amber-700 rounded-lg bg-amber-50 p-2.5">Esta bodega no tiene lotes de consumibles con saldo libre.</p>
              } @else if (f.clase === 'DEVOLUTIVO' && opcionesItem().length === 0) {
                <p class="text-xs text-amber-700 rounded-lg bg-amber-50 p-2.5">Esta bodega no tiene devolutivos disponibles.</p>
              } @else {
                @if (f.clase !== 'CONSUMO') {
                  <p class="text-[11px] text-gray-500">No todos los devolutivos tienen placa: los que no la tienen se reconocen por su SKU, modelo y código. Escribe el serial si lo tienen.</p>
                }
                @for (l of f.lineas; track $index) {
                  <div class="rounded-xl border border-gray-200 p-3 space-y-2.5">
                    <div class="flex items-center justify-between">
                      <p class="text-xs font-semibold text-gray-500">{{ tipoLinea(l) === 'lote' ? 'Material' : 'Unidad' }} {{ $index + 1 }}</p>
                      @if (f.lineas.length > 1) {
                        <button type="button" (click)="quitarLinea($index)" class="text-xs font-medium text-gray-400 hover:text-red-600">Quitar</button>
                      }
                    </div>
                    <div [attr.data-error]="err('l' + $index + '_clave') ? 'true' : null">
                      <app-ss [options]="tipoLinea(l) === 'lote' ? opcionesLote() : opcionesItem()"
                        [placeholder]="tipoLinea(l) === 'lote' ? '— Selecciona el lote —' : '— Selecciona la unidad —'"
                        [tone]="err('l' + $index + '_clave') ? 'danger' : ''" [(ngModel)]="l.clave" (ngModelChange)="alCambiarLote(l)"></app-ss>
                      @if (err('l' + $index + '_clave'); as m) { <p class="text-xs text-red-500 mt-1">{{ m }}</p> }
                    </div>
                    @if (tipoLinea(l) === 'lote') {
                      <div [attr.data-error]="err('l' + $index + '_cantidad') ? 'true' : null" class="max-w-xs">
                        <label class="block text-xs font-medium text-gray-600 mb-1">Cantidad <span class="text-red-500">*</span></label>
                        <div class="flex items-center rounded-lg border" [class]="err('l' + $index + '_cantidad') ? 'border-red-500 bg-red-50' : 'border-gray-200 focus-within:ring-2 focus-within:ring-[#39A900]/30 focus-within:border-[#39A900]'">
                          <input type="number" min="1" step="1" [attr.max]="libresLote(l.clave)" [(ngModel)]="l.cantidad" (input)="fijarCantidad(l, $any($event.target))"
                            placeholder="Ej: 5" class="w-full px-3 py-2 rounded-l-lg text-sm bg-transparent focus:outline-none" />
                          <span class="px-3 text-xs text-gray-400 whitespace-nowrap">{{ unidadLote(l.clave) }}{{ libresLote(l.clave) !== null ? ' · máx. ' + libresLote(l.clave) : '' }}</span>
                        </div>
                        @if (err('l' + $index + '_cantidad'); as m) { <p class="text-xs text-red-500 mt-1">{{ m }}</p> }
                        @else if (l.ajustada) { <p class="text-xs text-amber-700 mt-1">Se ajustó al máximo disponible del lote ({{ libresLote(l.clave) }}).</p> }
                      </div>
                    } @else {
                      @if (cuentadanteDe(l.clave); as cu) {
                        <p class="text-[11px] text-blue-700 bg-blue-50 rounded-lg px-2.5 py-1.5">Cuentadante: <strong>{{ cu }}</strong> · solo él o el encargado de la bodega pueden despacharla.</p>
                      }
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        @if (conPoliza()) {
                        <div [attr.data-error]="err('l' + $index + '_valor') ? 'true' : null">
                          <label class="block text-xs font-medium text-gray-600 mb-1">Valor asegurado (nota de entrada) <span class="text-red-500">*</span></label>
                          <div class="flex items-center rounded-lg border" [class]="err('l' + $index + '_valor') ? 'border-red-500 bg-red-50' : 'border-gray-200 focus-within:ring-2 focus-within:ring-[#39A900]/30 focus-within:border-[#39A900]'">
                            <span class="pl-3 text-sm text-gray-400">$</span>
                            <input type="number" min="0" step="1" [(ngModel)]="l.valor" placeholder="Ej: 6611712" class="w-full px-2 py-2 rounded-r-lg text-sm bg-transparent focus:outline-none" />
                          </div>
                          @if (err('l' + $index + '_valor'); as m) { <p class="text-xs text-red-500 mt-1">{{ m }}</p> }
                        </div>
                        }
                        <div>
                          <label class="block text-xs font-medium text-gray-600 mb-1">Serial <span class="text-gray-400 font-normal">(opcional)</span></label>
                          <input type="text" [(ngModel)]="l.serial" maxlength="100" placeholder="Ej: SN-PRUEBA-01" [class]="clase('')" />
                        </div>
                      </div>
                    }
                  </div>
                }
              }
            </section>

            <!-- Motivo -->
            <section [attr.data-error]="err('motivo') ? 'true' : null" class="space-y-1.5">
              <h3 class="flex items-center gap-2 text-sm font-semibold text-gray-800"><span class="w-5 h-5 rounded-full bg-gray-900 text-white text-[11px] grid place-items-center">{{ paso('motivo') }}</span> Motivo <span class="text-red-500">*</span></h3>
              <textarea [(ngModel)]="f.motivo" rows="3" maxlength="2000" placeholder="Para qué se necesita y dónde se usará"
                [class]="clase('motivo') + ' resize-none'"></textarea>
              <div class="flex items-start justify-between gap-2">
                <p class="text-xs" [class]="err('motivo') ? 'text-red-500' : 'text-gray-400'">{{ err('motivo') || 'Mínimo 10 caracteres.' }}</p>
                <p class="text-xs text-gray-400 shrink-0">{{ f.motivo.length }}/2000</p>
              </div>
            </section>

            @if (intento && cantidadErrores() > 0) {
              <p class="text-red-600 text-xs p-2 bg-red-50 rounded-lg">Revisa {{ cantidadErrores() }} campo(s) marcado(s) en rojo antes de enviar.</p>
            }
          </div>

          <div class="shrink-0 flex flex-col sm:flex-row sm:items-center gap-2 border-t border-gray-100 px-4 py-3 sm:px-6">
            <p class="text-xs text-gray-500 sm:mr-auto">
              {{ resumenFormulario() }}
              @if (conPoliza() && totalValor() > 0) { · Valor asegurado <strong class="text-gray-800">{{ moneda(totalValor()) }}</strong> }
            </p>
            <div class="flex flex-col-reverse sm:flex-row gap-2">
              <button (click)="nueva.set(false)" class="w-full sm:w-auto px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancelar</button>
              <button (click)="guardarNueva()" [disabled]="enviando()"
                [style.opacity]="enviando() ? 0.6 : 1" [style.cursor]="enviando() ? 'not-allowed' : 'pointer'"
                class="w-full sm:w-auto px-5 py-2 text-white text-sm font-semibold rounded-full transition-colors" style="background-color: var(--accent-brand)">
                {{ enviando() ? 'Enviando…' : 'Enviar para aprobación' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    }

    @if (vista(); as v) {
      <div appDialog class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4" (click)="cerrarVista()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[calc(100dvh-1rem)] sm:h-[90vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
            <div class="min-w-0 mr-auto">
              <h2 class="text-base font-bold text-gray-900 truncate">{{ v.titulo }}</h2>
              <p class="text-xs text-gray-400 truncate">{{ v.nombre }} · así se ve el Excel que se descarga</p>
            </div>
            <div class="inline-flex items-center rounded-full border border-gray-200 text-xs font-semibold overflow-hidden">
              <button type="button" (click)="cambiarZoom(-0.1)" aria-label="Alejar" class="px-3 py-1.5 hover:bg-gray-50">−</button>
              <button type="button" (click)="ajustarZoom()" class="px-2 py-1.5 border-x border-gray-200 hover:bg-gray-50 min-w-14">{{ (zoom() * 100).toFixed(0) }}%</button>
              <button type="button" (click)="cambiarZoom(0.1)" aria-label="Acercar" class="px-3 py-1.5 hover:bg-gray-50">+</button>
            </div>
            <button type="button" (click)="descargarVista()" [disabled]="enviando()"
              class="px-4 py-2 rounded-full text-xs font-semibold border border-green-200 text-[#1d6f42] bg-green-50 hover:bg-green-100 disabled:opacity-50">Descargar Excel</button>
            <button type="button" aria-label="Cerrar" (click)="cerrarVista()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          @if (v.hojas.length > 1) {
            <div class="shrink-0 flex gap-1 px-4 pt-2 border-b border-gray-100 bg-white">
              @for (h of v.hojas; track h.nombre; let i = $index) {
                <button type="button" (click)="hojaActiva.set(i); ajustarZoom()"
                  class="px-3 py-1.5 text-xs font-semibold rounded-t-lg border border-b-0"
                  [class]="hojaActiva() === i ? 'bg-gray-100 border-gray-200 text-gray-900' : 'bg-white border-transparent text-gray-500 hover:text-gray-800'">{{ h.nombre }}</button>
              }
            </div>
          }
          @let hv = v.hojas[hojaActiva()].hoja;
          <div #lienzo class="min-h-0 flex-1 overflow-auto bg-gray-100 p-4 sm:p-6">
            <div class="relative bg-white shadow-sm mx-auto" [style.width.px]="hv.ancho" [style.zoom]="zoom()">
              <table class="border-collapse" style="table-layout: fixed" [style.width.px]="hv.ancho">
                <colgroup>
                  @for (w of hv.anchos; track $index) { <col [style.width.px]="w" /> }
                </colgroup>
                <tbody>
                  @for (f of hv.filas; track $index) {
                    <tr [style.height.px]="f.alto">
                      @for (c of f.celdas; track $index) {
                        <td [attr.colspan]="c.colspan > 1 ? c.colspan : null" [attr.rowspan]="c.rowspan > 1 ? c.rowspan : null" [style]="c.estilo">{{ c.texto }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
              @for (img of hv.imagenes; track img.src) {
                <img [src]="img.src" alt="" class="absolute pointer-events-none" [style.left.px]="img.left" [style.top.px]="img.top" [style.width.px]="img.width" [style.height.px]="img.height" />
              }
            </div>
          </div>
        </div>
      </div>
    }

    @if (configAbierta()) {
      <div appDialog class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" (click)="configAbierta.set(false)">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4" (click)="$event.stopPropagation()">
          <div>
            <h2 class="text-lg font-bold text-gray-900">Datos de la póliza</h2>
            <p class="text-xs text-gray-500">Salen en el encabezado y las notas del reporte de transporte de mercancías.
              La regional y el centro de formación se toman de la sede de cada bodega; lo que escribas aquí solo se usa cuando la bodega no tiene sede asignada.</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            @for (c of camposConfig; track c.clave) {
              <div [class]="c.ancho ? 'sm:col-span-2' : ''">
                <label class="block text-xs font-medium text-gray-600 mb-1">{{ c.label }}</label>
                @if (c.dinero) {
                  <div class="flex items-center rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-[#39A900]/30 focus-within:border-[#39A900]">
                    <span class="pl-3 text-sm text-gray-400">$</span>
                    <input type="text" inputmode="numeric" [(ngModel)]="config[c.clave]" class="w-full px-2 py-2 rounded-r-lg text-sm bg-transparent focus:outline-none" />
                  </div>
                  <p class="text-[11px] text-gray-400 mt-0.5">{{ montoLegible(config[c.clave]) }}</p>
                } @else {
                  <input type="text" [(ngModel)]="config[c.clave]" class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                }
              </div>
            }
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" (click)="configAbierta.set(false)" class="px-4 py-2 rounded-full text-sm font-semibold border border-gray-200 text-gray-600 bg-white">Cerrar</button>
            <button type="button" (click)="guardarConfig()" [disabled]="enviando()"
              class="px-5 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-50" style="background-color: var(--accent-brand)">Guardar</button>
          </div>
        </div>
      </div>
    }
`,
})
export class MaterialesSalidasComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly filtros: { valor: string; label: string }[] = [
    // Pendientes, aprobadas, fuera de sede y regresadas se filtran desde las tarjetas de arriba.
    { valor: '', label: 'Todos los estados' },
    { valor: 'RECHAZADA', label: 'Rechazadas' },
    { valor: 'CANCELADA', label: 'Canceladas' },
  ];
  readonly tiposClase: { value: ClaseSalida; titulo: string; descripcion: string }[] = [
    { value: 'CONSUMO', titulo: 'Consumibles', descripcion: 'Salida permanente: el material se consume (cable, tornillos…).' },
    { value: 'DEVOLUTIVO', titulo: 'Devolutivos', descripcion: 'Equipos con placa o serial: salen con el reporte de transporte de mercancías (póliza).' },
  ];
  readonly tiposRegreso: { value: boolean; titulo: string; descripcion: string }[] = [
    { value: true, titulo: 'Sale y regresa', descripcion: 'Las unidades vuelven a la bodega y se registra su regreso.' },
    { value: false, titulo: 'Sale y no regresa', descripcion: 'Salida permanente: las unidades se dan de baja del inventario al aprobar.' },
  ];
  readonly tiposDestino: { value: TipoDestinoSalida; titulo: string; descripcion: string }[] = [
    { value: 'PROPIO', titulo: 'Para mí', descripcion: 'Yo uso el material y queda en mi registro.' },
    { value: 'TERCERO', titulo: 'Para otra persona', descripcion: 'Soy el intermediario de alguien más, quizá de otra sede.' },
  ];
  readonly opcionesMedio: SSOption[] = MEDIOS.map((m) => ({ value: m, label: m }));
  readonly camposConfig: { clave: keyof ConfigSalida; label: string; dinero?: boolean; ancho?: boolean }[] = [
    { clave: 'poliza_numero', label: 'Número de póliza' },
    { clave: 'regional', label: 'Regional' },
    { clave: 'centro_formacion', label: 'Centro de formación', ancho: true },
    { clave: 'dependencia', label: 'Dependencia', ancho: true },
    { clave: 'limite_despacho', label: 'Valor límite por despacho', dinero: true },
    { clave: 'presupuesto_anual', label: 'Presupuesto anual de movilización', dinero: true },
  ];
  readonly tarjetas: { valor: string; label: string; ayuda: string }[] = [
    { valor: 'PENDIENTE', label: 'Por aprobar', ayuda: 'Esperan aprobación' },
    { valor: 'APROBADA', label: 'Aprobadas', ayuda: 'Salieron de la sede' },
    { valor: 'FUERA', label: 'Fuera de la sede', ayuda: 'Deben regresar' },
    { valor: 'REGRESADA', label: 'Regresadas', ayuda: 'Volvieron a la bodega' },
  ];
  readonly filtrosClase: { valor: '' | ClaseSalida; label: string }[] = [
    { valor: '', label: 'Todo' },
    { valor: 'CONSUMO', label: 'Consumibles' },
    { valor: 'DEVOLUTIVO', label: 'Devolutivos' },
  ];

  readonly salidas = signal<SalidaResumen[]>([]);
  readonly filtro = signal('');
  readonly busqueda = signal('');
  readonly claseFiltro = signal<'' | ClaseSalida>('');
  /** "FUERA" = devolutivos aprobados que salieron y todavía no regresan. */
  readonly conteos = computed(() => {
    const c: Record<string, number> = { PENDIENTE: 0, APROBADA: 0, REGRESADA: 0, RECHAZADA: 0, CANCELADA: 0, FUERA: 0 };
    for (const s of this.salidas()) {
      c[s.estado] = (c[s.estado] ?? 0) + 1;
      if (s.con_regreso && s.estado === 'APROBADA') c['FUERA'] += 1;
    }
    return c;
  });
  readonly visibles = computed(() => {
    const q = normalizar(this.busqueda().trim());
    const filtro = this.filtro();
    return this.salidas().filter((s) => {
      if (filtro === 'FUERA' ? !(s.con_regreso && s.estado === 'APROBADA') : filtro && s.estado !== filtro) return false;
      if (this.claseFiltro() && s.clase !== this.claseFiltro()) return false;
      if (!q) return true;
      return normalizar([s.codigo, s.solicitante_nombre, s.sitio_nombre, s.dest_nombre, s.dest_sede, s.lugar_destino, s.motivo].filter(Boolean).join(' ')).includes(q);
    });
  });
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly enviando = signal(false);
  readonly detalle = signal<SalidaDetalle | null>(null);
  readonly rechazando = signal(false);
  motivoRechazo = '';

  readonly nueva = signal(false);
  readonly configAbierta = signal(false);
  readonly sitios = signal<{ id_sitio: string; nombre: string }[]>([]);
  readonly opciones = signal<OpcionesSalida | null>(null);
  readonly cargandoOpciones = signal(false);
  config: Record<string, string | null> = {};

  f = this.formVacio();

  /** Clase elegida y si el devolutivo regresa: señales para que las opciones de unidades se recalculen. */
  readonly claseSel = signal<ClaseSalida>('CONSUMO');
  readonly regresa = signal<boolean | null>(null);
  /** Salida de devolutivos que regresan. */
  readonly conRegreso = computed(() => this.claseSel() !== 'CONSUMO' && this.regresa() === true);
  /** Reporte de póliza: la salida es de devolutivos (pide valor asegurado, destino, transporte y jefe inmediato). */
  conPoliza(): boolean {
    // Todo devolutivo sale en el reporte de póliza (decisión del dueño, 2026-10-06), tenga o no cuentadante.
    return this.f.clase === 'DEVOLUTIVO';
  }
  /** Se piden destino y transporte si los equipos regresan o si van en la póliza. */
  pideDespacho(): boolean {
    return this.conRegreso() || this.conPoliza();
  }
  /** Nombre del cuentadante de una unidad elegida (null si no tiene). */
  cuentadanteDe(idItem: string | null): string | null {
    if (!idItem) return null;
    const u = this.opciones()?.unidades.find((x) => x.id_item === idItem);
    return u?.id_cuentadante ? (u.cuentadante_nombre ?? 'asignado') : null;
  }
  readonly esAdmin = computed(() => this.auth.isAdmin());
  readonly puedeCrear = computed(() => this.auth.tieneServicio('materiales.solicitudes.crear'));
  readonly opcionesSitio = computed<SSOption[]>(() => this.sitios().map((s) => ({ value: s.id_sitio, label: s.nombre })));
  readonly opcionesLote = computed<SSOption[]>(() =>
    (this.opciones()?.lotes ?? []).map((l) => ({
      value: l.id_lote,
      label: `${l.producto_nombre}${l.codigo_lote ? ' · lote ' + l.codigo_lote : ''}${l.fecha_vencimiento ? ' · vence ' + l.fecha_vencimiento : ''} — ${l.libres} ${l.unidad_medida ?? ''} libres`,
    })),
  );
  /** Unidades con o sin placa: una sin placa se reconoce por SKU, modelo y código. */
  readonly opcionesItem = computed<SSOption[]>(() =>
    (this.opciones()?.unidades ?? []).map((u) => {
      // Si regresa (póliza) solo despacha el cuentadante o el encargado; si sale para siempre, como un consumible, cualquiera que vea la bodega.
      // Una unidad con cuentadante solo la despacha ese cuentadante o quien gestiona la bodega (igual que el backend).
      const bloqueada = !!u.id_cuentadante && !u.puede_despachar;
      const id = u.placa_sena ?? `sin placa · ${[u.codigo_sku, u.modelo].filter((x) => !!x).join(' · ') || 'sin SKU'} · cód. ${u.codigo}`;
      const motivo = u.id_cuentadante ? ` · cuentadante: ${u.cuentadante_nombre ?? 'asignado'}${bloqueada ? ' (solo lo despacha él o el encargado)' : ''}` : '';
      return { value: u.id_item, label: `${u.producto_nombre} — ${id}${motivo}`, disabled: bloqueada };
    }),
  );
  readonly candidatos = computed<SSOption[]>(() =>
    (this.opciones()?.jefes ?? []).map((j) => ({ value: j.id_usuario, label: `${j.nombre}${j.cargo ? ' — ' + j.cargo : ''}` })),
  );

  ngOnInit(): void {
    void this.cargar();
  }

  miId(): string | undefined {
    return this.auth.user()?.id;
  }

  private formVacio() {
    return {
      clase: 'CONSUMO' as ClaseSalida,
      id_sitio: null as string | null,
      tipo_destino: 'PROPIO' as TipoDestinoSalida,
      dest_nombre: '',
      dest_documento: '',
      dest_cargo: '',
      dest_sede: '',
      lugar_destino: '',
      medio_transporte: null as string | null,
      id_jefe_inmediato: null as string | null,
      motivo: '',
      lineas: [{ clave: null, cantidad: 1, valor: null, serial: '' }] as LineaForm[],
    };
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.salidas.set((await this.api.listarSalidas()) ?? []);
    } catch (e) {
      log.error('salidas: no se pudo cargar', e);
      this.error.set('No se pudieron cargar las salidas.');
    } finally {
      this.cargando.set(false);
    }
  }

  async alternarDetalle(s: SalidaResumen): Promise<void> {
    if (this.detalle()?.id_salida === s.id_salida) {
      this.detalle.set(null);
      return;
    }
    this.rechazando.set(false);
    this.motivoRechazo = '';
    try {
      this.detalle.set(await this.api.obtenerSalida(s.id_salida));
    } catch (e) {
      this.toast.httpError(e, 'No se pudo abrir la salida.');
    }
  }

  // ── Nueva salida ──
  async abrirNueva(): Promise<void> {
    this.f = this.formVacio();
    this.claseSel.set('CONSUMO');
    this.regresa.set(null);
    this.intento = false;
    this.opciones.set(null);
    this.nueva.set(true);
    try {
      this.sitios.set((await this.api.bodegasSalida()) ?? []);
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las bodegas.');
    }
  }

  /** Lotes, unidades y jefes de la bodega elegida (endpoint propio: no dependen de otros permisos). */
  private async cargarOpciones(idSitio: string | null): Promise<void> {
    this.opciones.set(null);
    if (!idSitio) return;
    this.cargandoOpciones.set(true);
    try {
      const o = await this.api.opcionesSalida(idSitio);
      if (this.f.id_sitio === idSitio) this.opciones.set(o);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el material de esa bodega.');
    } finally {
      this.cargandoOpciones.set(false);
    }
  }

  elegirClase(clase: ClaseSalida): void {
    if (this.f.clase === clase) return;
    this.f.clase = clase;
    this.claseSel.set(clase);
    this.regresa.set(null);
    this.f.lineas = [this.lineaVacia()];
  }
  cambioSitio(): void {
    this.f.lineas = [this.lineaVacia()];
    void this.cargarOpciones(this.f.id_sitio);
  }
  agregarLinea(tipo?: TipoLinea): void {
    this.f.lineas = [...this.f.lineas, this.lineaVacia(tipo)];
  }
  private lineaVacia(tipo?: TipoLinea): LineaForm {
    return { tipo: tipo ?? (this.f.clase === 'DEVOLUTIVO' ? 'item' : 'lote'), clave: null, cantidad: 1, valor: null, serial: '' };
  }
  /** Tipo de una línea: el suyo, o el de la clase de la salida. */
  tipoLinea(l: LineaForm): TipoLinea {
    return l.tipo ?? (this.f.clase === 'DEVOLUTIVO' ? 'item' : 'lote');
  }
  quitarLinea(i: number): void {
    this.f.lineas = this.f.lineas.filter((_, idx) => idx !== i);
  }

  // ── Validación (campos en rojo al intentar enviar, y mínimos de caracteres en vivo) ──
  /** Se pone en true al primer intento de envío: desde ahí todos los campos inválidos se marcan. */
  intento = false;

  /** Mensajes por campo. Vacío = todo bien. */
  private validar(): Record<string, string> {
    const f = this.f;
    const e: Record<string, string> = {};
    if (!f.id_sitio) e['id_sitio'] = 'Elige la bodega de la que sale el material.';
    const motivo = f.motivo.trim().length;
    if (motivo < 10) e['motivo'] = motivo === 0 ? 'Cuenta para qué es la salida.' : `Faltan ${10 - motivo} caracteres (mínimo 10).`;
    if (f.tipo_destino === 'TERCERO') {
      const n = f.dest_nombre.trim().length;
      if (n < 3) e['dest_nombre'] = n === 0 ? 'Escribe quién recibe el material.' : `Faltan ${3 - n} caracteres (mínimo 3).`;
      if (!f.dest_sede.trim()) e['dest_sede'] = 'Escribe la sede de esa persona.';
    }
    if (f.clase !== 'CONSUMO' && this.regresa() === null) e['con_regreso'] = 'Indica si el material regresa a la sede.';
    if (this.pideDespacho()) {
      if (!f.lugar_destino.trim()) e['lugar_destino'] = 'Escribe el lugar de destino.';
      if (!f.medio_transporte) e['medio_transporte'] = 'Elige el medio de transporte.';
      if (this.conPoliza() && !f.id_jefe_inmediato) e['id_jefe_inmediato'] = 'Elige el jefe inmediato.';
    }
    const vistos = new Set<string>();
    f.lineas.forEach((l, i) => {
      const tipo = this.tipoLinea(l);
      if (!l.clave) e[`l${i}_clave`] = tipo === 'lote' ? 'Elige el lote.' : 'Elige la unidad.';
      else if (vistos.has(l.clave)) e[`l${i}_clave`] = 'Ya lo agregaste en otra línea.';
      else vistos.add(l.clave);
      if (tipo === 'lote') {
        const c = Number(l.cantidad);
        const max = this.libresLote(l.clave);
        if (!Number.isInteger(c) || c < 1) e[`l${i}_cantidad`] = 'Escribe un número entero de 1 en adelante.';
        else if (max !== null && c > max) e[`l${i}_cantidad`] = `Solo hay ${max} libres en ese lote.`;
      } else if (this.conPoliza() && (l.valor === null || l.valor === undefined || String(l.valor) === '' || Number(l.valor) < 0)) {
        e[`l${i}_valor`] = 'Escribe el valor asegurado de esta unidad.';
      }
    });
    return e;
  }

  /** Mensaje de error de un campo; vacío si no toca mostrarlo todavía. */
  err(campo: string): string {
    const m = this.validar()[campo] ?? '';
    if (!m) return '';
    // Mínimos de caracteres: avisan en vivo apenas el usuario empieza a escribir.
    // Mínimos de caracteres y cantidades: avisan en vivo, sin esperar a "Enviar".
    const enVivo = (campo === 'motivo' && this.f.motivo.length > 0) || (campo === 'dest_nombre' && this.f.dest_nombre.length > 0) || campo.endsWith('_cantidad');
    return this.intento || enVivo ? m : '';
  }

  /** Clases de un campo de texto: rojo si tiene error, verde de marca al enfocar si no. */
  clase(campo: string): string {
    const base = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2';
    return this.err(campo)
      ? `${base} border-red-500 bg-red-50 text-red-700 focus:ring-red-300`
      : `${base} border-gray-200 focus:ring-[#39A900]/30 focus:border-[#39A900]`;
  }

  cantidadErrores(): number {
    return Object.keys(this.validar()).length;
  }

  /**
   * Tope en vivo de la cantidad de un consumible: no deja escribir más de lo libre del lote (lo baja al
   * máximo y avisa). Se escribe también en el input porque, si el modelo ya valía el máximo, Angular no
   * lo vuelve a pintar.
   */
  fijarCantidad(l: LineaForm, input: HTMLInputElement): void {
    const max = this.libresLote(l.clave);
    const valor = input.valueAsNumber;
    l.ajustada = false;
    if (max !== null && Number.isFinite(valor) && valor > max) {
      l.cantidad = max;
      input.value = String(max);
      l.ajustada = true;
    }
  }
  /** Al cambiar de lote, la cantidad no puede quedar por encima de lo libre del nuevo. */
  alCambiarLote(l: LineaForm): void {
    const max = this.libresLote(l.clave);
    l.ajustada = false;
    if (max !== null && Number(l.cantidad) > max) {
      l.cantidad = max;
      l.ajustada = true;
    }
  }

  libresLote(idLote: string | null): number | null {
    return this.opciones()?.lotes.find((l) => l.id_lote === idLote)?.libres ?? null;
  }
  unidadLote(idLote: string | null): string {
    return this.opciones()?.lotes.find((l) => l.id_lote === idLote)?.unidad_medida ?? '';
  }
  totalValor(): number {
    return this.f.lineas.reduce((a, l) => a + (Number(l.valor) || 0), 0);
  }

  async guardarNueva(): Promise<void> {
    this.intento = true;
    const errores = this.validar();
    if (Object.keys(errores).length) {
      // Lleva a la vista el primer campo en rojo.
      setTimeout(() => document.querySelector('#salida-cuerpo [data-error="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return;
    }
    const f = this.f;
    const lineas = f.lineas.filter((l) => l.clave);
    this.enviando.set(true);
    try {
      const s = await this.api.crearSalida({
        clase: f.clase,
        id_sitio: f.id_sitio!,
        tipo_destino: f.tipo_destino,
        ...(f.tipo_destino === 'TERCERO'
          ? { dest_nombre: f.dest_nombre.trim(), dest_documento: f.dest_documento.trim() || undefined, dest_cargo: f.dest_cargo.trim() || undefined, dest_sede: f.dest_sede.trim() }
          : {}),
        ...(f.clase !== 'CONSUMO' ? { con_regreso: this.regresa() === true } : {}),
        ...(this.pideDespacho() ? { lugar_destino: f.lugar_destino.trim(), medio_transporte: f.medio_transporte ?? undefined } : {}),
        ...(this.conPoliza() ? { id_jefe_inmediato: f.id_jefe_inmediato ?? undefined } : {}),
        motivo: f.motivo.trim(),
        lineas: lineas.map((l) =>
          this.tipoLinea(l) === 'lote'
            ? { id_lote: l.clave!, cantidad: Number(l.cantidad) }
            : { id_item: l.clave!, valor_unitario: this.conPoliza() ? Number(l.valor) : undefined, serial: l.serial.trim() || undefined },
        ),
      });
      this.toast.ok('Salida registrada', `${s.codigo} quedó pendiente de aprobación.`);
      this.nueva.set(false);
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo registrar la salida.');
    } finally {
      this.enviando.set(false);
    }
  }

  // ── Acciones sobre una salida ──
  private async ejecutar(s: SalidaResumen, accion: () => Promise<unknown>, ok: string, fallo: string): Promise<void> {
    this.enviando.set(true);
    try {
      await accion();
      this.toast.ok(ok);
      this.rechazando.set(false);
      await this.cargar();
      this.detalle.set(await this.api.obtenerSalida(s.id_salida));
    } catch (e) {
      this.toast.httpError(e, fallo);
    } finally {
      this.enviando.set(false);
    }
  }

  async aprobar(s: SalidaResumen): Promise<void> {
    const ok = await this.confirm.ask(
      !s.con_regreso
        ? 'Al aprobar, el material sale del inventario de forma permanente.'
        : 'Al aprobar, las unidades quedan fuera de la sede hasta que se registre su regreso.',
      { header: `Aprobar ${s.codigo}`, acceptLabel: 'Aprobar', danger: false },
    );
    if (ok) await this.ejecutar(s, () => this.api.aprobarSalida(s.id_salida), 'Salida aprobada', 'No se pudo aprobar.');
  }
  async rechazar(s: SalidaResumen): Promise<void> {
    await this.ejecutar(s, () => this.api.rechazarSalida(s.id_salida, this.motivoRechazo.trim()), 'Salida rechazada', 'No se pudo rechazar.');
  }
  async cancelar(s: SalidaResumen): Promise<void> {
    if (await this.confirm.ask('Se libera el material reservado.', { header: `Cancelar ${s.codigo}`, acceptLabel: 'Cancelar salida' })) {
      await this.ejecutar(s, () => this.api.cancelarSalida(s.id_salida), 'Salida cancelada', 'No se pudo cancelar.');
    }
  }
  async regreso(s: SalidaResumen): Promise<void> {
    if (await this.confirm.ask('Las unidades vuelven a estar disponibles en la bodega.', { header: `Regreso de ${s.codigo}`, acceptLabel: 'Registrar regreso', danger: false })) {
      await this.ejecutar(s, () => this.api.registrarRegresoSalida(s.id_salida), 'Regreso registrado', 'No se pudo registrar el regreso.');
    }
  }

  /** Arma el libro de la salida (exceljs ≈920 kB se carga con import() solo aquí). */
  private async libro(s: SalidaResumen): Promise<{ wb: Workbook; nombre: string; salida: SalidaDetalle }> {
    const { config, salida } = await this.api.datosPolizaSalida(s.id_salida);
    return { ...(await construirExcel(salida, config)), salida };
  }

  // Solo Excel: el usuario pega las fotos y firma, y lo pasa a PDF él mismo.
  async descargar(s: SalidaResumen): Promise<void> {
    this.enviando.set(true);
    try {
      const { wb, nombre } = await this.libro(s);
      await descargarLibro(wb, nombre);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo generar el Excel.');
    } finally {
      this.enviando.set(false);
    }
  }

  // ── Vista previa del Excel (el mismo libro que se descarga, dibujado en la página) ──
  readonly vista = signal<{ titulo: string; nombre: string; hojas: { nombre: string; hoja: HojaVista }[]; wb: Workbook } | null>(null);
  readonly hojaActiva = signal(0);
  readonly zoom = signal(1);
  private readonly lienzo = viewChild<ElementRef<HTMLElement>>('lienzo');

  async previsualizar(s: SalidaResumen): Promise<void> {
    this.enviando.set(true);
    try {
      const { wb, nombre, salida } = await this.libro(s);
      this.cerrarVista();
      const hojas = wb.worksheets.map((ws, i) => ({ nombre: ws.name, hoja: hojaAVista(wb, i) }));
      this.hojaActiva.set(0);
      this.vista.set({ titulo: `${s.codigo} · ${this.formatoDescarga(salida).nombre}`, nombre, hojas, wb });
      setTimeout(() => this.ajustarZoom());
    } catch (e) {
      this.toast.httpError(e, 'No se pudo armar la vista previa.');
    } finally {
      this.enviando.set(false);
    }
  }

  /** Ajusta el zoom para que la hoja quepa a lo ancho (sin pasar de 100 %). */
  ajustarZoom(): void {
    const v = this.vista();
    const lienzo = this.lienzo()?.nativeElement;
    if (!v || !lienzo) return;
    const hoja = v.hojas[this.hojaActiva()]?.hoja;
    if (!hoja) return;
    this.zoom.set(Math.min(1, Math.max(0.3, (lienzo.clientWidth - 48) / hoja.ancho)));
  }

  cambiarZoom(delta: number): void {
    this.zoom.set(Math.min(2, Math.max(0.3, Math.round((this.zoom() + delta) * 10) / 10)));
  }

  async descargarVista(): Promise<void> {
    const v = this.vista();
    if (!v) return;
    this.enviando.set(true);
    try {
      await descargarLibro(v.wb, v.nombre);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo generar el Excel.');
    } finally {
      this.enviando.set(false);
    }
  }

  cerrarVista(): void {
    this.vista()?.hojas.forEach((h) => h.hoja.urls.forEach((u) => URL.revokeObjectURL(u)));
    this.vista.set(null);
  }

  // ── Datos de la póliza ──
  async abrirConfig(): Promise<void> {
    try {
      this.config = { ...(await this.api.obtenerConfigSalida()) };
      this.configAbierta.set(true);
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar los datos de la póliza.');
    }
  }
  async guardarConfig(): Promise<void> {
    this.enviando.set(true);
    try {
      const limpio = Object.fromEntries(Object.entries(this.config).map(([k, v]) => [k, (v ?? '').toString().trim()]));
      this.config = { ...(await this.api.guardarConfigSalida(limpio as Partial<ConfigSalida>)) };
      this.toast.ok('Datos de la póliza guardados');
      this.configAbierta.set(false);
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron guardar los datos.');
    } finally {
      this.enviando.set(false);
    }
  }

  // ── Presentación ──
  readonly esTexto = (x: unknown): boolean => !!x;

  limpiarFiltros(): void {
    this.filtro.set('');
    this.claseFiltro.set('');
    this.busqueda.set('');
  }

  /** Número de cada paso visible del formulario (el de "¿regresa?" solo existe en devolutivos, el de despacho solo si regresa). */
  paso(id: 'que' | 'regreso' | 'quien' | 'despacho' | 'material' | 'motivo'): number {
    const visibles = ['que', ...(this.f.clase !== 'CONSUMO' ? ['regreso'] : []), 'quien', ...(this.pideDespacho() ? ['despacho'] : []), 'material', 'motivo'];
    return visibles.indexOf(id) + 1;
  }

  resumenFormulario(): string {
    const n = this.f.lineas.filter((l) => l.clave).length;
    if (!n) return 'Aún no eliges material';
    const que = this.f.clase === 'CONSUMO' ? (n === 1 ? 'material' : 'materiales') : n === 1 ? 'unidad' : 'unidades';
    return `${n} ${que} elegido${n === 1 ? '' : 's'}`;
  }

  destinoCorto(s: SalidaResumen): string {
    if (s.tipo_destino === 'TERCERO') return [s.dest_nombre, s.dest_sede].filter(Boolean).join(' · ') || 'otra persona';
    return s.con_regreso && s.lugar_destino ? `${s.lugar_destino} (uso propio)` : 'uso propio';
  }

  estadoLabel(s: SalidaResumen): string {
    if (s.estado === 'APROBADA' && s.con_regreso) return 'FUERA DE SEDE';
    return s.estado;
  }

  estiloClase(s: SalidaResumen): string {
    if (s.clase === 'CONSUMO') return 'bg-amber-50 text-amber-700';
    if (s.clase === 'MIXTA') return 'bg-teal-50 text-teal-700';
    return s.con_regreso ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700';
  }

  /** Qué trae el Excel: reporte de póliza (devolutivos), hoja de salida (consumibles) o, en una salida mixta vieja, las dos hojas. */
  formatoDescarga(d: SalidaDetalle): { nombre: string; ayuda: string } {
    const { poliza, consumo } = lineasPorFormato(d);
    if (poliza.length && consumo.length) return { nombre: 'Póliza + hoja de salida', ayuda: 'Dos hojas: transporte de mercancías (devolutivos) y material enviado (consumibles)' };
    return poliza.length
      ? { nombre: 'Reporte de póliza', ayuda: 'Formato de transporte de mercancías (devolutivos)' }
      : { nombre: 'Hoja de salida', ayuda: 'Formato de material enviado (consumibles)' };
  }

  /** Línea de tiempo del detalle: solicitada → aprobada / rechazada / cancelada → (si regresa) regresó. */
  hitos(d: SalidaDetalle): Hito[] {
    const lista: Hito[] = [{ titulo: 'Solicitada', detalle: `${d.solicitante_nombre ?? 'Alguien'} · ${this.fecha(d.fecha)}`, estado: 'hecho' }];
    if (d.estado === 'RECHAZADA') lista.push({ titulo: 'Rechazada', detalle: `${d.aprueba_nombre ?? ''} · ${this.fecha(d.fecha_aprobacion)}`, estado: 'error' });
    else if (d.estado === 'CANCELADA') lista.push({ titulo: 'Cancelada', detalle: 'Se liberó el material', estado: 'error' });
    else if (d.estado === 'PENDIENTE')
      lista.push({ titulo: 'Por aprobar', detalle: d.con_regreso ? `Espera a ${d.jefe_nombre ?? 'el jefe inmediato'}` : 'Espera al administrador', estado: 'actual' });
    else lista.push({ titulo: 'Aprobada', detalle: `${d.aprueba_nombre ?? ''} · ${this.fecha(d.fecha_aprobacion)}`, estado: 'hecho' });
    if (d.estado === 'RECHAZADA' || d.estado === 'CANCELADA') return lista;
    if (d.con_regreso) {
      if (d.estado === 'REGRESADA') lista.push({ titulo: 'Regresó', detalle: this.fecha(d.fecha_regreso), estado: 'hecho' });
      else lista.push({ titulo: 'Regreso', detalle: d.estado === 'APROBADA' ? 'Fuera de la sede' : 'Después de aprobar', estado: d.estado === 'APROBADA' ? 'actual' : 'pendiente' });
    } else {
      lista.push({ titulo: 'Salida permanente', detalle: 'No regresa a la bodega', estado: d.estado === 'APROBADA' ? 'hecho' : 'pendiente' });
    }
    return lista;
  }

  puntoHito(e: Hito['estado']): string {
    return { hecho: 'bg-green-500 border-green-500', actual: 'bg-white border-amber-500', pendiente: 'bg-white border-gray-300', error: 'bg-red-500 border-red-500' }[e];
  }

  montoLegible(v: string | null | undefined): string {
    const n = Number(String(v ?? '').replace(/[^\d]/g, ''));
    return n ? `$${n.toLocaleString('es-CO')}` : 'Solo números, sin puntos';
  }

  etiquetaClase(s: SalidaResumen): string {
    if (s.clase === 'CONSUMO') return 'Consumibles';
    if (s.clase === 'MIXTA') return s.con_regreso ? 'Consumibles y devolutivos · regresan' : 'Consumibles y devolutivos';
    return s.con_regreso ? 'Devolutivos · regresan' : 'Devolutivos · permanente';
  }

  estilo(e: EstadoSalida): string {
    return ESTILO_ESTADO[e];
  }
  fecha(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }
  moneda(v: number | null): string {
    return v === null || v === undefined ? '—' : `$${Number(v).toLocaleString('es-CO')}`;
  }
}
