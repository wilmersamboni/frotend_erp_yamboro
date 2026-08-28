import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, signal, computed, ViewChild, ElementRef, inject
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { SeguimientoService } from '../../../core/services';
import { ToastService } from '../../../core/services/toast.service';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';

@Component({
  selector: 'app-observacion-modal',
  standalone: true,
  imports: [FormsModule, SearchableSelectComponent],
  template: `
    <!-- Input FUERA de @if para que ViewChild lo encuentre siempre -->
    <input #fileInput type="file" accept="image/jpeg,image/png,image/webp"
      style="display:none" (change)="onFotoSeleccionada($event)" />

    @if (isOpen && alumno) {
      <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        (click)="$event.target === $event.currentTarget && closed.emit()">

        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">

          <!-- Header -->
          <div class="px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <h2 class="text-lg font-bold text-gray-800">Registrar observación</h2>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-sm text-gray-500">{{ alumno.name }}</span>
              <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {{ alumno.programa }}
              </span>
            </div>
          </div>

          <!-- Cuerpo -->
          <div class="flex-1 overflow-y-auto px-6 pt-4 pb-2 space-y-4">

            <!-- ── Selector de seguimiento ── -->
            <div>
              <p class="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                Seguimiento
              </p>
              @if (cargandoSeguimientos()) {
                <div class="flex items-center gap-2 py-2 text-xs text-gray-400">
                  <svg class="animate-spin h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Cargando seguimientos...
                </div>
              } @else if (seguimientos().length === 0) {
                <div class="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                  <p class="text-xs text-amber-600">
                    No hay seguimientos registrados para esta etapa.
                  </p>
                </div>
              } @else {
                <app-ss [options]="seguimientoOptions()" placeholder="— Selecciona un seguimiento —"
                  [(ngModel)]="seguimientoSeleccionadoId"
                  (ngModelChange)="onSeguimientoChange($event)"></app-ss>
              }
            </div>

            <!-- ── Historial + Nueva observación (solo si hay seguimiento) ── -->
            @if (seguimientoSeleccionadoId) {

              <!-- Historial -->
              <div>
                @if (cargandoHistorial()) {
                  <p class="text-xs text-gray-400 text-center py-2">
                    Cargando observaciones anteriores...
                  </p>
                } @else if (historial().length > 0) {
                  <p class="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                    Observaciones anteriores
                  </p>
                  <div class="flex flex-col gap-2">
                    @for (obs of historial(); track obs.id) {
                      <div class="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <span class="text-[11px] text-gray-400 block mb-1">
                          {{ formatFecha(obs.fecha) }}
                        </span>
                        <p class="text-sm text-gray-700 leading-relaxed mb-2">
                          {{ obs.descripcion }}
                        </p>
                        @if (obs.evidencia_foto) {
                          <button type="button"
                            (click)="$event.stopPropagation(); abrirEvidencia(obs.evidencia_foto)"
                            class="inline-flex items-center gap-1 text-xs text-green-600 hover:underline cursor-pointer">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586
                                   a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6
                                   a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                            </svg>
                            Ver evidencia
                          </button>
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <p class="text-xs text-gray-400 text-center py-1">
                    Sin observaciones para este seguimiento.
                  </p>
                }
              </div>

              <!-- Nueva observación -->
              <div>
                <p class="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                  Nueva observación
                </p>

                <textarea
                  [(ngModel)]="texto"
                  (ngModelChange)="error.set('')"
                  rows="3"
                  placeholder="Escribe aquí la observación sobre el seguimiento..."
                  class="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none
                         resize-y transition-colors focus:ring-2 focus:ring-green-300"
                  [class.border-red-300]="error()"
                  [class.border-gray-200]="!error()"
                ></textarea>

                <!-- Evidencia fotográfica -->
                <div class="mt-3">
                  <p class="text-xs text-gray-500 mb-1.5">
                    Evidencia fotográfica
                    <span class="text-gray-400">(opcional · JPG, PNG, WEBP · máx 5 MB)</span>
                  </p>

                  @if (!fotoPreview()) {
                  <div
                    class="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors group"
                    (click)="abrirSelectorFoto()">
    <svg class="w-7 h-7 text-gray-300 group-hover:text-green-400 mb-1"
      fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586
           a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6
           a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>
    <span class="text-xs text-gray-400 group-hover:text-green-500">
      Haz clic para seleccionar una foto
    </span>
  </div>
} @else {
                    <!-- Con foto: preview + botón quitar -->
                    <div class="relative rounded-xl overflow-hidden border border-gray-200">
                      <img [src]="fotoPreview()" alt="Evidencia"
                        class="w-full h-40 object-cover"/>
                      <button type="button" (click)="quitarFoto()"
                        class="absolute top-2 right-2 bg-white/80 hover:bg-white
                               rounded-full p-1 shadow transition-colors">
                        <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor"
                          viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                      <div class="absolute bottom-0 left-0 right-0 bg-black/40 px-3 py-1">
                        <span class="text-white text-[11px] truncate block">
                          {{ fotoArchivo()?.name }}
                        </span>
                      </div>
                    </div>
                  }

                  @if (errorFoto()) {
                    <p class="text-red-500 text-xs mt-1">{{ errorFoto() }}</p>
                  }
                </div>

                @if (error()) {
                  <p class="text-red-500 text-xs mt-1">{{ error() }}</p>
                }
              </div>

            } <!-- fin @if seguimientoSeleccionadoId -->

          </div>

          <!-- Footer -->
          <div class="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button type="button" (click)="closed.emit()" [disabled]="loading()"
              class="px-4 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg
                     transition-colors font-medium disabled:opacity-60">
              Cancelar
            </button>
            <button type="button" (click)="guardar()"
              [disabled]="loading() || !seguimientoSeleccionadoId || !texto.trim()"
              class="px-5 py-2 text-sm text-white font-medium rounded-lg transition-all
                     disabled:opacity-60 shadow-md hover:shadow-lg"
              style="background: linear-gradient(to right, #39A900, #007832)">
              @if (loading()) {
                <span class="flex items-center gap-2">
                  <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10"
                      stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  {{ subiendoFoto() ? 'Subiendo foto...' : 'Guardando...' }}
                </span>
              } @else {
                Guardar observación
              }
            </button>
          </div>

        </div>
      </div>
    }
  `,
})
export class ObservacionModalComponent implements OnChanges {
  private seguimientoSvc = inject(SeguimientoService);
  private auth           = inject(AuthService);
  private toast          = inject(ToastService);
  @Input() isOpen  = false;
  @Input() alumno: any = null;
  @Output() closed  = new EventEmitter<void>();
  @Output() success = new EventEmitter<void>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  texto                     = '';
  seguimientoSeleccionadoId = '';

  loading              = signal(false);
  subiendoFoto         = signal(false);
  error                = signal('');
  errorFoto            = signal('');
  seguimientos         = signal<any[]>([]);
  historial            = signal<any[]>([]);
  cargandoSeguimientos = signal(false);
  cargandoHistorial    = signal(false);
  fotoArchivo          = signal<File | null>(null);
  fotoPreview          = signal<string | null>(null);

  seguimientoOptions = computed<SSOption[]>(() =>
    this.seguimientos().map((seg, i) => ({
      value: seg.id,
      label: `Seguimiento #${i + 1} — ${this.formatFecha(seg.fecha)}`,
    }))
  );

  // constructor(
  //   private api:  ApiService,
  //   private auth: AuthService,
  // ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue) {
      this.resetEstado();
      if (this.alumno?.id_practica) {
        this.cargarSeguimientos();
      }
    }
  }

  private resetEstado(): void {
    this.texto = '';
    this.seguimientoSeleccionadoId = '';
    this.error.set('');
    this.errorFoto.set('');
    this.historial.set([]);
    this.seguimientos.set([]);
    this.quitarFoto();
  }

  private async cargarSeguimientos(): Promise<void> {
    this.cargandoSeguimientos.set(true);
    try {
      const lista = await this.seguimientoSvc.obtenerSeguimientosPorEtapa(
        String(this.alumno.id_practica)
      );
      lista.sort((a: any, b: any) =>
        new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
      );
      this.seguimientos.set(lista);
    } catch {
      this.seguimientos.set([]);
    } finally {
      this.cargandoSeguimientos.set(false);
    }
  }

  async onSeguimientoChange(id: string): Promise<void> {
    this.texto = '';
    this.error.set('');
    this.historial.set([]);
    this.quitarFoto();

    if (!id) return;

    this.cargandoHistorial.set(true);
    try {
      const obs = await this.seguimientoSvc.listarObservacionesPorSeguimiento(id);
      this.historial.set(obs);
    } catch {
      this.historial.set([]);
    } finally {
      this.cargandoHistorial.set(false);
    }
  }

  onFotoSeleccionada(event: Event): void {
    this.errorFoto.set('');
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.errorFoto.set('La imagen no puede superar los 5 MB.');
      input.value = '';
      return;
    }

    this.fotoArchivo.set(file);
    const reader = new FileReader();
    reader.onload = (e) => this.fotoPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  /** Dispara el selector de archivos usando ViewChild (input siempre en DOM) */
  abrirSelectorFoto(): void {
    const input = this.fileInput?.nativeElement;
    if (!input) return;
    input.value = ''; // reset para poder re-seleccionar el mismo archivo
    input.click();
  }

  quitarFoto(): void {
    this.fotoArchivo.set(null);
    this.fotoPreview.set(null);
    this.errorFoto.set('');
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  async guardar(): Promise<void> {
    if (!this.texto.trim()) {
      this.error.set('La observación no puede estar vacía.');
      return;
    }
    if (!this.seguimientoSeleccionadoId) {
      this.error.set('Selecciona un seguimiento primero.');
      return;
    }

    const personaId = this.auth.user()?.personaId ?? '';
    if (!personaId) {
      this.error.set('No se pudo identificar al usuario. Por favor recarga la sesión.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      let evidencia_foto = '';
      const archivo = this.fotoArchivo();
      if (archivo) {
        this.subiendoFoto.set(true);
        try {
          evidencia_foto = await this.seguimientoSvc.subirEvidenciaObservacion(archivo);
        } finally {
          this.subiendoFoto.set(false);
        }
      }

      await this.seguimientoSvc.crearObservacionEnSeguimiento(
        this.seguimientoSeleccionadoId,
        {
          descripcion:    this.texto.trim(),
          persona:        personaId,
          fecha:          new Date().toISOString().substring(0, 10),
          evidencia_foto,
        }
      );

      this.toast.ok('Observación guardada', 'La observación fue registrada correctamente.');
      this.success.emit();
      this.closed.emit();

    } catch (e: any) {
      const msg = e?.error?.message;
      const detail =
        Array.isArray(msg)      ? msg.join(' · ') :
        typeof msg === 'string' ? msg :
        'Error al guardar la observación.';
      this.error.set(detail);
      this.toast.error('Error', detail);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Abre la evidencia fotográfica en una nueva pestaña.
   * Usa window.open() directamente para evitar que el sanitizador de Angular
   * o el bloqueador de popups del navegador impidan abrir el archivo.
   */
  abrirEvidencia(url: string): void {
    if (!url) return;
    // Si ya es una URL absoluta (http/https) la usa tal cual;
    // si es relativa (/uploads/...) la complementa con el origen actual.
    const href = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  formatFecha(fecha: string | Date): string {
    if (!fecha) return '';
    return new Date(fecha).toLocaleDateString('es-CO', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }
}
