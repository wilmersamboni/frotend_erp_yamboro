import { Component, Input, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EtapaPracticaItem } from '../../../shared/models/estudiante.model';
import { PracticaService } from '../../../core/services/practica.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-etapa-practica-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-xl border border-gray-100 p-4 mb-4 bg-gray-50/50">

      <!-- Cabecera -->
      <div class="flex flex-wrap items-center gap-3 mb-3">
        <span class="text-sm font-semibold text-gray-800">
          {{ practica.programa || 'Programa sin nombre' }}
        </span>
        <span class="text-xs text-gray-400 font-mono">{{ practica.fichaCurso }}</span>
        <span class="ml-auto text-xs font-medium px-2 py-1 rounded-full
                     bg-[#39A900]/10 text-[#39A900]">
          {{ practica.estado || 'sin estado' }}
        </span>
      </div>

      <!-- Datos basicos -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600 mb-3">
        <div>
          <p class="text-gray-400">Inicio</p>
          <p>{{ practica.fechaInicio | date:'mediumDate' }}</p>
        </div>
        <div>
          <p class="text-gray-400">Fin</p>
          <p>{{ practica.fechaFin | date:'mediumDate' }}</p>
        </div>
        <div>
          <p class="text-gray-400">Empresa</p>
          <p>{{ practica.empresa || '—' }}</p>
        </div>
        <div>
          <p class="text-gray-400">Modalidad</p>
          <p>{{ practica.modalidad || '—' }}</p>
        </div>
      </div>

      @if (practica.observacion) {
        <p class="text-xs text-gray-500 italic mb-3">{{ practica.observacion }}</p>
      }

      <!-- Instructores asignados -->
      @if (practica.asignaciones.length) {
        <div class="mb-3">
          <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Instructores asignados
          </p>
          <div class="flex flex-wrap gap-2">
            @for (a of practica.asignaciones; track a.id) {
              <div class="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs">
                <div class="flex items-center gap-2 mb-0.5">
                  <span class="w-2 h-2 rounded-full flex-shrink-0"
                    [class.bg-green-400]="a.estado === 'activo'"
                    [class.bg-gray-300]="a.estado !== 'activo'"></span>
                  <span class="font-semibold text-gray-800">{{ nombreInstructor(a.instructor) }}</span>
                </div>
                <p class="text-gray-500 mb-0.5">
                  <span class="capitalize">{{ a.estado }}</span> · {{ a.horas }}h asignadas
                </p>
                <p class="text-gray-400">
                  {{ a.fechaInicio | date:'shortDate' }} →
                  {{ a.fechaFin   | date:'shortDate' }}
                </p>
              </div>
            }
          </div>
        </div>
      }

      <!-- Documentos adjuntos -->
      @if (cargandoDocs) {
        <div class="flex items-center gap-2 text-xs text-gray-400 mb-3">
          <div class="w-3 h-3 border-2 border-gray-200 border-t-[#39A900] rounded-full animate-spin"></div>
          Cargando documentos...
        </div>
      } @else if (docs.length) {
        <div class="mb-3">
          <p class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Documentos ({{ docs.length }})
          </p>
          <div class="flex flex-wrap gap-2">
            @for (doc of docs; track doc.id) {
              <button
                type="button"
                (click)="descargar(doc)"
                [disabled]="descargando() === doc.id"
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors border border-blue-100 disabled:opacity-60 disabled:cursor-wait"
                [title]="doc.nombre_original + ' (' + formatBytes(doc.tamanio) + ')'">
                @if (descargando() === doc.id) {
                  <div class="w-3 h-3 border-2 border-blue-300 border-t-blue-700
                              rounded-full animate-spin flex-shrink-0"></div>
                } @else {
                  <span class="font-bold text-[10px] bg-blue-200 text-blue-800 px-1 py-0.5 rounded">
                    {{ iconoDoc(doc.tipo_mime) }}
                  </span>
                }
                <span class="max-w-[140px] truncate">{{ doc.nombre_original }}</span>
                <span class="text-blue-400 text-[10px]">{{ formatBytes(doc.tamanio) }}</span>
                <svg class="w-3 h-3 text-blue-400 flex-shrink-0" fill="none"
                     viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round"
                        d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11"/>
                </svg>
              </button>
            }
          </div>
        </div>
      } @else {
        <p class="text-[11px] text-gray-400 italic mb-3">Sin documentos adjuntos.</p>
      }

      <!-- Seguimientos -->
      @if (practica.seguimientos.length) {
        <div class="space-y-2">
          @for (s of practica.seguimientos; track s.id; let i = $index) {
            <div class="bg-white border border-gray-100 rounded-lg p-3">

              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-xs font-semibold text-gray-700">
                  Seguimiento #{{ i + 1 }}
                </span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                  {{ s.estado }}
                </span>
                @if (s.actasPdf) {
                  <span class="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                    Acta
                  </span>
                }
                <span class="ml-auto text-[11px] text-gray-400">
                  {{ s.fechaInicio | date:'shortDate' }} →
                  {{ s.fechaFin   | date:'shortDate' }}
                </span>
              </div>

              @if (s.observacion) {
                <p class="text-[11px] text-gray-500 mb-2 italic">{{ s.observacion }}</p>
              }

              <!-- Bitacoras -->
              @if (s.bitacoras.length) {
                <div class="mb-2">
                  <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Bitácoras ({{ s.bitacoras.length }})
                  </p>
                  <ul class="text-[11px] text-gray-600 list-disc pl-4 space-y-0.5">
                    @for (b of s.bitacoras; track b.id) {
                      <li>
                        {{ b.fecha | date:'shortDate' }} —
                        <span class="font-medium"
                          [class.text-green-600]="b.estado === 'aceptada'"
                          [class.text-yellow-600]="b.estado === 'pendiente'"
                          [class.text-red-500]="b.estado === 'rechazada'">
                          {{ b.estado }}
                        </span>
                        @if (b.pdf) { <span class="text-gray-400"> · PDF</span> }
                      </li>
                    }
                  </ul>
                </div>
              } @else {
                <p class="text-[11px] text-gray-400 italic mb-2">Sin bitácoras.</p>
              }

              <!-- Observaciones del seguimiento -->
              @if (s.observaciones.length) {
                <div class="border-t border-gray-50 pt-2 mt-1">
                  <p class="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    Observaciones ({{ s.observaciones.length }})
                  </p>
                  <div class="space-y-1.5">
                    @for (obs of s.observaciones; track obs.id) {
                      <div class="bg-gray-50 rounded-lg px-3 py-2">
                        <p class="text-[10px] text-gray-400 mb-0.5">
                          {{ obs.fecha | date:'mediumDate' }}
                        </p>
                        <p class="text-[11px] text-gray-700 leading-snug">
                          {{ obs.descripcion }}
                        </p>
                      </div>
                    }
                  </div>
                </div>
              }

            </div>
          }
        </div>
      } @else {
        <p class="text-xs text-gray-400 italic">Sin seguimientos.</p>
      }
    </div>
  `,
})
export class EtapaPracticaCardComponent {
  @Input({ required: true }) practica!: EtapaPracticaItem;
  @Input() docs: any[]       = [];
  @Input() cargandoDocs      = false;
  /** UUID de persona → nombre. Se usa para resolver a.instructor a un nombre legible. */
  @Input() personasMap: Map<string, string> = new Map();

  nombreInstructor(instructorId: string): string {
    return this.personasMap.get(instructorId) ?? 'Instructor no encontrado';
  }

  private practicaSvc = inject(PracticaService);
  private toast       = inject(ToastService);

  descargando = signal<string | null>(null);

  async descargar(doc: any): Promise<void> {
    if (this.descargando()) return;
    this.descargando.set(doc.id);
    try {
      await this.practicaSvc.descargarDocumento(
        this.practica.id,
        doc.id,
        doc.nombre_original,
      );
    } catch {
      this.toast.warn('Error', 'No se pudo descargar el documento.');
    } finally {
      this.descargando.set(null);
    }
  }

  iconoDoc(tipoMime: string): string {
    if (tipoMime?.includes('pdf'))                               return 'PDF';
    if (tipoMime?.includes('word') || tipoMime?.includes('doc')) return 'DOC';
    if (tipoMime?.includes('sheet') || tipoMime?.includes('excel')) return 'XLS';
    if (tipoMime?.includes('image'))                             return 'IMG';
    if (tipoMime?.includes('zip'))                               return 'ZIP';
    return 'FILE';
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024)        return bytes + ' B';
    if (bytes < 1_048_576)   return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1_048_576).toFixed(1) + ' MB';
  }
}
