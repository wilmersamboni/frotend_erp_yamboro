import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges,
  signal, computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';

import { TuiButton } from '@taiga-ui/core';
import { TuiDay } from '@taiga-ui/cdk';
import { DateInputComponent } from '../../../shared/components/date-input.component';

interface AsignacionVM {
  id: string;
  instructor: string;       // UUID
  instructorNombre: string; // nombre legible
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
  horas: number;
  editando: boolean;        // modo edición inline
}

/**
 * Modal para gestionar los instructores asignados a una etapa práctica.
 * Permite listar, agregar, editar e inactivar asignaciones.
 */
@Component({
  selector: 'app-gestionar-asignaciones-modal',
  standalone: true,
  imports: [FormsModule, TuiButton, DateInputComponent],
  styles: [`tui-textfield { display: block; }`],
  template: `
    @if (isOpen) {
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
           (click)="$event.target === $event.currentTarget && closed.emit()">

        <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

          <!-- ── Header ── -->
          <div class="px-6 py-4 border-b border-gray-100 flex-shrink-0 flex items-start justify-between">
            <div>
              <h2 class="text-lg font-bold text-gray-800">Instructores asignados</h2>
              @if (alumno) {
                <p class="text-xs text-gray-400 mt-0.5">{{ alumno.name }} · {{ alumno.programa }}</p>
              }
            </div>
            <button (click)="closed.emit()"
              class="text-gray-400 hover:text-gray-600 transition-colors p-1">
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <!-- ── Body ── -->
          <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-4">

            @if (cargando()) {
              <div class="flex justify-center py-8">
                <div class="w-7 h-7 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
              </div>
            } @else {

              <!-- Lista de asignaciones existentes -->
              @if (asignaciones().length === 0) {
                <div class="text-center py-8 text-gray-400 text-sm">
                  <svg class="mx-auto mb-2 opacity-30" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  Esta etapa no tiene instructores asignados aún
                </div>
              } @else {
                <div class="flex flex-col gap-3">
                  @for (a of asignaciones(); track a.id) {

                    @if (!a.editando) {
                      <!-- ── Tarjeta de asignación ── -->
                      <div class="border rounded-xl p-4 flex items-start gap-3 transition-all"
                        [class.border-green-200]="a.estado === 'activo'"
                        [class.bg-green-50]="a.estado === 'activo'"
                        [class.border-gray-200]="a.estado !== 'activo'"
                        [class.bg-gray-50]="a.estado !== 'activo'">

                        <!-- Avatar instructor -->
                        <div class="w-9 h-9 rounded-full flex items-center justify-center
                                    text-xs font-bold flex-shrink-0"
                          [class.bg-green-200]="a.estado === 'activo'"
                          [class.text-green-800]="a.estado === 'activo'"
                          [class.bg-gray-200]="a.estado !== 'activo'"
                          [class.text-gray-500]="a.estado !== 'activo'">
                          {{ initials(a.instructorNombre) }}
                        </div>

                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-semibold text-sm text-gray-800 truncate">
                              {{ a.instructorNombre || 'Instructor' }}
                            </span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
                              [class.bg-green-100]="a.estado === 'activo'"
                              [class.text-green-700]="a.estado === 'activo'"
                              [class.bg-gray-200]="a.estado !== 'activo'"
                              [class.text-gray-500]="a.estado !== 'activo'">
                              {{ a.estado }}
                            </span>
                          </div>
                          <p class="text-xs text-gray-500 mt-0.5">
                            {{ formatFecha(a.fecha_inicio) }} → {{ formatFecha(a.fecha_fin) }}
                            &nbsp;·&nbsp; {{ a.horas }} h
                          </p>
                        </div>

                        <!-- Acciones de la tarjeta -->
                        <div class="flex items-center gap-1 flex-shrink-0">
                          <!-- Editar -->
                          <button (click)="iniciarEdicion(a)"
                            title="Editar asignación"
                            class="p-1.5 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-all">
                            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                          </button>

                          <!-- Activar / Inactivar -->
                          @if (a.estado === 'activo') {
                            <button (click)="cambiarEstado(a, 'inactivo')"
                              title="Inactivar asignación"
                              class="p-1.5 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-all">
                              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                              </svg>
                            </button>
                          } @else {
                            <button (click)="cambiarEstado(a, 'activo')"
                              title="Activar asignación"
                              class="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-all">
                              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="9 12 11 14 15 10"/>
                              </svg>
                            </button>
                          }

                          <!-- Eliminar -->
                          <button (click)="eliminar(a)"
                            title="Eliminar asignación"
                            class="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
                            <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                              <path d="M10 11v6"/><path d="M14 11v6"/>
                              <path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>

                    } @else {
                      <!-- ── Formulario de edición inline ── -->
                      <div class="border-2 border-indigo-200 rounded-xl p-4 bg-indigo-50/40 flex flex-col gap-3">
                        <p class="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Editando asignación</p>

                        <!-- Instructor autocomplete -->
                        <div>
                          <label class="text-xs text-gray-500 mb-1 block">Instructor</label>
                          <div class="relative">
                            <input type="text" [value]="editTextoInstructor"
                              (input)="onEditBuscarInstructor($any($event.target).value)"
                              (focus)="editMostrarLista = true"
                              (blur)="ocultarEditListaConDelay()"
                              placeholder="Buscar instructor…"
                              autocomplete="off"
                              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            @if (editMostrarLista && instructoresFiltradosEdit().length > 0) {
                              <div class="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto mt-1">
                                @for (inst of instructoresFiltradosEdit(); track inst.idPersona ?? inst.id_persona) {
                                  <button type="button" (mousedown)="seleccionarInstructorEdit(a, inst)"
                                    class="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex justify-between items-center">
                                    <span>{{ inst.nombre }}</span>
                                    <span class="text-[10px] text-gray-400 capitalize">{{ inst.cargo }}</span>
                                  </button>
                                }
                              </div>
                            }
                          </div>
                        </div>

                        <!-- Fechas y horas -->
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label class="text-xs text-gray-500 mb-1 block">Fecha inicio</label>
                            <app-date-input [ngModel]="dateVal(a.fecha_inicio)"
                              (ngModelChange)="a.fecha_inicio = tuiDayToISO($event)"
                              name="fi_{{ a.id }}"></app-date-input>
                          </div>
                          <div>
                            <label class="text-xs text-gray-500 mb-1 block">Fecha fin</label>
                            <app-date-input [ngModel]="dateVal(a.fecha_fin)"
                              (ngModelChange)="a.fecha_fin = tuiDayToISO($event)"
                              name="ff_{{ a.id }}"></app-date-input>
                          </div>
                          <div>
                            <label class="text-xs text-gray-500 mb-1 block">Horas</label>
                            <input type="number" min="1" [(ngModel)]="a.horas" name="h_{{ a.id }}"
                              class="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                          </div>
                        </div>

                        <!-- Botones edición -->
                        <div class="flex gap-2 justify-end">
                          <button (click)="cancelarEdicion(a)"
                            class="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-all">
                            Cancelar
                          </button>
                          <button (click)="guardarEdicion(a)"
                            [disabled]="guardando()"
                            class="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white
                                   hover:bg-indigo-700 transition-all disabled:opacity-50">
                            {{ guardando() ? 'Guardando…' : 'Guardar' }}
                          </button>
                        </div>
                      </div>
                    }
                  }
                </div>
              }

              <!-- Separador -->
              <div class="border-t border-dashed border-gray-200 pt-4">

                @if (!mostrarFormNuevo()) {
                  <!-- Botón abrir formulario nueva asignación -->
                  <button (click)="mostrarFormNuevo.set(true)"
                    class="w-full flex items-center justify-center gap-2 py-2.5
                           border-2 border-dashed border-[#39A900]/30 rounded-xl
                           text-sm text-[#39A900] hover:bg-[#39A900]/5 transition-all">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                    Agregar nuevo instructor
                  </button>

                } @else {
                  <!-- ── Formulario nueva asignación ── -->
                  <div class="border-2 border-[#39A900]/30 rounded-xl p-4 bg-[#39A900]/5 flex flex-col gap-3">
                    <p class="text-xs font-semibold text-[#39A900] uppercase tracking-wide">Nueva asignación</p>

                    <!-- Instructor -->
                    <div>
                      <label class="text-xs text-gray-500 mb-1 block">Instructor *</label>
                      <div class="relative">
                        <input type="text" [value]="nuevoTextoInstructor"
                          (input)="onNuevoBuscarInstructor($any($event.target).value)"
                          (focus)="nuevoMostrarLista = true"
                          (blur)="ocultarNuevoListaConDelay()"
                          placeholder="Buscar instructor o administrador…"
                          autocomplete="off"
                          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/40" />
                        @if (nuevoMostrarLista && instructoresFiltradosNuevo().length > 0) {
                          <div class="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto mt-1">
                            @for (inst of instructoresFiltradosNuevo(); track inst.idPersona ?? inst.id_persona) {
                              <button type="button" (mousedown)="seleccionarInstructorNuevo(inst)"
                                class="w-full text-left px-3 py-2 text-sm hover:bg-[#39A900]/10 flex justify-between items-center">
                                <span>{{ inst.nombre }}</span>
                                <span class="text-[10px] text-gray-400 capitalize">{{ inst.cargo }}</span>
                              </button>
                            }
                          </div>
                        }
                      </div>
                    </div>

                    <!-- Fechas y horas -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">Fecha inicio *</label>
                        <app-date-input [ngModel]="dateVal(nuevaAsignacion.fecha_inicio)"
                          (ngModelChange)="nuevaAsignacion.fecha_inicio = tuiDayToISO($event)"
                          name="n_fi"></app-date-input>
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">Fecha fin *</label>
                        <app-date-input [ngModel]="dateVal(nuevaAsignacion.fecha_fin)"
                          (ngModelChange)="nuevaAsignacion.fecha_fin = tuiDayToISO($event)"
                          name="n_ff"></app-date-input>
                      </div>
                      <div>
                        <label class="text-xs text-gray-500 mb-1 block">Horas *</label>
                        <input type="number" min="1" [(ngModel)]="nuevaAsignacion.horas" name="n_h"
                          class="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/40" />
                      </div>
                    </div>

                    @if (errorNuevo()) {
                      <p class="text-red-500 text-xs">{{ errorNuevo() }}</p>
                    }

                    <div class="flex gap-2 justify-end">
                      <button (click)="cancelarNueva()"
                        class="px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-all">
                        Cancelar
                      </button>
                      <button (click)="guardarNueva()"
                        [disabled]="guardando()"
                        class="px-3 py-1.5 text-xs rounded-lg bg-[#39A900] text-white
                               hover:bg-[#2d8000] transition-all disabled:opacity-50">
                        {{ guardando() ? 'Creando…' : 'Crear asignación' }}
                      </button>
                    </div>
                  </div>
                }

              </div>

              @if (error()) {
                <p class="text-red-500 text-xs text-center">{{ error() }}</p>
              }

            }
          </div>

          <!-- ── Footer ── -->
          <div class="px-6 py-3 border-t border-gray-100 flex-shrink-0 flex justify-end">
            <button tuiButton appearance="outline" size="m" (click)="closed.emit()">
              Cerrar
            </button>
          </div>

        </div>
      </div>
    }
  `,
})
export class GestionarAsignacionesModalComponent implements OnChanges {

  @Input() isOpen = false;
  @Input() alumno: any = null;
  @Output() closed = new EventEmitter<void>();

  /* ── Señales ── */
  cargando   = signal(false);
  guardando  = signal(false);
  error      = signal('');
  errorNuevo = signal('');
  asignaciones   = signal<AsignacionVM[]>([]);
  instructores   = signal<any[]>([]);
  mostrarFormNuevo = signal(false);

  /* ── Nueva asignación ── */
  nuevaAsignacion = { instructor: '', fecha_inicio: '', fecha_fin: '', horas: 0 };
  nuevoTextoInstructor = '';
  nuevoMostrarLista    = false;

  instructoresFiltradosNuevo = computed(() => {
    const t = this.nuevoTextoInstructor.toLowerCase().trim();
    if (!t) return this.instructores();
    return this.instructores().filter(p => (p.nombre ?? '').toLowerCase().includes(t));
  });

  /* ── Edición inline ── */
  editTextoInstructor = '';
  editMostrarLista    = false;
  private editInstructorId = '';

  instructoresFiltradosEdit = computed(() => {
    const t = this.editTextoInstructor.toLowerCase().trim();
    if (!t) return this.instructores();
    return this.instructores().filter(p => (p.nombre ?? '').toLowerCase().includes(t));
  });

  /* ── Snapshot para cancelar edición ── */
  private snapshots = new Map<string, Partial<AsignacionVM>>();

  constructor(private api: ApiService, private toast: ToastService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue && this.alumno?.id_practica) {
      this.error.set('');
      this.mostrarFormNuevo.set(false);
      this.cargar();
    }
  }

  /* ── Carga ── */
  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const [asigs, insts] = await Promise.all([
        this.api.listarAsignacionesPorEtapa(String(this.alumno.id_practica)),
        this.api.listarInstructores(),
      ]);
      this.instructores.set(insts);

      // Resolver nombres de instructores
      this.asignaciones.set(asigs.map((a: any) => {
        const persona = insts.find((p: any) =>
          String(p.idPersona ?? p.id_persona ?? p.id) === String(a.instructor)
        );
        return {
          id:               a.id,
          instructor:       a.instructor,
          instructorNombre: persona?.nombre ?? a.instructor,
          fecha_inicio:     this.toInputDate(a.fecha_inicio),
          fecha_fin:        this.toInputDate(a.fecha_fin),
          estado:           a.estado ?? 'activo',
          horas:            a.horas ?? 0,
          editando:         false,
        } as AsignacionVM;
      }));
    } catch (e: any) {
      this.error.set('Error cargando asignaciones.');
      this.toast.httpError(e, 'No se pudieron cargar las asignaciones.');
    } finally {
      this.cargando.set(false);
    }
  }

  /* ── Helpers ── */
  initials(nombre: string): string {
    return (nombre ?? '').split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase();
  }

  formatFecha(iso: string): string {
    if (!iso) return '—';
    const [y, m, d] = iso.substring(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }

  /** Normaliza fecha de BD (puede venir como Date object o string) a 'YYYY-MM-DD' */
  private toInputDate(val: any): string {
    if (!val) return '';
    const s = String(val);
    return s.substring(0, 10);
  }

  /* ── Helpers de fecha para <app-date-input> (trabaja con TuiDay, el form guarda ISO) ── */
  // Cacheado por string ISO: sin cachear, cada llamada devolvía un TuiDay NUEVO
  // para la misma fecha lógica y <app-date-input> lo trataba como un cambio
  // real, reemitiendo (ngModelChange) y disparando un loop infinito de CD que
  // congelaba la pestaña (mismo bug ya corregido en programador-eventos.component.ts).
  private readonly dateValCache = new Map<string, TuiDay>();

  dateVal(iso: string): TuiDay | null {
    if (!iso) return null;
    const key = iso.substring(0, 10);
    const parts = key.split('-');
    if (parts.length !== 3) return null;
    let day = this.dateValCache.get(key);
    if (!day) {
      day = new TuiDay(+parts[0], +parts[1] - 1, +parts[2]);
      this.dateValCache.set(key, day);
    }
    return day;
  }

  tuiDayToISO(day: TuiDay | null): string {
    if (!day) return '';
    const m = String(day.month + 1).padStart(2, '0');
    const d = String(day.day).padStart(2, '0');
    return `${day.year}-${m}-${d}`;
  }

  /* ── Edición inline ── */
  iniciarEdicion(a: AsignacionVM): void {
    // guardar snapshot para restaurar al cancelar
    this.snapshots.set(a.id, {
      instructor: a.instructor, instructorNombre: a.instructorNombre,
      fecha_inicio: a.fecha_inicio, fecha_fin: a.fecha_fin,
      horas: a.horas,
    });
    this.editTextoInstructor = a.instructorNombre;
    this.editInstructorId    = a.instructor;
    this.editMostrarLista    = false;
    this.asignaciones.update(list => list.map(x => ({ ...x, editando: x.id === a.id })));
  }

  cancelarEdicion(a: AsignacionVM): void {
    const snap = this.snapshots.get(a.id);
    if (snap) {
      this.asignaciones.update(list => list.map(x =>
        x.id === a.id ? { ...x, ...snap, editando: false } : x
      ));
    } else {
      this.asignaciones.update(list => list.map(x => ({ ...x, editando: false })));
    }
    this.editTextoInstructor = '';
    this.editInstructorId    = '';
  }

  async guardarEdicion(a: AsignacionVM): Promise<void> {
    this.guardando.set(true);
    try {
      const datos: any = {
        fecha_inicio: a.fecha_inicio,
        fecha_fin:    a.fecha_fin,
        horas:        Math.floor(Number(a.horas)),
      };
      if (this.editInstructorId && this.editInstructorId !== a.instructor) {
        datos.instructor = this.editInstructorId;
      }
      await this.api.actualizarAsignacion(a.id, datos);

      // actualizar nombre si cambió el instructor
      if (datos.instructor) {
        const persona = this.instructores().find(p =>
          String(p.idPersona ?? p.id_persona ?? p.id) === datos.instructor
        );
        this.asignaciones.update(list => list.map(x =>
          x.id === a.id
            ? { ...x, instructor: datos.instructor, instructorNombre: persona?.nombre ?? datos.instructor, editando: false }
            : x
        ));
      } else {
        this.asignaciones.update(list => list.map(x =>
          x.id === a.id ? { ...x, editando: false } : x
        ));
      }
      this.toast.ok('Asignación actualizada', 'Los cambios fueron guardados correctamente.');
    } catch (e: any) {
      this.toast.httpError(e, 'Error al guardar la asignación.');
      console.error('[GestionarAsignaciones] Error al editar:', e?.error);
    } finally {
      this.guardando.set(false);
    }
  }

  async cambiarEstado(a: AsignacionVM, nuevoEstado: string): Promise<void> {
    try {
      await this.api.actualizarAsignacion(a.id, { estado: nuevoEstado });
      this.asignaciones.update(list =>
        list.map(x => x.id === a.id ? { ...x, estado: nuevoEstado } : x)
      );
      this.toast.ok('Estado actualizado', `La asignación ahora está ${nuevoEstado}.`);
    } catch (e: any) {
      this.toast.httpError(e, 'Error al cambiar el estado.');
    }
  }

  async eliminar(a: AsignacionVM): Promise<void> {
    if (!confirm(`¿Eliminar la asignación de "${a.instructorNombre}"?`)) return;
    try {
      await this.api.eliminarAsignacion(a.id);
      this.asignaciones.update(list => list.filter(x => x.id !== a.id));
      this.toast.ok('Asignación eliminada', `La asignación de ${a.instructorNombre} fue eliminada.`);
    } catch (e: any) {
      this.toast.httpError(e, 'Error al eliminar la asignación.');
    }
  }

  /* ── Nueva asignación ── */
  cancelarNueva(): void {
    this.mostrarFormNuevo.set(false);
    this.resetNueva();
  }

  async guardarNueva(): Promise<void> {
    if (!this.alumno?.id_practica) { this.errorNuevo.set('No se encontró la etapa práctica.'); return; }
    if (!this.nuevaAsignacion.instructor) { this.errorNuevo.set('Selecciona un instructor.'); return; }
    if (!this.nuevaAsignacion.fecha_inicio) { this.errorNuevo.set('Ingresa la fecha de inicio.'); return; }
    if (!this.nuevaAsignacion.fecha_fin) { this.errorNuevo.set('Ingresa la fecha de fin.'); return; }
    if (!this.nuevaAsignacion.horas || this.nuevaAsignacion.horas < 1) { this.errorNuevo.set('Ingresa las horas (mínimo 1).'); return; }

    this.guardando.set(true);
    this.errorNuevo.set('');
    try {
      await this.api.crearAsignacion({
        instructor:   this.nuevaAsignacion.instructor,
        fecha_inicio: this.nuevaAsignacion.fecha_inicio,
        fecha_fin:    this.nuevaAsignacion.fecha_fin,
        estado:       'activo',
        horas:        Math.floor(Number(this.nuevaAsignacion.horas)),
        etapaId:      String(this.alumno.id_practica),
      });
      this.toast.ok('Asignación creada', 'El instructor fue asignado correctamente.');
      this.cancelarNueva();
      await this.cargar();
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo crear la asignación.');
      console.error('[GestionarAsignaciones] Error al crear:', e?.error);
    } finally {
      this.guardando.set(false);
    }
  }

  private resetNueva(): void {
    this.nuevaAsignacion    = { instructor: '', fecha_inicio: '', fecha_fin: '', horas: 0 };
    this.nuevoTextoInstructor = '';
    this.nuevoMostrarLista    = false;
    this.errorNuevo.set('');
  }

  /* ── Autocomplete nueva asignación ── */
  onNuevoBuscarInstructor(t: string): void {
    this.nuevoTextoInstructor = t;
    this.nuevoMostrarLista    = true;
    if (!t.trim()) this.nuevaAsignacion.instructor = '';
  }
  seleccionarInstructorNuevo(inst: any): void {
    this.nuevaAsignacion.instructor = String(inst.idPersona ?? inst.id_persona ?? inst.id ?? '');
    this.nuevoTextoInstructor        = inst.nombre ?? '';
    this.nuevoMostrarLista           = false;
  }
  ocultarNuevoListaConDelay(): void {
    setTimeout(() => { this.nuevoMostrarLista = false; }, 200);
  }

  /* ── Autocomplete edición ── */
  onEditBuscarInstructor(t: string): void {
    this.editTextoInstructor = t;
    this.editMostrarLista    = true;
    if (!t.trim()) this.editInstructorId = '';
  }
  seleccionarInstructorEdit(a: AsignacionVM, inst: any): void {
    this.editInstructorId    = String(inst.idPersona ?? inst.id_persona ?? inst.id ?? '');
    this.editTextoInstructor = inst.nombre ?? '';
    this.editMostrarLista    = false;
    // También actualizar el nombre en la VM para que se vea el cambio inmediato al guardar
    this.asignaciones.update(list => list.map(x =>
      x.id === a.id ? { ...x, instructorNombre: inst.nombre ?? '' } : x
    ));
  }
  ocultarEditListaConDelay(): void {
    setTimeout(() => { this.editMostrarLista = false; }, 200);
  }
}
