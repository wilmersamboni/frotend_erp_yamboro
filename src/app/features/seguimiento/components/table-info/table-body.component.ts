// ─────────────────────────────────────────────────────────────────────────────
// table-body.component.ts  — <tbody> con todas las celdas
// ─────────────────────────────────────────────────────────────────────────────
import { Component, input, output, inject, signal, HostListener } from '@angular/core';
import { NgClass } from '@angular/common';
import {
  Column, Aprendiz,
  initials, avatarColor, avanceValor, avanceColor,
  ColumnUid,
} from './table-info.types';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-table-body',
  standalone: true,
  imports: [NgClass],
  host: {
    style: 'display: contents'
  },
  template: `
    <tbody>
      @if (rows().length === 0) {
        <tr>
          <td [attr.colspan]="columns().length"
            class="text-center text-gray-400 py-10 text-sm">
            No hay registros
          </td>
        </tr>
      }

      @for (item of rows(); track item.id; let odd = $odd) {
        <tr class="transition-colors duration-150 hover:bg-[#39A900]/5"
          [class.bg-white]="!odd"
          [class.bg-[#F8FFFE]]="odd">

          @for (col of columns(); track col.uid) {
            <td class="py-3 px-4 border-b border-gray-50 text-gray-700 text-sm">

              @switch (col.uid) {

                <!-- ── Nombre + avatar ── -->
                @case ('name') {
                  <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center
                                 text-xs font-bold flex-shrink-0"
                      [class]="avatarCls(item.name)">
                      {{ getInitials(item.name) }}
                    </div>
                    <div class="flex flex-col">
                      <span class="text-sm font-medium text-gray-800">{{ item.name }} {{item.lastName}}</span>
                      <span class="text-xs text-gray-400">{{ item.email }}</span>
                    </div>
                  </div>
                }

                <!-- ── Estado ── -->
                @case ('estado') {
                  @if (!item.id_practica) {
                    <span title="Sin etapa práctica asignada"
                      class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-400 cursor-help">
                      ! Sin práctica
                    </span>
                  } @else {
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium
                                  px-2 py-1 rounded-full capitalize"
                      [ngClass]="estadoBadgeCls(item.estado)">
                      <span class="w-1.5 h-1.5 rounded-full"
                        [ngClass]="estadoDotCls(item.estado)">
                      </span>
                      {{ item.estado }}
                    </span>
                  }
                }

                <!-- ── Observación ── -->
                @case ('observacion') {
                  @if (item.observacion) {
                    <span class="text-sm text-gray-600 line-clamp-1 max-w-[150px] border-b border-dashed border-gray-300 cursor-help"
                      [title]="item.observacion">
                      {{ item.observacion }}
                    </span>
                  } @else {
                    <span class="text-xs text-gray-300">—</span>
                  }
                }

                <!-- ── Avance Práctica ── -->
                @case ('avance') {
                  @if (item.id_practica) {
                    <div class="flex items-center gap-2 min-w-[80px]">
                      <div class="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500"
                          [style.width.%]="getAvanceValor(item.avance)"
                          [style.background-color]="getAvanceColor(item.avance)">
                        </div>
                      </div>
                      <span class="text-xs font-medium text-gray-500 min-w-[30px]">
                        {{ getAvanceValor(item.avance) }}%
                      </span>
                    </div>
                  } @else {
                    <span class="text-xs text-gray-300">—</span>
                  }
                }

                <!-- ── Acciones ── -->
                @case ('actions') {
                  <div class="flex items-center gap-1">

                    <!-- Ver seguimientos: todos los roles -->
                    <button (click)="verSeguimientos.emit(item)" title="Ver seguimientos"
                      class="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-all duration-150">
                      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/>
                        <line x1="16" y1="17" x2="8" y2="17"/>
                        <polyline points="10 9 9 9 8 9"/>
                      </svg>
                    </button>

                    <!-- Realizar observación: solo admin e instructor -->
                    @if (canObservar()) {
                      @if (item.id_practica) {
                        <button (click)="verObservacion.emit(item)" title="Realizar observación"
                          class="p-1.5 rounded-lg text-gray-400 hover:text-[#39A900] hover:bg-[#39A900]/10 transition-all duration-150">
                          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                      } @else {
                        <button disabled title="Sin etapa práctica"
                          class="p-1.5 rounded-lg text-gray-200 cursor-not-allowed">
                          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                      }
                    }

                    <!-- Editar práctica: solo admin -->
                    @if (canCrearPractica() && item.id_practica) {
                      <button (click)="editarPractica.emit(item)"
                        title="Editar etapa práctica"
                        class="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all duration-150">
                        <!-- Pencil square icon -->
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <path d="M9 12l2 2 4-4"/>
                        </svg>
                      </button>
                    }

                    <!-- Cambiar estado: solo admin, solo si tiene etapa -->
                    @if (canCrearPractica() && item.id_practica) {
                      <div class="relative" (click)="$event.stopPropagation()">
                        <button
                          (click)="toggleEstadoMenu(String(item.id_practica))"
                          title="Cambiar estado"
                          class="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-all duration-150">
                          <!-- Tag / label icon -->
                          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round"
                              d="M7 7h.01M7 3h5.379a2 2 0 011.414.586l7.621 7.621a2 2 0 010 2.828l-5.379 5.379a2 2 0 01-2.828 0L5.586 11.793A2 2 0 015 10.414V5a2 2 0 012-2z"/>
                          </svg>
                        </button>

                        @if (openEstadoMenu() === String(item.id_practica)) {
                          <div class="absolute right-0 top-8 z-[60] bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[160px]">
                            @for (est of ESTADOS; track est.key) {
                              <button
                                (click)="cambiarEstado.emit({ item: item, estado: est.key });
                                         openEstadoMenu.set(null)"
                                [disabled]="item.estado === est.key"
                                class="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-left
                                       hover:bg-gray-50 transition-colors
                                       disabled:opacity-40 disabled:cursor-default">
                                <span class="w-2 h-2 rounded-full flex-shrink-0"
                                  [ngClass]="est.dot"></span>
                                <span [ngClass]="est.text">{{ est.label }}</span>
                                @if (item.estado === est.key) {
                                  <svg class="ml-auto w-3 h-3 text-gray-400" fill="none"
                                    stroke="currentColor" viewBox="0 0 24 24">
                                    <polyline stroke-width="2.5" points="20 6 9 17 4 12"/>
                                  </svg>
                                }
                              </button>
                            }
                          </div>
                        }
                      </div>
                    }

                    <!-- Gestionar instructores: solo admin, solo si tiene etapa -->
                    @if (canCrearPractica() && item.id_practica) {
                      <button (click)="gestionarAsignaciones.emit(item)"
                        title="Gestionar instructores asignados"
                        class="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-all duration-150">
                        <!-- Users icon -->
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                      </button>
                    }

                    <!-- Crear práctica: solo admin, solo si no tiene una -->
                    @if (canCrearPractica() && !item.id_practica) {
                      @if (!item.id_matricula) {
                        <!-- Sin matrícula → bloqueado, es el requisito previo -->
                        <button disabled
                          title="El aprendiz no tiene una matrícula registrada. Crea la matrícula antes de asignar la etapa práctica."
                          class="p-1.5 rounded-lg text-gray-300 cursor-not-allowed bg-gray-50 transition-all duration-150">
                          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round"
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"/>
                          </svg>
                        </button>
                      } @else if (item.resultados_aprobados) {
                        <!-- Resultados aprobados → botón activo -->
                        <button (click)="crearPractica.emit(item)" title="Crear etapa práctica"
                          class="p-1.5 rounded-lg text-gray-400 hover:text-[#39A900] hover:bg-[#39A900]/10 transition-all duration-150">
                          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="16"/>
                            <line x1="8" y1="12" x2="16" y2="12"/>
                          </svg>
                        </button>
                      } @else {
                        <!-- Resultados no aprobados aún → bloqueado con tooltip -->
                        <button disabled
                          title="El aprendiz no tiene todos los resultados de aprendizaje aprobados (excepto etapa práctica)"
                          class="p-1.5 rounded-lg text-orange-300 cursor-not-allowed bg-orange-50 transition-all duration-150">
                          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round"
                              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71
                                 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                          </svg>
                        </button>
                      }
                    }

                  </div>
                }

                <!-- ── Celda genérica ── -->
                @default {
                  {{ getValue(item, col.uid) }}
                }

              }
            </td>
          }
        </tr>
      }
    </tbody>
  `,
})
export class TableBodyComponent {
  private auth = inject(AuthService);

  // ── Inputs ─────────────────────────────────────────────────────────────────
  rows      = input.required<Aprendiz[]>();
  columns   = input.required<Column[]>();

  // ── Outputs ────────────────────────────────────────────────────────────────
  verSeguimientos         = output<Aprendiz>();
  verObservacion          = output<Aprendiz>();
  crearPractica           = output<Aprendiz>();
  editarPractica          = output<Aprendiz>();
  cambiarEstado           = output<{ item: Aprendiz; estado: string }>();
  gestionarAsignaciones   = output<Aprendiz>();

  // ── Estado dropdown ─────────────────────────────────────────────────────────
  readonly ESTADOS = [
    { key: 'activo',            label: 'Activo',            dot: 'bg-green-500',  text: 'text-green-700'  },
    { key: 'inactivo',          label: 'Inactivo',          dot: 'bg-red-500',    text: 'text-red-600'    },
    { key: 'suspendido',        label: 'Suspendido',        dot: 'bg-yellow-500', text: 'text-yellow-700' },
    { key: 'condicionado',      label: 'Condicionado',      dot: 'bg-amber-500',  text: 'text-amber-700'  },
    { key: 'certificado',       label: 'Certificado',       dot: 'bg-blue-500',   text: 'text-blue-600'   },
    { key: 'por certificar',    label: 'Por certificar',    dot: 'bg-indigo-500', text: 'text-indigo-600' },
    { key: 'cancelado',         label: 'Cancelado',         dot: 'bg-rose-500',   text: 'text-rose-600'   },
    { key: 'retiro voluntario', label: 'Retiro Voluntario', dot: 'bg-slate-400',  text: 'text-slate-600'  },
  ];

  openEstadoMenu = signal<string | null>(null);

  @HostListener('document:click')
  onDocumentClick(): void {
    this.openEstadoMenu.set(null);
  }

  toggleEstadoMenu(id: string): void {
    this.openEstadoMenu.update(v => v === id ? null : id);
  }

  // ── Permisos por rol ────────────────────────────────────────────────────────
  canObservar() {
    return this.auth.hasRole(['administrador', 'administrador_erp', 'instructor'])
      || this.auth.tieneServicio('practica.seguimientos.gestionar');
  }
  canCrearPractica() {
    return this.auth.hasRole(['administrador', 'administrador_erp'])
      || this.auth.tieneServicio('practica.seguimientos.administrar');
  }

  // ── Badges de estado ────────────────────────────────────────────────────────
  private static readonly ESTADOS_CONOCIDOS = [
    'activo', 'inactivo', 'suspendido', 'condicionado',
    'certificado', 'por certificar', 'cancelado', 'retiro voluntario',
  ];

  estadoBadgeCls(estado: string): object {
    const e = (estado ?? '').toLowerCase();
    return {
      'bg-green-100  text-green-700':  e === 'activo',
      'bg-red-100    text-red-600':    e === 'inactivo',
      'bg-yellow-100 text-yellow-700': e === 'suspendido',
      'bg-amber-100  text-amber-700':  e === 'condicionado',
      'bg-indigo-100 text-indigo-600': e === 'por certificar',
      'bg-blue-100   text-blue-600':   e === 'certificado',
      'bg-rose-100   text-rose-600':   e === 'cancelado',
      'bg-slate-100  text-slate-600':  e === 'retiro voluntario',
      'bg-gray-100   text-gray-500':   !TableBodyComponent.ESTADOS_CONOCIDOS.includes(e),
    };
  }

  estadoDotCls(estado: string): object {
    const e = (estado ?? '').toLowerCase();
    return {
      'bg-green-500':  e === 'activo',
      'bg-red-500':    e === 'inactivo',
      'bg-yellow-500': e === 'suspendido',
      'bg-amber-500':  e === 'condicionado',
      'bg-indigo-500': e === 'por certificar',
      'bg-blue-500':   e === 'certificado',
      'bg-rose-500':   e === 'cancelado',
      'bg-slate-400':  e === 'retiro voluntario',
      'bg-gray-400':   !TableBodyComponent.ESTADOS_CONOCIDOS.includes(e),
    };
  }

  // ── Delegates a helpers puros ───────────────────────────────────────────────
  getInitials    = initials;
  avatarCls      = avatarColor;
  getAvanceValor = avanceValor;
  getAvanceColor = avanceColor;

  getValue(item: Aprendiz, key: ColumnUid) {
    if (key === 'actions') return '—';
    return item[key] ?? '—';
  }

  String = String;
}
