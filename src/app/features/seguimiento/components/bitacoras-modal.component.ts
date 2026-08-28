import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges,
         signal, OnInit, ViewChild, ElementRef, HostListener, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { PdfViewerModule } from 'ng2-pdf-viewer';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { PracticaService, SeguimientoService } from '../../../core/services';
import { NotificacionService } from '../../../core/services/notificacion.service';

/**
 * Equivalente a ModalBitacoras.tsx + BitacorasCard.tsx de React.
 * Incluye el modal de detalle y el modal de subir bitácora inline.
 */
@Component({
  selector: 'app-bitacoras-modal',
  standalone: true,
  imports: [FormsModule, PdfViewerModule, DecimalPipe],
  template: `
    <!-- Input oculto FUERA de cualquier bloque @if — accesible via ViewChild -->
    <input #pdfInput type="file" accept="application/pdf" style="display:none"
      (change)="onPdfFileChange($event)" />

    @if (isOpen && alumno) {
      <div class="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        (click)="$event.target === $event.currentTarget && closed.emit()">

        <div class="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">

          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-[#39A900] to-[#2d8500]
                           flex items-center justify-center shadow-lg shadow-[#39A900]/20">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <div>
                <h2 class="text-lg font-bold text-gray-800">Bitácoras de {{ alumno?.name }}</h2>
                <p class="text-xs text-gray-500">{{ bitacoras().length }} registros</p>
              </div>
            </div>
            <button (click)="closed.emit()"
              class="p-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto p-6">
            @if (loading()) {
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                @for (i of [1,2,3,4]; track i) {
                  <div class="bg-white rounded-xl border border-gray-100 shadow-sm animate-pulse">
                    <div class="flex items-center justify-between p-4 border-b border-gray-50">
                      <div class="h-4 bg-gray-200 rounded w-24"></div>
                      <div class="h-5 bg-gray-200 rounded-full w-20"></div>
                    </div>
                    <div class="p-4 space-y-3">
                      <div class="h-3 bg-gray-200 rounded w-full"></div>
                      <div class="h-8 bg-gray-200 rounded w-32"></div>
                    </div>
                  </div>
                }
              </div>
            } @else if (bitacoras().length === 0) {
              <div class="flex flex-col items-center justify-center py-12">
                <div class="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                  <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                </div>
                <p class="text-gray-500 text-sm font-medium">No hay bitácoras registradas</p>
              </div>
            } @else {
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                @for (item of bitacoras(); track (item.id || $index)) {
                  <div class="bg-white rounded-xl border border-gray-200 hover:border-[#39A900]/30 hover:shadow-lg transition-all duration-200 overflow-hidden">

                    <!-- Header: fecha + estado -->
                    <div class="flex items-center justify-between p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                      <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        <span class="font-semibold text-sm text-gray-800">{{ formatFecha(item.fecha) }}</span>
                      </div>
                      <span class="text-xs font-semibold px-2.5 py-1 rounded-full"
                        [class.bg-green-100]="item.estado === 'aceptada'"
                        [class.text-green-700]="item.estado === 'aceptada'"
                        [class.bg-yellow-100]="item.estado === 'pendiente'"
                        [class.text-yellow-700]="item.estado === 'pendiente'"
                        [class.bg-red-100]="item.estado === 'rechazada'"
                        [class.text-red-600]="item.estado === 'rechazada'">
                        {{ item.estado }}
                      </span>
                    </div>

                    <!-- Body -->
                    <div class="p-4 space-y-3">

                      <!-- Estado del archivo -->
                      @if (item.bitacora_pdf && item.bitacora_pdf !== 'pendiente') {
                        <button type="button" (click)="abrirDetalle(item)"
                          class="w-full flex items-center gap-2 p-2.5 bg-green-50 rounded-lg border border-green-100 cursor-pointer hover:bg-green-100 transition-colors text-left">
                          <svg class="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                          </svg>
                          <span class="text-xs text-green-700 font-medium truncate flex-1">{{ item.bitacora_pdf }}</span>
                          <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                          </svg>
                        </button>
                      } @else {
                        <div class="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                          <svg class="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                          </svg>
                          <span class="text-xs text-gray-400 italic">Sin documento</span>
                        </div>
                      }

                      <!-- Botones acción -->
                      <div class="flex items-center gap-2">

                        <!-- Subir / Reemplazar -->
                        <button type="button"
                          (click)="seleccionarPdf(item)"
                          [disabled]="uploadingId() === item.id"
                          class="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold
                                 px-3 py-2 rounded-lg border transition-all duration-200
                                 disabled:opacity-60 disabled:cursor-not-allowed border-[#39A900]
                                 text-[#39A900] hover:bg-[#39A900]/5">
                          @if (uploadingId() === item.id) {
                            <div class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                            <span>Subiendo...</span>
                          } @else if (!item.bitacora_pdf || item.bitacora_pdf === 'pendiente') {
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                            </svg>
                            <span>Subir PDF</span>
                          } @else {
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                            </svg>
                            <span>Reemplazar</span>
                          }
                        </button>

                        <!-- Evaluar: solo admin e instructor -->
                        @if (canEvaluar()) {
                          <div class="relative">
                            <button type="button"
                              (click)="$event.stopPropagation(); toggleDropdown(item, $event)"
                              class="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg
                                     text-white transition-all duration-200"
                              style="background: linear-gradient(135deg, #39A900 0%, #2d8500 100%)">
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                              </svg>
                              Evaluar
                            </button>
                          </div>
                        }

                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
            <button type="button" (click)="closed.emit()"
              class="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-all duration-200">
              Cerrar
            </button>
          </div>
        </div>
      </div>

      <!-- Dropdown flotante para evaluar — UNA SOLA instancia, FUERA del @for -->
      @if (openDropdown() && dropdownPos()) {
        <div class="fixed z-[70] bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 min-w-[160px]"
          [style.top.px]="dropdownPos()!.top"
          [style.left.px]="dropdownPos()!.left">
          <button type="button"
            (click)="cambiarEstadoById(openDropdown()!, 'pendiente')"
            class="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-yellow-600 hover:bg-yellow-50 transition-colors">
            <span>🕒</span><span>Pendiente</span>
          </button>
          <div class="h-px bg-gray-100 my-1"></div>
          <button type="button"
            (click)="cambiarEstadoById(openDropdown()!, 'aceptada')"
            class="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-green-600 hover:bg-green-50 transition-colors">
            <span>✅</span><span>Aceptar</span>
          </button>
          <div class="h-px bg-gray-100 my-1"></div>
          <button type="button"
            (click)="cambiarEstadoById(openDropdown()!, 'rechazada')"
            class="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors">
            <span>❌</span><span>Rechazar</span>
          </button>
        </div>
      }

      <!-- Visor PDF -->
      @if (detalleOpen() && bitacoraSeleccionada()) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden">

            <div class="flex items-center justify-between px-6 py-3 border-b border-gray-100 flex-shrink-0"
                 style="background: linear-gradient(135deg, #001f33, #003a5c)">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background-color:#39A900">
                  <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                </div>
                <h3 class="text-sm font-semibold text-white">
                  Bitácora — {{ formatFecha(bitacoraSeleccionada().fecha) }}
                </h3>
                <span class="text-xs font-medium px-2.5 py-1 rounded-full ml-2 "
                  [class.bg-yellow-400]="bitacoraSeleccionada().estado === 'pendiente'"
                  [class.text-yellow-900]="bitacoraSeleccionada().estado === 'pendiente'"
                  [class.bg-green-400]="bitacoraSeleccionada().estado === 'aceptada'"
                  [class.text-green-900]="bitacoraSeleccionada().estado === 'aceptada'"
                  [class.bg-red-400]="bitacoraSeleccionada().estado === 'rechazada'"
                  [class.text-red-900]="bitacoraSeleccionada().estado === 'rechazada'">
                  {{ bitacoraSeleccionada().estado }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1">
                  <button (click)="prevPage()" [disabled]="pdfPage <= 1"
                    class="text-white/70 hover:text-white disabled:opacity-30 px-1">‹</button>
                  <span class="text-white text-xs min-w-[60px] text-center">{{ pdfPage }} / {{ pdfTotalPages }}</span>
                  <button (click)="nextPage()" [disabled]="pdfPage >= pdfTotalPages"
                    class="text-white/70 hover:text-white disabled:opacity-30 px-1">›</button>
                </div>
                <div class="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1">
                  <button (click)="zoomOut()" class="text-white/70 hover:text-white w-6 h-6 flex items-center justify-center">−</button>
                  <span class="text-white text-xs min-w-[45px] text-center">{{ (pdfZoom * 100) | number:'1.0-0' }}%</span>
                  <button (click)="zoomIn()" class="text-white/70 hover:text-white w-6 h-6 flex items-center justify-center">+</button>
                </div>
                <button type="button" (click)="descargarBitacora()" [disabled]="!pdfBlob()"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white
                         disabled:opacity-50 disabled:cursor-not-allowed"
                  style="background-color:#39A900">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  Descargar
                </button>
                <button (click)="detalleOpen.set(false); resetPdf()"
                  class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white
                         flex items-center justify-center transition-colors text-lg leading-none">×</button>
              </div>
            </div>

            <div class="flex-1 overflow-auto flex justify-center bg-gray-100 p-4">
              @if (pdfLoading()) {
                <div class="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                  <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
                  <p class="text-sm">Cargando PDF...</p>
                </div>
              } @else if (pdfError()) {
                <div class="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                  <svg class="w-16 h-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                      d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  </svg>
                  <p class="text-sm">{{ pdfError() }}</p>
                </div>
              } @else if (pdfData()) {
                <pdf-viewer [src]="pdfData()!"
                  [page]="pdfPage" [zoom]="pdfZoom" [show-all]="false"
                  [render-text]="true" [original-size]="false" [fit-to-page]="false"
                  (after-load-complete)="onPdfLoaded($event)"
                  style="width:100%; height:calc(92vh - 120px); display:block">
                </pdf-viewer>
              } @else {
                <div class="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                  <svg class="w-16 h-16 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                  <p class="text-sm">No hay archivo PDF disponible</p>
                </div>
              }
            </div>
          </div>
        </div>
      }
    }
  `,
})
export class BitacorasModalComponent implements OnChanges, OnInit {
  private auth = inject(AuthService);

  /**
   * Evaluar bitácoras: admin/instructor por cargo (como siempre), o
   * cualquier otro rol al que se le otorgue `practica.bitacoras.gestionar`
   * como excepción — OR válido porque `roles` y el servicio cubren
   * poblaciones distintas (instructor ya pasa por cargo sin necesitar el
   * servicio).
   */
  canEvaluar() {
    return this.auth.hasRole(['administrador', 'administrador_erp', 'instructor'])
      || this.auth.tieneServicio('practica.bitacoras.gestionar');
  }

  @Input() isOpen       = false;
  @Input() alumno:      any = null;
  @Input() seguimiento: any = null;
  @Input() practicaId:  any = null;   // id de etapa_practica para actualizar avance
  /** ID del instructor asignado a la etapa (para notificaciones) */
  @Input() instructorId: string = '';
  /** ID del aprendiz dueño de las bitácoras (para notificaciones) */
  @Input() aprendizId: string = '';
  @Output() closed             = new EventEmitter<void>();
  @Output() avanceActualizado  = new EventEmitter<number>();

  // Agrega estas propiedades en la clase:
  dropdownPos = signal<{ top: number; left: number } | null>(null);

  // ← ViewChild resuelve el input fuera de bloques @if
  @ViewChild('pdfInput') pdfInputRef!: ElementRef<HTMLInputElement>;

  bitacoras = signal<any[]>([]);
  loading   = signal(false);

  detalleOpen          = signal(false);
  bitacoraSeleccionada = signal<any>(null);
  openDropdown         = signal<string | null>(null);

  uploadingId          = signal<string | null>(null);
  uploadError          = signal('');
  private pendingUploadItem: any = null;

  constructor(
    private seguimientoSvc: SeguimientoService,
    private sanitizer: DomSanitizer, 
    private bitacoraSvc: PracticaService,
    private notificacionSvc: NotificacionService
  ) {}

  // Cierra el dropdown al hacer clic fuera
@HostListener('document:click')
onDocumentClick(): void {
  this.openDropdown.set(null);
  this.dropdownPos.set(null);
}

  // ── PDF Viewer ────────────────────────────────────────────────────────────
  pdfPage       = 1;
  pdfTotalPages = 1;
  pdfZoom       = 1.0;
  pdfData       = signal<Uint8Array | null>(null);
  pdfBlob       = signal<Blob | null>(null);
  pdfLoading    = signal(false);
  pdfError      = signal('');

  onPdfLoaded(pdf: any): void {
    this.pdfTotalPages = pdf.numPages;
    this.pdfPage = 1;
  }

  prevPage(): void { if (this.pdfPage > 1) this.pdfPage--; }
  nextPage(): void { if (this.pdfPage < this.pdfTotalPages) this.pdfPage++; }
  zoomIn():   void { this.pdfZoom = Math.min(3, +(this.pdfZoom + 0.25).toFixed(2)); }
  zoomOut():  void { this.pdfZoom = Math.max(0.25, +(this.pdfZoom - 0.25).toFixed(2)); }

  resetPdf(): void {
    this.pdfPage = 1; this.pdfZoom = 1.0; this.pdfTotalPages = 1;
    this.pdfData.set(null);
    this.pdfBlob.set(null);
    this.pdfError.set('');
  }

  descargarBitacora(): void {
    const blob = this.pdfBlob();
    if (!blob) return;
    const nombre = this.bitacoraSeleccionada()?.bitacora_pdf ?? 'bitacora.pdf';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const openChange = changes['isOpen'];
    const segChange  = changes['seguimiento'];

    if (openChange) {
      if (openChange.currentValue) {
        // Modal se abre: limpiar datos anteriores y cargar frescos
        this.resetState();
        if (this.seguimiento) this.cargarBitacoras();
      } else {
        // Modal se cierra: limpiar todo para no mostrar datos viejos al reabrir
        this.resetState();
      }
    } else if (segChange?.currentValue && this.isOpen) {
      // Cambió el seguimiento con el modal ya abierto (otro alumno)
      this.resetState();
      this.cargarBitacoras();
    }
  }

  private resetState(): void {
    this.bitacoras.set([]);
    this.openDropdown.set(null);
    this.dropdownPos.set(null);
    this.detalleOpen.set(false);
    this.bitacoraSeleccionada.set(null);
    this.uploadingId.set(null);
    this.uploadError.set('');
    this.pendingUploadItem = null;
    this.resetPdf();
  }

  ngOnInit(): void {
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

   async cargarBitacoras(): Promise<void> {
    const id = this.seguimiento?.id ?? this.seguimiento?.id_seguimiento;
    if (!id) return;
    this.loading.set(true);
    try {
      const data = await this.seguimientoSvc.obtenerBitacoras(id);
      this.bitacoras.set(data || []);
    } catch (e) {
      this.bitacoras.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async abrirDetalle(item: any): Promise<void> {
    this.bitacoraSeleccionada.set(item);
    this.detalleOpen.set(true);
    this.pdfData.set(null);
    this.pdfBlob.set(null);
    this.pdfError.set('');

    if (!item.bitacora_pdf) return;

    this.pdfLoading.set(true);
    try {
      const blob = await this.seguimientoSvc.descargarArchivo('bitacoras', item.bitacora_pdf);
      this.pdfBlob.set(blob);
      this.pdfData.set(new Uint8Array(await blob.arrayBuffer()));
    } catch {
      this.pdfError.set('No se pudo cargar el PDF.');
    } finally {
      this.pdfLoading.set(false);
    }
  }

// Reemplaza toggleDropdown:
toggleDropdown(item: any, event: MouseEvent): void {
  if (this.openDropdown() === item.id) {
    this.openDropdown.set(null);
    this.dropdownPos.set(null);
    return;
  }
  const btn = event.currentTarget as HTMLElement;
  const rect = btn.getBoundingClientRect();
  this.dropdownPos.set({
    top: rect.bottom + 6,
    left: rect.right - 160   // 160 = min-width del menú
  });
  this.openDropdown.set(item.id);
}

  async cambiarEstado(item: any, estado: string): Promise<void> {
    this.openDropdown.set(null);
    this.dropdownPos.set(null);
    const bitacoraId = item.id ?? item.id_bitacora;
    try {
      await this.seguimientoSvc.actualizarEstadoBitacora(bitacoraId, estado);
      this.bitacoras.update(lista =>
        lista.map(b => (b.id ?? b.id_bitacora) === bitacoraId ? { ...b, estado } : b)
      );
      this.recalcularAvance();

      // ── Notificaciones al cambiar estado de bitácora ──────────────────────
      // El instructor aprueba/rechaza → notifica al aprendiz y al admin
      if (estado === 'aceptada' || estado === 'rechazada') {
        const instructorNombre = this.auth.user()?.nombre ?? 'El instructor';
        const aprendizNombre   = this.alumno?.name ?? this.alumno?.nombre ?? 'El aprendiz';
        const fecha            = new Date().toLocaleDateString('es-CO');
        const seguimientoId    = this.seguimiento?.id ?? this.seguimiento?.id_seguimiento ?? '';
        const adminIds         = await this.notificacionSvc.obtenerIdsAdmins();

        if (this.aprendizId) {
          if (estado === 'aceptada') {
            await this.notificacionSvc.notificarBitacoraAprobada({
              aprendizId: this.aprendizId,
              adminIds,
              instructorNombre,
              aprendizNombre,
              fecha,
              seguimientoId,
            });
          } else {
            await this.notificacionSvc.notificarBitacoraRechazada({
              aprendizId: this.aprendizId,
              adminIds,
              instructorNombre,
              aprendizNombre,
              fecha,
              seguimientoId,
            });
          }
        }
      }
    } catch (e) {
      await this.cargarBitacoras();
    }
  }

  private recalcularAvance(): void {
    if (this.practicaId == null) return;

    // El backend suma las bitácoras aceptadas de TODOS los seguimientos
    // de la etapa práctica (no solo las del seguimiento actual).
    this.bitacoraSvc.actualizarAvancePractica(this.practicaId)
      .then((res: any) => {
        const avance = res?.avance ?? 0;
        console.log(`[Avance] backend calculó → ${avance}%`);
        this.avanceActualizado.emit(avance);
      })
      .catch(e => console.error('[Avance] Error al actualizar en backend:', e));
  }

  cambiarEstadoById(id: string, estado: string): void {
  const item = this.bitacoras().find(b => (b.id ?? b.id_bitacora) === id);
  if (item) this.cambiarEstado(item, estado);
}

  formatFecha(fecha: string): string {
    if (!fecha) return 'Sin fecha';
    const d = new Date(fecha);
    return isNaN(d.getTime()) ? 'Fecha inválida' : d.toLocaleDateString('es-ES');
  }

  /** Abre el file-picker asociando la bitácora a subir */
  seleccionarPdf(item: any): void {
    this.pendingUploadItem = item;
    const input = this.pdfInputRef?.nativeElement;
    if (!input) return;
    input.value = '';   // reset para poder seleccionar el mismo archivo
    input.click();
  }

  async onPdfFileChange(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.pendingUploadItem) return;
    const item = this.pendingUploadItem;
    const id   = item.id ?? item.id_bitacora;
    this.uploadingId.set(id);
    try {
      const updated = await this.seguimientoSvc.subirPdfBitacora(id, file);
      const nombre  = updated?.bitacora_pdf ?? file.name;
      this.bitacoras.update(lista =>
        lista.map(b => (b.id ?? b.id_bitacora) === id ? { ...b, bitacora_pdf: nombre } : b)
      );

      // ── Notificación al instructor cuando el aprendiz sube una bitácora ──
      // Solo aplica si quien sube es un aprendiz y hay instructor asignado
      const cargo = this.auth.user()?.cargo ?? '';
      if (cargo === 'aprendiz' && this.instructorId) {
        const aprendizNombre = this.auth.user()?.nombre ?? 'El aprendiz';
        const fecha          = new Date().toLocaleDateString('es-CO');
        const seguimientoId  = this.seguimiento?.id ?? this.seguimiento?.id_seguimiento ?? '';
        await this.notificacionSvc.notificarBitacoraSubida({
          instructorId: this.instructorId,
          aprendizNombre,
          seguimientoId,
          fecha,
        });
      }
    } catch (e) {
      await this.cargarBitacoras();
    } finally {
      this.uploadingId.set(null);
      this.pendingUploadItem = null;
    }
  }
}
