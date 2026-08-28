import { Component, OnInit, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';

import { EncuestasApiService, Pregunta } from '../../../core/services/encuestas/encuestas-api.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-preguntas',
  standalone: true,
  imports: [FormsModule, RouterLink, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast position="top-right" [baseZIndex]="9999" />
    <p-confirmdialog />

    <div class="bg-gradient-to-br from-gray-50 via-blue-50/30 to-gray-50 p-3 sm:p-4 lg:p-8">
      <div class="max-w-3xl mx-auto space-y-4 sm:space-y-6">

        <!-- ── Header ── -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 flex-shrink-0 rounded-xl bg-gradient-to-br from-[#39A900] to-[#2d8500]
                        flex items-center justify-center shadow-lg shadow-[#39A900]/20">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div class="min-w-0">
              <h1 class="text-2xl font-bold text-gray-900 tracking-tight">Banco de Preguntas</h1>
              <p class="text-muted text-sm">
                {{ preguntas().length }} pregunta{{ preguntas().length !== 1 ? 's' : '' }} · se usan al armar una nueva encuesta
              </p>
            </div>
          </div>
          <a routerLink="/encuestas"
            class="flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold rounded-xl text-gray-600 bg-white border border-gray-200 hover:border-[#39A900]/40 hover:text-[#2d8500] hover:bg-[#39A900]/5 transition-all duration-200">
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/>
            </svg>
            Volver a Encuestas
          </a>
        </div>

        <!-- ── Card principal ── -->
        <div class="bg-white rounded-2xl shadow-xl border border-gray-200/60 p-3 sm:p-6 space-y-4 sm:space-y-6">

          <!-- Crear pregunta -->
          <form (ngSubmit)="crear()" class="flex flex-col sm:flex-row gap-2">
            <input
              [(ngModel)]="nuevoTexto"
              name="nuevoTexto"
              type="text"
              placeholder="Ej: ¿El instructor explicó los temas con claridad?"
              class="flex-1 px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#39A900]/20 focus:border-[#39A900] focus:bg-white transition-all"
            />
            <button
              type="submit"
              [disabled]="!nuevoTexto.trim() || guardando()"
              class="group flex items-center justify-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-xl
                     shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]
                     disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
              style="background: linear-gradient(135deg, #39A900 0%, #2d8500 100%)">
              <svg class="w-4 h-4 group-hover:rotate-90 transition-transform duration-300"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
              </svg>
              Agregar
            </button>
          </form>

          <!-- Cargando -->
          @if (loading()) {
            <div class="flex justify-center py-16 text-sm text-gray-400">Cargando preguntas...</div>
          }

          <!-- Estado vacío -->
          @if (!loading() && preguntas().length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center">
              <div class="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl mb-4">❓</div>
              <p class="text-gray-500 font-medium">Todavía no hay preguntas registradas</p>
              <p class="text-sm text-gray-400 mt-1">Agrega la primera con el formulario de arriba.</p>
            </div>
          }

          <!-- Lista -->
          @if (!loading() && preguntas().length > 0) {
            <ul class="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
              @for (p of preguntas(); track p.id) {
                <li class="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50/60">
                  <span class="text-sm text-gray-800" [class.line-through]="!p.activo" [class.text-gray-400]="!p.activo">
                    {{ p.texto }}
                  </span>
                  <div class="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      (click)="toggleActivo(p)"
                      [class]="'px-2.5 py-1 rounded-lg text-xs font-bold transition-all ' +
                        (p.activo ? 'bg-[#39A900]/10 text-[#2d8500]' : 'bg-gray-100 text-gray-500')">
                      {{ p.activo ? 'Activa' : 'Inactiva' }}
                    </button>
                    <button
                      (click)="eliminar(p)"
                      class="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all"
                      title="Eliminar">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        </div>

      </div>
    </div>
  `,
})
export class PreguntasComponent implements OnInit {
  private api   = inject(EncuestasApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmationService);

  preguntas = signal<Pregunta[]>([]);
  loading   = signal(false);
  guardando = signal(false);
  nuevoTexto = '';

  ngOnInit(): void { this.cargar(); }

  async cargar(): Promise<void> {
    this.loading.set(true);
    try {
      this.preguntas.set(await this.api.getPreguntas());
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudieron cargar las preguntas.');
    } finally {
      this.loading.set(false);
    }
  }

  async crear(): Promise<void> {
    const texto = this.nuevoTexto.trim();
    if (!texto) return;
    this.guardando.set(true);
    try {
      await this.api.crearPregunta(texto);
      this.nuevoTexto = '';
      this.toast.ok('Agregada', 'Pregunta creada correctamente.');
      await this.cargar();
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo crear la pregunta.');
    } finally {
      this.guardando.set(false);
    }
  }

  async toggleActivo(p: Pregunta): Promise<void> {
    try {
      await this.api.actualizarPregunta(p.id, { activo: !p.activo });
      await this.cargar();
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo actualizar la pregunta.');
    }
  }

  eliminar(p: Pregunta): void {
    this.confirm.confirm({
      message: `¿Eliminar la pregunta "${p.texto}"? Esta acción no se puede deshacer.`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.api.eliminarPregunta(p.id);
          this.toast.ok('Eliminada', 'Pregunta eliminada correctamente.');
          await this.cargar();
        } catch (e: any) {
          this.toast.httpError(e, 'No se pudo eliminar la pregunta.');
        }
      },
    });
  }
}
