import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';

import {
  EncuestasApiService,
  Encuesta,
  InstructorInfo,
  Pregunta,
  MetricasEncuesta,
  EstadoEncuesta,
} from '../../../core/services/encuestas/encuestas-api.service';
import { ErpCatalogoService } from '../../../core/services/horarios/erp-catalogo.service';
import { ToastService } from '../../../core/services/toast.service';
import { EncuestasRealtimeService } from '../../../core/services/realtime/encuestas-realtime.service';
import { TablePaginationComponent } from '../../../shared/components/table-pagination.component';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { DateInputComponent } from '../../../shared/components/date-input.component';
import { TimeInputComponent } from '../../../shared/components/time-input.component';
import { TuiDay } from '@taiga-ui/cdk';

type Filtro = 'TODAS' | EstadoEncuesta;

@Component({
  selector: 'app-encuestas',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, ToastModule, ConfirmDialogModule, TablePaginationComponent, SearchableSelectComponent, DateInputComponent, TimeInputComponent],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast position="top-right" [baseZIndex]="9999" />
    <p-confirmdialog />

    <div class="bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-50 p-3 sm:p-4 lg:p-8">
      <div class="max-w-5xl mx-auto space-y-4 sm:space-y-6">

        <!-- ── Header ── -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 flex-shrink-0 rounded-xl bg-gradient-to-br from-[#39A900] to-[#2d8500]
                        flex items-center justify-center shadow-lg shadow-[#39A900]/20">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div class="min-w-0">
              <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Encuestas de Satisfacción Docente</h1>
              <p class="text-muted text-sm">
                {{ filtradas().length }} encuesta{{ filtradas().length !== 1 ? 's' : '' }}
              </p>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <a routerLink="/encuestas/preguntas"
              class="flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold rounded-xl text-gray-600 bg-white border border-gray-200 hover:border-[#39A900]/40 hover:text-[#2d8500] hover:bg-[#39A900]/5 transition-all duration-200">
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Banco de preguntas
            </a>
            <button
              (click)="abrirWizard()"
              class="group flex items-center justify-center gap-2 px-5 py-2 text-white text-sm font-bold rounded-xl
                     shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
              style="background: linear-gradient(135deg, #39A900 0%, #2d8500 100%)">
              <svg class="w-4 h-4 flex-shrink-0 group-hover:rotate-90 transition-transform duration-300"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
              </svg>
              Nueva encuesta
            </button>
          </div>
        </div>

        <!-- ── Card principal ── -->
        <div class="bg-white rounded-2xl shadow-xl border border-gray-200/60 p-3 sm:p-6 space-y-4 sm:space-y-6">

          <!-- Filtros de estado -->
          <div class="inline-flex items-center bg-gray-50 rounded-2xl border border-gray-200 p-1 gap-1 max-w-full overflow-x-auto">
            @for (f of filtros; track f.value) {
              <button
                (click)="filtro.set(f.value); resetPage(); cargar()"
                class="relative flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-sm font-bold
                       whitespace-nowrap flex-shrink-0 transition-all duration-200"
                [class]="filtro() === f.value
                  ? 'bg-[#39A900] text-white shadow-md shadow-[#39A900]/25'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'">
                {{ f.label }}
              </button>
            }
          </div>

          <!-- Buscador + filtros por ficha/instructor -->
          <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div class="relative flex-1">
              <input
                type="text"
                [ngModel]="busqueda()"
                (ngModelChange)="busqueda.set($event); resetPage()"
                placeholder="🔍︎ Buscar por ficha o instructor..."
                class="w-full pl-3 pr-8 py-2 border-2 border-gray-200 rounded-xl text-sm hover:border-[#39A900]/50 focus:outline-none focus:border-[#39A900] transition-colors"/>
              @if (busqueda()) {
                <button (click)="busqueda.set(''); resetPage()"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">
                  ×
                </button>
              }
            </div>
            <div class="w-full sm:w-48">
              <app-ss [options]="fichaSelectOptions()" placeholder="Todas las fichas"
                [ngModel]="filtroFichaId()" (ngModelChange)="filtroFichaId.set($event); resetPage()"></app-ss>
            </div>
            <div class="w-full sm:w-48">
              <app-ss [options]="instructorSelectOptions()" placeholder="Todos los instructores"
                [ngModel]="filtroInstructorId()" (ngModelChange)="filtroInstructorId.set($event); resetPage()"></app-ss>
            </div>
          </div>

          <!-- Cargando / vacío -->
          @if (loading()) {
            <div class="flex justify-center py-16 text-sm text-gray-400">Cargando encuestas...</div>
          }
          @if (!loading() && filtradas().length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center">
              <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl mb-4">📊</div>
              <p class="text-gray-500 font-medium">No hay encuestas que coincidan</p>
              <p class="text-sm text-gray-400 mt-1">
                @if (busqueda() || filtroFichaId() || filtroInstructorId()) {
                  Prueba ajustando la búsqueda o los filtros.
                } @else {
                  Crea la primera con el botón "Nueva encuesta".
                }
              </p>
            </div>
          }

          <!-- Lista -->
          @if (!loading() && filtradas().length > 0) {
          <div class="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            @for (e of paged(); track e.id) {
              <div class="p-4 bg-gray-50/60">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p class="text-sm font-semibold text-gray-900">Ficha {{ e.numeroFicha }} — {{ e.instructorNombre }}</p>
                    <p class="text-xs text-gray-400 mt-0.5">
                      {{ e.respuestasActuales }} / {{ e.maxRespuestas }} respuestas ·
                      {{ e.estado === 'ACTIVA' ? 'Iniciada' : 'Cerrada' }} el {{ (e.estado === 'ACTIVA' ? e.fechaInicio : e.fechaFin) | date:'d MMM, h:mm a' }}
                      @if (e.estado === 'ACTIVA' && e.fechaLimite) {
                        · vence el {{ e.fechaLimite | date:'d MMM, h:mm a' }}
                      }
                    </p>
                  </div>
                  <div class="flex items-center gap-2 flex-shrink-0">
                    <span [class]="'px-2.5 py-1 rounded-lg text-xs font-semibold ' +
                      (e.estado === 'ACTIVA' ? 'bg-[#39A900]/10 text-[#2d8400]' : 'bg-gray-100 text-gray-500')">
                      {{ e.estado === 'ACTIVA' ? 'Activa' : 'Cerrada' }}
                    </span>

                    @if (e.estado === 'ACTIVA') {
                      <button (click)="mostrarLink(e)"
                        class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all">
                        Ver link/QR
                      </button>
                      <button (click)="confirmarCerrar(e)"
                        class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-all">
                        Cerrar
                      </button>
                    } @else {
                      <button (click)="verResultados(e)"
                        class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all">
                        Ver resultados
                      </button>
                    }
                  </div>
                </div>

                <!-- Barra de progreso: color según % de respuestas recibidas -->
                <div class="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div class="h-full transition-all"
                       [class]="colorProgreso(e)"
                       [style.width.%]="porcentajeProgreso(e)"></div>
                </div>

                <!-- Panel link/QR — un único link por grupo, cubre a todos los instructores creados juntos -->
                @if (linkVisibleId() === e.id) {
                  <div class="mt-3 p-3 bg-gray-50 rounded-xl flex items-center gap-4 flex-wrap">
                    <img [src]="qrUrl(linkDeGrupo(e.grupoId))" alt="QR" class="w-24 h-24 rounded-lg border border-gray-200 bg-white" />
                    <div class="flex-1 min-w-[200px]">
                      <p class="text-xs text-gray-500 mb-1">Comparte este link con los aprendices de la ficha — los llevará a responder, uno por uno, a cada instructor del grupo:</p>
                      <div class="flex items-center gap-2">
                        <input readonly [value]="linkDeGrupo(e.grupoId)"
                          class="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 bg-white" />
                        <button (click)="copiar(linkDeGrupo(e.grupoId))"
                          class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#39A900] text-white hover:bg-[#2d8400]">
                          Copiar
                        </button>
                      </div>
                    </div>
                  </div>
                }

                <!-- Panel resultados -->
                @if (metricasVisibles() && metricasVisibles()!.encuesta.id === e.id) {
                  <div class="mt-3 p-3 bg-gray-50 rounded-xl space-y-2">
                    @for (p of metricasVisibles()!.porPregunta; track p.pregunta) {
                      <div class="flex items-center justify-between gap-3 text-xs">
                        <span class="text-gray-600">{{ p.pregunta }}</span>
                        <span class="font-semibold text-gray-800">{{ p.porcentajeSi }}% Sí ({{ p.totalSi }}/{{ p.totalRespuestas }})</span>
                      </div>
                    }
                    <div class="flex items-center justify-between pt-2 border-t border-gray-200">
                      <span class="text-sm font-bold"
                        [class.text-green-600]="metricasVisibles()!.semaforo === 'verde'"
                        [class.text-yellow-600]="metricasVisibles()!.semaforo === 'amarillo'"
                        [class.text-red-600]="metricasVisibles()!.semaforo === 'rojo'">
                        Desempeño global: {{ metricasVisibles()!.promedioGlobal }}%
                      </span>
                      <div class="flex gap-2">
                        <button (click)="descargarExcel(e.id)"
                          class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
                          Excel
                        </button>
                        <button (click)="descargarPdf(e.id)"
                          class="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200">
                          PDF
                        </button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
          <app-table-pagination [page]="page()" [pages]="pages()" (pageChange)="page.set($event)" />
          }
        </div>

      </div>
    </div>

    <!-- ═══════════ Modal: nueva encuesta (2 pasos, como el registro rápido de personas) ═══════════ -->
    @if (wizardAbierto()) {
      <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" (click)="cerrarWizard()">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]" (click)="$event.stopPropagation()">

          @if (encuestasCreadas().length > 0) {
            <!-- ── Éxito ── -->
            <div class="p-6">
              <h2 class="text-lg font-bold text-gray-900 mb-1">
                ¡Encuesta{{ encuestasCreadas().length !== 1 ? 's' : '' }} creada{{ encuestasCreadas().length !== 1 ? 's' : '' }}!
              </h2>
              <p class="text-sm text-gray-500 mb-1">
                Un solo link/QR para toda la ficha — al abrirlo, cada aprendiz responde una a una las encuestas de:
              </p>
              <div class="flex items-center gap-1.5 flex-wrap mb-4">
                @for (e of encuestasCreadas(); track e.id) {
                  <span class="px-2 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600">{{ e.instructorNombre }}</span>
                }
              </div>

              <div class="border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                <img [src]="qrUrl(linkDeGrupo(grupoIdCreado()))" alt="QR" class="w-20 h-20 rounded-lg border border-gray-200 flex-shrink-0" />
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <input readonly [value]="linkDeGrupo(grupoIdCreado())"
                      class="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600" />
                    <button (click)="copiar(linkDeGrupo(grupoIdCreado()))"
                      class="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#39A900] text-white hover:bg-[#2d8400]">
                      Copiar
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex justify-end mt-6">
                <button (click)="cerrarWizard()" class="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900">
                  Listo
                </button>
              </div>
            </div>
          } @else {

            <!-- ── Header + barra de progreso ── -->
            <div class="px-6 py-5 border-b border-gray-100 flex-shrink-0">
              <div class="flex items-center justify-between">
                <div>
                  <h2 class="text-base font-bold text-gray-900">Nueva encuesta</h2>
                  <p class="text-xs text-gray-400">
                    Paso {{ wizardPaso() }} de 2 — {{ wizardPaso() === 1 ? 'Ficha e instructores' : 'Preguntas' }}
                  </p>
                </div>
                <button (click)="cerrarWizard()" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div class="mt-4 flex gap-1.5">
                <div class="h-1.5 flex-1 rounded-full transition-all duration-300" [class]="wizardPaso() >= 1 ? 'bg-[#39A900]' : 'bg-gray-200'"></div>
                <div class="h-1.5 flex-1 rounded-full transition-all duration-300" [class]="wizardPaso() >= 2 ? 'bg-[#39A900]' : 'bg-gray-200'"></div>
              </div>
            </div>

            <!-- ── Body ── -->
            <div class="flex-1 overflow-y-auto p-6">
              @if (wizardPaso() === 1) {
                <!-- ── PASO 1: Ficha e instructores ── -->
                <div class="space-y-4">
                  <div>
                    <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ficha</label>
                    <div class="mt-1">
                      <app-ss [options]="fichaOptions()" placeholder="Busca una ficha..." [(ngModel)]="fichaId"></app-ss>
                    </div>
                  </div>

                  <div>
                    <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Instructores a evaluar
                      <span class="normal-case font-normal text-gray-400">— puedes elegir varios</span>
                    </label>

                    <!-- Chips de seleccionados -->
                    @if (instructorIds.size > 0) {
                      <div class="flex flex-wrap gap-1.5 mt-1.5">
                        @for (id of instructorIds; track id) {
                          <span class="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-[#39A900]/10 text-[#2d8500] text-xs font-semibold">
                            {{ nombreInstructor(id) }}
                            <button type="button" (click)="toggleInstructor(id)"
                              class="w-4 h-4 rounded-full hover:bg-[#39A900]/20 flex items-center justify-center leading-none">
                              ×
                            </button>
                          </span>
                        }
                      </div>
                    }

                    <!-- Buscador + lista para agregar -->
                    <div class="relative mt-1.5">
                      <input type="text" [(ngModel)]="busquedaInstructor" [ngModelOptions]="{standalone: true}"
                        placeholder="🔍︎ Buscar instructor por nombre..."
                        class="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#39A900] transition-colors" />
                    </div>
                    <div class="mt-1.5 max-h-40 overflow-y-auto space-y-0.5 border border-gray-200 rounded-xl p-1.5">
                      @for (i of instructoresFiltrados(); track i.id) {
                        <label class="flex items-center gap-2 text-sm text-gray-700 px-1.5 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50">
                          <input type="checkbox" [checked]="instructorIds.has(i.id)" (change)="toggleInstructor(i.id)" />
                          {{ i.nombre }}
                        </label>
                      }
                      @if (instructoresFiltrados().length === 0) {
                        <p class="text-xs text-gray-400 text-center py-3">Sin resultados para "{{ busquedaInstructor }}"</p>
                      }
                    </div>
                  </div>

                  <div>
                    <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Fecha y hora límite (opcional)
                    </label>
                    <div class="mt-1 grid grid-cols-2 gap-2">
                      <app-date-input [ngModel]="fechaLimiteFecha()" (ngModelChange)="fechaLimiteFecha.set($event)"
                        [min]="fechaMinima"></app-date-input>
                      <app-time-input [ngModel]="fechaLimiteHora()" (ngModelChange)="fechaLimiteHora.set($event)"></app-time-input>
                    </div>
                    <p class="text-xs text-gray-400 mt-1">
                      Si la defines, las encuestas se cierran solas al llegar esa hora. También se cierran solas
                      antes, en cuanto respondan todos los aprendices de la ficha.
                    </p>
                  </div>
                </div>
              } @else {
                <!-- ── PASO 2: Preguntas ── -->
                <div class="space-y-4">
                  <!-- Resumen de lo elegido en el paso 1 -->
                  <div class="p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <p class="text-xs font-semibold text-gray-500 mb-1.5">Ficha e instructores seleccionados</p>
                    <p class="text-xs text-gray-700"><strong>Ficha:</strong> {{ fichaResumenLabel() }}</p>
                    <div class="flex flex-wrap gap-1 mt-1.5">
                      @for (id of instructorIds; track id) {
                        <span class="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-xs text-gray-600">{{ nombreInstructor(id) }}</span>
                      }
                    </div>
                  </div>

                  <div>
                    <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Preguntas base (para todos)</label>
                    @if (preguntasDisponibles().length === 0) {
                      <p class="text-xs text-gray-400 mt-2">
                        No hay preguntas activas todavía.
                        <a routerLink="/encuestas/preguntas" class="text-[#39A900] font-semibold">Crea algunas aquí</a>.
                      </p>
                    } @else {
                      <div class="mt-1 max-h-40 overflow-y-auto space-y-1.5 border border-gray-200 rounded-xl p-2">
                        @for (p of preguntasDisponibles(); track p.id) {
                          <label class="flex items-center gap-2 text-sm text-gray-700 px-1 py-1">
                            <input type="checkbox" [checked]="preguntaIds.has(p.id)" (change)="togglePregunta(p.id)" />
                            {{ p.texto }}
                          </label>
                        }
                      </div>
                    }
                  </div>

                  <div>
                    <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Preguntas adicionales por instructor
                      <span class="normal-case font-normal text-gray-400">— opcional</span>
                    </label>
                    <div class="mt-1.5 space-y-1.5">
                      @for (id of instructorIds; track id) {
                        <div class="border border-gray-200 rounded-xl p-2">
                          <button type="button" (click)="toggleExtraAbierto(id)"
                            class="flex items-center justify-between w-full text-sm font-semibold text-gray-700 px-1 py-0.5">
                            <span>{{ nombreInstructor(id) }}</span>
                            <span class="text-xs font-normal"
                              [class.text-[#2d8500]]="extraSet(id).size > 0"
                              [class.text-gray-400]="extraSet(id).size === 0">
                              {{ extraSet(id).size > 0 ? extraSet(id).size + ' extra' : 'Sin extras' }}
                            </span>
                          </button>
                          @if (extraAbiertoId() === id) {
                            @if (preguntasExtraDisponibles().length === 0) {
                              <p class="text-xs text-gray-400 mt-1.5 px-1">No hay más preguntas disponibles fuera de las base.</p>
                            } @else {
                              <div class="mt-1.5 max-h-32 overflow-y-auto space-y-1 border-t border-gray-100 pt-1.5">
                                @for (p of preguntasExtraDisponibles(); track p.id) {
                                  <label class="flex items-center gap-2 text-xs text-gray-600 px-1.5 py-1 rounded-lg hover:bg-gray-50 cursor-pointer">
                                    <input type="checkbox" [checked]="extraSet(id).has(p.id)" (change)="toggleExtra(id, p.id)" />
                                    {{ p.texto }}
                                  </label>
                                }
                              </div>
                            }
                          }
                        </div>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>

            <!-- ── Footer ── -->
            <div class="px-6 py-4 border-t border-gray-100 flex-shrink-0 flex justify-between gap-3">
              @if (wizardPaso() === 1) {
                <button (click)="cerrarWizard()" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  Cancelar
                </button>
                <button (click)="irPasoPreguntas()"
                  [disabled]="!fichaId || instructorIds.size === 0"
                  class="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-semibold bg-[#39A900] hover:bg-[#2d8400] disabled:opacity-50 transition-all">
                  Siguiente
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              } @else {
                <button (click)="wizardPaso.set(1)" class="flex items-center gap-1 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path d="M15 19l-7-7 7-7"/>
                  </svg>
                  Atrás
                </button>
                <button
                  (click)="crearEncuestas()"
                  [disabled]="preguntaIds.size === 0 || guardando()"
                  class="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#39A900] hover:bg-[#2d8400] disabled:opacity-50">
                  {{ guardando() ? 'Creando...' : (instructorIds.size > 1 ? 'Crear ' + instructorIds.size + ' encuestas' : 'Crear encuesta') }}
                </button>
              }
            </div>
          }

        </div>
      </div>
    }
  `,
})
export class EncuestasComponent implements OnInit, OnDestroy {
  api      = inject(EncuestasApiService);
  private catalogo = inject(ErpCatalogoService);
  private toast    = inject(ToastService);
  private confirm  = inject(ConfirmationService);
  private realtime = inject(EncuestasRealtimeService);

  filtros: { value: Filtro; label: string }[] = [
    { value: 'TODAS', label: 'Todas' },
    { value: 'ACTIVA', label: 'Activas' },
    { value: 'CERRADA', label: 'Cerradas' },
  ];

  encuestas = signal<Encuesta[]>([]);
  loading   = signal(false);
  filtro    = signal<Filtro>('TODAS');

  // ── Búsqueda + filtros por ficha/instructor + paginación ──────────────────
  busqueda          = signal('');
  filtroFichaId     = signal('');
  filtroInstructorId = signal('');
  page        = signal(1);
  rowsPerPage = signal(10);

  fichasFiltro = computed(() => {
    const map = new Map<string, string>();
    for (const e of this.encuestas()) map.set(e.fichaId, e.numeroFicha);
    return [...map.entries()]
      .map(([id, numero]) => ({ id, numero }))
      .sort((a, b) => a.numero.localeCompare(b.numero));
  });

  instructoresFiltro = computed(() => {
    const map = new Map<string, string>();
    for (const e of this.encuestas()) map.set(e.instructorId, e.instructorNombre);
    return [...map.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  filtradas = computed(() => {
    let rows = this.encuestas();
    const q = this.busqueda().trim().toLowerCase();
    if (q) {
      rows = rows.filter((e) =>
        e.numeroFicha.toLowerCase().includes(q) || e.instructorNombre.toLowerCase().includes(q));
    }
    const fichaId = this.filtroFichaId();
    if (fichaId) rows = rows.filter((e) => e.fichaId === fichaId);
    const instructorId = this.filtroInstructorId();
    if (instructorId) rows = rows.filter((e) => e.instructorId === instructorId);
    return rows;
  });

  pages = computed(() => Math.max(1, Math.ceil(this.filtradas().length / this.rowsPerPage())));
  paged = computed(() => {
    const start = (this.page() - 1) * this.rowsPerPage();
    return this.filtradas().slice(start, start + this.rowsPerPage());
  });

  resetPage(): void { this.page.set(1); }

  linkVisibleId    = signal<string | null>(null);
  metricasVisibles = signal<MetricasEncuesta | null>(null);

  // ── Wizard ──────────────────────────────────────────────────────────────
  wizardAbierto  = signal(false);
  wizardPaso     = signal(1);
  guardando      = signal(false);
  fichas         = signal<{ id: string; codigo: string; programa: string }[]>([]);
  instructores   = signal<InstructorInfo[]>([]);
  preguntasDisponibles = signal<Pregunta[]>([]);
  encuestasCreadas = signal<Encuesta[]>([]);
  fichaId = '';
  instructorIds = new Set<string>();
  preguntaIds = new Set<string>();
  private preguntaIdsExtraPorInstructor = new Map<string, Set<string>>();
  extraAbiertoId = signal<string | null>(null);
  busquedaInstructor = '';
  fechaLimiteFecha = signal<TuiDay | null>(null);
  fechaLimiteHora  = signal('');
  /** Para el [min] de <app-date-input> — no deja elegir el pasado. */
  fechaMinima = TuiDay.currentLocal();

  // Referencia guardada para poder des-registrar exactamente este handler
  // en ngOnDestroy sin cerrar el socket compartido (ver comentario en
  // EncuestasRealtimeService.off) — otras páginas siguen usándolo.
  private onEncuestaActualizada = (ev: { id: string; respuestasActuales: number; maxRespuestas: number; estado: string; fechaFin: string | null }) => {
    this.encuestas.update((lista) => {
      const filtroActual = this.filtro();
      const yaNoCalza = filtroActual !== 'TODAS' && filtroActual !== ev.estado;
      if (yaNoCalza) return lista.filter((e) => e.id !== ev.id);
      return lista.map((e) => e.id === ev.id
        ? { ...e, respuestasActuales: ev.respuestasActuales, maxRespuestas: ev.maxRespuestas, estado: ev.estado as EstadoEncuesta, fechaFin: ev.fechaFin }
        : e);
    });
  };

  ngOnInit(): void {
    this.cargar();
    this.realtime.onEncuestaActualizada(this.onEncuestaActualizada);
  }

  ngOnDestroy(): void {
    this.realtime.off('encuesta:actualizada', this.onEncuestaActualizada);
  }

  porcentajeProgreso(e: Encuesta): number {
    return e.maxRespuestas > 0 ? (e.respuestasActuales / e.maxRespuestas) * 100 : 0;
  }

  colorProgreso(e: Encuesta): string {
    const pct = this.porcentajeProgreso(e);
    if (pct >= 80) return 'bg-[#39A900]';
    if (pct >= 40) return 'bg-amber-500';
    return 'bg-red-400';
  }

  async cargar(): Promise<void> {
    this.loading.set(true);
    this.linkVisibleId.set(null);
    this.metricasVisibles.set(null);
    try {
      const actual = this.filtro();
      const estado = actual === 'TODAS' ? undefined : (actual as EstadoEncuesta);
      this.encuestas.set(await this.api.getEncuestas(estado));
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudieron cargar las encuestas.');
    } finally {
      this.loading.set(false);
    }
  }

  async abrirWizard(): Promise<void> {
    this.wizardAbierto.set(true);
    this.wizardPaso.set(1);
    this.encuestasCreadas.set([]);
    this.fichaId = '';
    this.instructorIds = new Set();
    this.preguntaIds = new Set();
    this.preguntaIdsExtraPorInstructor = new Map();
    this.extraAbiertoId.set(null);
    this.busquedaInstructor = '';
    this.fechaLimiteFecha.set(null);
    this.fechaLimiteHora.set('');
    try {
      const [fichas, instructores, preguntas] = await Promise.all([
        this.catalogo.getFichas(),
        this.api.getInstructores(),
        this.api.getPreguntas(true),
      ]);
      this.fichas.set(fichas);
      this.instructores.set(instructores);
      this.preguntasDisponibles.set(preguntas);
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo cargar la información necesaria.');
    }
  }

  cerrarWizard(): void {
    this.wizardAbierto.set(false);
    if (this.encuestasCreadas().length > 0) this.cargar();
  }

  togglePregunta(id: string): void {
    if (this.preguntaIds.has(id)) this.preguntaIds.delete(id);
    else this.preguntaIds.add(id);
  }

  toggleInstructor(id: string): void {
    if (this.instructorIds.has(id)) {
      this.instructorIds.delete(id);
      this.preguntaIdsExtraPorInstructor.delete(id);
      if (this.extraAbiertoId() === id) this.extraAbiertoId.set(null);
    } else {
      this.instructorIds.add(id);
      this.preguntaIdsExtraPorInstructor.set(id, new Set());
    }
  }

  toggleExtraAbierto(instructorId: string): void {
    this.extraAbiertoId.set(this.extraAbiertoId() === instructorId ? null : instructorId);
  }

  extraSet(instructorId: string): Set<string> {
    return this.preguntaIdsExtraPorInstructor.get(instructorId) ?? new Set();
  }

  toggleExtra(instructorId: string, preguntaId: string): void {
    const set = this.preguntaIdsExtraPorInstructor.get(instructorId) ?? new Set<string>();
    if (set.has(preguntaId)) set.delete(preguntaId);
    else set.add(preguntaId);
    this.preguntaIdsExtraPorInstructor.set(instructorId, set);
  }

  /** Preguntas elegibles como "extra" — se excluyen las ya marcadas como base para no duplicar. */
  preguntasExtraDisponibles(): Pregunta[] {
    return this.preguntasDisponibles().filter((p) => !this.preguntaIds.has(p.id));
  }

  fichaOptions(): SSOption[] {
    return this.fichas().map((f) => ({ value: f.id, label: `${f.codigo} — ${f.programa}` }));
  }

  fichaSelectOptions = computed<SSOption[]>(() => [
    { value: '', label: 'Todas las fichas' },
    ...this.fichasFiltro().map((f) => ({ value: f.id, label: f.numero })),
  ]);

  instructorSelectOptions = computed<SSOption[]>(() => [
    { value: '', label: 'Todos los instructores' },
    ...this.instructoresFiltro().map((i) => ({ value: i.id, label: i.nombre })),
  ]);

  fichaResumenLabel(): string {
    const f = this.fichas().find((f) => f.id === this.fichaId);
    return f ? `${f.codigo} — ${f.programa}` : '';
  }

  irPasoPreguntas(): void {
    if (!this.fichaId || this.instructorIds.size === 0) return;
    this.wizardPaso.set(2);
  }

  nombreInstructor(id: string): string {
    return this.instructores().find((i) => i.id === id)?.nombre ?? '';
  }

  instructoresFiltrados(): InstructorInfo[] {
    const q = this.busquedaInstructor.trim().toLowerCase();
    if (!q) return this.instructores();
    return this.instructores().filter((i) => i.nombre.toLowerCase().includes(q));
  }

  /** Combina fecha (TuiDay) + hora ('HH:mm') en un ISO string local → UTC. Hora vacía = fin del día. */
  private combinarFechaLimite(): string | undefined {
    const fecha = this.fechaLimiteFecha();
    if (!fecha) return undefined;
    const hora = this.fechaLimiteHora();
    const [h, m] = hora ? hora.split(':').map(Number) : [23, 59];
    return new Date(fecha.year, fecha.month, fecha.day, h, m).toISOString();
  }

  async crearEncuestas(): Promise<void> {
    if (!this.fichaId || this.instructorIds.size === 0 || this.preguntaIds.size === 0) return;
    this.guardando.set(true);
    try {
      const creadas = await this.api.crearEncuestas({
        fichaId: this.fichaId,
        preguntaIdsBase: [...this.preguntaIds],
        instructores: [...this.instructorIds].map((instructorId) => ({
          instructorId,
          preguntaIdsExtra: [...(this.preguntaIdsExtraPorInstructor.get(instructorId) ?? new Set())],
        })),
        fechaLimite: this.combinarFechaLimite(),
      });
      this.encuestasCreadas.set(creadas);
      this.toast.ok('Creadas', `${creadas.length} encuesta${creadas.length !== 1 ? 's' : ''} creada${creadas.length !== 1 ? 's' : ''} correctamente.`);
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudieron crear las encuestas.');
    } finally {
      this.guardando.set(false);
    }
  }

  mostrarLink(e: Encuesta): void {
    this.metricasVisibles.set(null);
    this.linkVisibleId.set(this.linkVisibleId() === e.id ? null : e.id);
  }

  async descargarExcel(id: string): Promise<void> {
    try {
      await this.api.descargarExcel(id);
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo descargar el Excel.');
    }
  }

  async descargarPdf(id: string): Promise<void> {
    try {
      await this.api.descargarPdf(id);
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo descargar el PDF.');
    }
  }

  async verResultados(e: Encuesta): Promise<void> {
    this.linkVisibleId.set(null);
    if (this.metricasVisibles()?.encuesta.id === e.id) {
      this.metricasVisibles.set(null);
      return;
    }
    try {
      this.metricasVisibles.set(await this.api.getMetricas(e.id));
    } catch (err: any) {
      this.toast.httpError(err, 'No se pudieron cargar los resultados.');
    }
  }

  confirmarCerrar(e: Encuesta): void {
    this.confirm.confirm({
      message: `¿Cerrar la encuesta de la ficha ${e.numeroFicha} (${e.instructorNombre})? Ya no se podrán registrar más respuestas.`,
      header: 'Confirmar cierre',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, cerrar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        try {
          await this.api.cerrarEncuesta(e.id);
          this.toast.ok('Cerrada', 'La encuesta fue cerrada correctamente.');
          await this.cargar();
        } catch (err: any) {
          this.toast.httpError(err, 'No se pudo cerrar la encuesta.');
        }
      },
    });
  }

  /** Un solo link por grupo — resuelve el siguiente instructor pendiente al abrirse (ver ResponderGrupoComponent). */
  linkDeGrupo(grupoId: string): string {
    return `${window.location.origin}/responder-grupo/${grupoId}`;
  }

  grupoIdCreado(): string {
    return this.encuestasCreadas()[0]?.grupoId ?? '';
  }

  qrUrl(link: string): string {
    const data = encodeURIComponent(link);
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${data}`;
  }

  async copiar(texto: string): Promise<void> {
    await navigator.clipboard.writeText(texto);
    this.toast.info('Copiado', 'Link copiado al portapapeles.');
  }
}
