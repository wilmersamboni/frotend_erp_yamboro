import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type { Modulo } from '../config/admin.config';

type Cargo = 'instructor' | 'aprendiz' | 'administrador';

@Component({
  selector: 'app-admin-inicio',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">

      <!-- ── Intro ── -->
      <div>
        <h2 class="text-lg font-bold text-gray-900">¿Qué necesitas hacer hoy?</h2>
        <p class="text-sm text-gray-500 mt-1">Elige una tarea y te guiamos paso a paso.</p>
      </div>

      <!-- ── Personas ── -->
      <div>
        <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Personas</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          <!-- Registrar persona: pregunta el rol en un popover anclado, sin cambiar de pantalla -->
          <div class="relative">
            <button (click)="mostrarRoles.set(!mostrarRoles())"
              class="group relative w-full flex flex-col gap-3 p-5 rounded-xl border-2 border-gray-100 bg-white hover:border-[#39A900]/40 hover:bg-[#39A900]/5 transition-all duration-200 text-left">
              <div class="w-10 h-10 rounded-xl bg-[#39A900]/10 group-hover:bg-[#39A900]/20
                          flex items-center justify-center transition-colors">
                <lucide-icon name="user-plus" [size]="18" class="text-[#39A900]"></lucide-icon>
              </div>
              <div>
                <p class="font-bold text-gray-900 text-sm group-hover:text-[#2d8500] transition-colors">
                  Registrar una persona nueva
                </p>
                <p class="text-xs text-gray-500 mt-0.5">Instructor, aprendiz o administrador</p>
              </div>
            </button>

            @if (mostrarRoles()) {
              <!-- Backdrop invisible para cerrar al hacer clic afuera -->
              <div class="fixed inset-0 z-40" (click)="mostrarRoles.set(false)"></div>

              <div class="absolute z-50 top-full left-0 mt-2 w-72 max-w-[90vw] bg-white rounded-xl shadow-xl border border-gray-100 p-3">
                <p class="text-xs font-semibold text-gray-500 px-1 mb-2">¿Qué tipo de persona es?</p>

                <button (click)="elegirRol('instructor')"
                  class="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-blue-50 transition-colors text-left">
                  <div class="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <lucide-icon name="graduation-cap" [size]="15" class="text-blue-600"></lucide-icon>
                  </div>
                  <span class="text-sm font-semibold text-gray-800">Instructor</span>
                </button>

                <button (click)="elegirRol('aprendiz')"
                  class="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-emerald-50 transition-colors text-left">
                  <div class="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <lucide-icon name="user" [size]="15" class="text-emerald-600"></lucide-icon>
                  </div>
                  <span class="text-sm font-semibold text-gray-800">Aprendiz</span>
                </button>

                @if (isAdminErp) {
                  <button (click)="elegirRol('administrador')"
                    class="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-purple-50 transition-colors text-left">
                    <div class="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <lucide-icon name="shield-check" [size]="15" class="text-purple-600"></lucide-icon>
                    </div>
                    <span class="text-sm font-semibold text-gray-800">Administrador</span>
                  </button>
                }
              </div>
            }
          </div>

        </div>
      </div>

      <!-- ── Académico ── -->
      <div>
        <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Académico</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          <button (click)="crear.emit('matriculas')"
            class="group relative flex flex-col gap-3 p-5 rounded-xl border-2 border-gray-100 bg-white hover:border-amber-300 hover:bg-amber-50/40 transition-all duration-200 text-left">
            <div class="w-10 h-10 rounded-xl bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center transition-colors">
              <lucide-icon name="clipboard-plus" [size]="18" class="text-amber-600"></lucide-icon>
            </div>
            <div>
              <p class="font-bold text-gray-900 text-sm group-hover:text-amber-700 transition-colors">
                Matricular un estudiante
              </p>
              <p class="text-xs text-gray-500 mt-0.5">Asigna un aprendiz a un curso</p>
            </div>
          </button>

          <button (click)="crear.emit('cursos')"
            class="group relative flex flex-col gap-3 p-5 rounded-xl border-2 border-gray-100 bg-white hover:border-amber-300 hover:bg-amber-50/40 transition-all duration-200 text-left">
            <div class="w-10 h-10 rounded-xl bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center transition-colors">
              <lucide-icon name="book-open" [size]="18" class="text-amber-600"></lucide-icon>
            </div>
            <div>
              <p class="font-bold text-gray-900 text-sm group-hover:text-amber-700 transition-colors">
                Crear un curso
              </p>
              <p class="text-xs text-gray-500 mt-0.5">Define fechas, área y programa</p>
            </div>
          </button>

          <button (click)="crear.emit('programas')"
            class="group relative flex flex-col gap-3 p-5 rounded-xl border-2 border-gray-100 bg-white hover:border-amber-300 hover:bg-amber-50/40 transition-all duration-200 text-left">
            <div class="w-10 h-10 rounded-xl bg-amber-100 group-hover:bg-amber-200 flex items-center justify-center transition-colors">
              <lucide-icon name="book-open" [size]="18" class="text-amber-600"></lucide-icon>
            </div>
            <div>
              <p class="font-bold text-gray-900 text-sm group-hover:text-amber-700 transition-colors">
                Crear un programa
              </p>
              <p class="text-xs text-gray-500 mt-0.5">Tecnólogo, técnico o auxiliar</p>
            </div>
          </button>
        </div>
      </div>

      <!-- ── Seguimiento de práctica ── -->
      @if (vePractica) {
        <div>
          <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Seguimiento de práctica</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            <button (click)="crear.emit('etapas')"
              class="group relative flex flex-col gap-3 p-5 rounded-xl border-2 border-gray-100 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 transition-all duration-200 text-left">
              <div class="w-10 h-10 rounded-xl bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center transition-colors">
                <lucide-icon name="clipboard-plus" [size]="18" class="text-indigo-600"></lucide-icon>
              </div>
              <div>
                <p class="font-bold text-gray-900 text-sm group-hover:text-indigo-700 transition-colors">
                  Iniciar una práctica
                </p>
                <p class="text-xs text-gray-500 mt-0.5">Matricula, empresa y modalidad</p>
              </div>
            </button>

            <button (click)="irModulo.emit('seguimientos')"
              class="group relative flex flex-col gap-3 p-5 rounded-xl border-2 border-gray-100 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 transition-all duration-200 text-left">
              <div class="w-10 h-10 rounded-xl bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center transition-colors">
                <lucide-icon name="clipboard-check" [size]="18" class="text-indigo-600"></lucide-icon>
              </div>
              <div>
                <p class="font-bold text-gray-900 text-sm group-hover:text-indigo-700 transition-colors">
                  Dar seguimiento
                </p>
                <p class="text-xs text-gray-500 mt-0.5">Bitácoras, observaciones y estados</p>
              </div>
            </button>

            <button (click)="irModulo.emit('empresas')"
              class="group relative flex flex-col gap-3 p-5 rounded-xl border-2 border-gray-100 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 transition-all duration-200 text-left">
              <div class="w-10 h-10 rounded-xl bg-indigo-100 group-hover:bg-indigo-200 flex items-center justify-center transition-colors">
                <lucide-icon name="building-2" [size]="18" class="text-indigo-600"></lucide-icon>
              </div>
              <div>
                <p class="font-bold text-gray-900 text-sm group-hover:text-indigo-700 transition-colors">
                  Gestionar empresas
                </p>
                <p class="text-xs text-gray-500 mt-0.5">Empresas y convenios de práctica</p>
              </div>
            </button>
          </div>
        </div>
      }

      <!-- ── Modo avanzado ── -->
      <div class="text-center pt-1">
        <button (click)="verTodo.emit()"
          class="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <lucide-icon name="layout-grid" [size]="14"></lucide-icon>
          Ver todo (modo avanzado)
        </button>
      </div>

    </div>
  `,
})
export class AdminInicioComponent {
  @Input() isAdminErp = false;
  @Input() vePractica = false;

  /** Acciones que crean UN registro directamente (abren el modal encima de esta pantalla). */
  @Output() crear            = new EventEmitter<Modulo>();
  /** Acciones que necesitan elegir entre varios registros existentes (van al modo avanzado). */
  @Output() irModulo         = new EventEmitter<Modulo>();
  @Output() registrarPersona = new EventEmitter<Cargo>();
  @Output() verTodo          = new EventEmitter<void>();

  mostrarRoles = signal(false);

  elegirRol(cargo: Cargo): void {
    this.registrarPersona.emit(cargo);
    this.mostrarRoles.set(false);
  }
}
