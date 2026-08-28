import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { BitacorasModalComponent } from './bitacoras-modal.component';
import { AuthService } from '../../../core/services/auth.service';
import { SeguimientoService } from '../../../core/services';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-seguimientos-modal',
  standalone: true,
  imports: [FormsModule, NgClass, BitacorasModalComponent],
  template: `
    @if (isOpen && alumno) {
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        (click)="$event.target === $event.currentTarget && closed.emit()">

        <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">

          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 class="text-lg font-bold text-gray-800">Seguimientos de {{ alumno?.name }}</h2>
            <button (click)="closed.emit()"
              class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors text-lg leading-none">×</button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3">

            @if (loading()) {
              <div class="flex justify-center py-8">
                <div class="w-8 h-8 border-4 border-[#39A900]/30 border-t-[#39A900] rounded-full animate-spin"></div>
              </div>
            } @else if (seguimientos().length === 0) {
              <p class="text-center text-gray-400 text-sm py-8">No hay seguimientos registrados</p>
            } @else {
              @for (item of seguimientos(); track item.id) {

                <!-- Card de seguimiento -->
                <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible"
                  (click)="abrirDetalle(item)">

                  <!-- Card header -->
                  <div class="flex items-center justify-between px-4 pt-4 pb-2">
                    <span class="font-semibold text-gray-800">Seguimiento</span>

                    <div class="flex items-center gap-2" (click)="$event.stopPropagation()">

                      <!-- Estado chip -->
                      <span class="text-xs font-medium px-2.5 py-1 rounded-full capitalize"
                        [ngClass]="estadoBadgeCls(item.estado)">
                        {{ item.estado ?? '—' }}
                      </span>

                      <!-- Botón ⋮ con menú desplegable: solo admin e instructor -->
                      @if (canGestionarSeguimiento()) {
                        <div class="relative">
                          <button
                            (click)="toggleMenu(item.id)"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors text-lg font-bold">
                            ⋮
                          </button>

                          @if (openMenu() === item.id) {
                            <div class="absolute right-0 top-8 z-[100] bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[180px]">

                              <!-- ── Cambiar estado ── -->
                              <div class="px-3 pt-2 pb-1">
                                <p class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1">
                                  Cambiar estado
                                </p>
                                @for (est of ESTADOS; track est.key) {
                                  <button
                                    (click)="onCambiarEstado(item, est.key)"
                                    [disabled]="item.estado === est.key"
                                    class="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg
                                           hover:bg-gray-50 transition-colors text-left
                                           disabled:opacity-40 disabled:cursor-default">
                                    <span class="w-2 h-2 rounded-full flex-shrink-0" [ngClass]="est.dot"></span>
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

                              <div class="border-t border-gray-100 my-1"></div>

                              <!-- ── Acta ── -->
                              <button (click)="subirActa(item)"
                                class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left">
                                📤 Subir / Reemplazar Acta
                              </button>

                              <button (click)="descargarActa(item)"
                                [disabled]="!tieneActaReal(item)"
                                class="w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors text-left"
                                [class.text-gray-700]="tieneActaReal(item)"
                                [class.text-gray-300]="!tieneActaReal(item)"
                                [class.cursor-not-allowed]="!tieneActaReal(item)">
                                📥 Descargar Acta
                              </button>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Observación -->
                  <div class="px-4 pb-3">
                    <p class="text-sm text-gray-600 leading-relaxed">
                      {{ item.observacion ?? '—' }}
                    </p>
                  </div>

                  <!-- Acta badge -->
                  <div class="px-4 pb-4">
                    @if (tieneActaReal(item)) {
                      <button
                        (click)="$event.stopPropagation(); descargarActa(item)"
                        class="inline-flex items-center gap-1.5 text-xs font-medium bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-200 hover:bg-green-100 transition-colors">
                        📎 Acta cargada — ver PDF
                      </button>
                    } @else {
                      <span class="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full border border-amber-200">
                        ⚠ Sin acta adjunta
                      </span>
                    }
                  </div>
                </div>
              }
            }
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-100 flex justify-end">
            <button (click)="closed.emit()"
              class="text-sm text-red-500 hover:text-red-600 font-medium transition-colors px-3 py-1.5">
              Cerrar
            </button>
          </div>
        </div>
      </div>

      <!-- Modal editar observación -->
      @if (editOpen()) {
        <div class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 class="text-lg font-bold text-gray-800 mb-4">Editar Seguimiento</h3>
            <textarea [(ngModel)]="editObservacion" rows="4"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900] resize-y"
              placeholder="Observación..."></textarea>
            <div class="flex justify-end gap-2 mt-4">
              <button (click)="editOpen.set(false)"
                class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              <button (click)="guardarEdicion()"
                class="px-5 py-2 bg-[#39A900] text-white text-sm font-medium rounded-lg
                       hover:bg-[#2d8400] transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      }
    }

    <!-- Modal Bitácoras -->
    <app-bitacoras-modal
      [isOpen]="bitacorasOpen()"
      [alumno]="alumno"
      [seguimiento]="seguimientoSeleccionado()"
      [practicaId]="alumno?.id_practica"
      (closed)="bitacorasOpen.set(false); reopened.emit()"
      (avanceActualizado)="onAvanceActualizado($event)"
    />
  `,
})
export class SeguimientosModalComponent implements OnChanges {
  private auth           = inject(AuthService);
  private seguimientoSvc = inject(SeguimientoService);
  private toast          = inject(ToastService);

  /** Gestionar seguimiento (observaciones, actas): admin/instructor por
   *  cargo, o cualquier rol con `practica.seguimientos.gestionar` otorgado. */
  canGestionarSeguimiento() {
    return this.auth.hasRole(['administrador', 'administrador_erp', 'instructor'])
      || this.auth.tieneServicio('practica.seguimientos.gestionar');
  }

  @Input() isOpen  = false;
  @Input() alumno: any = null;
  @Output() closed            = new EventEmitter<void>();
  @Output() reopened          = new EventEmitter<void>();
  @Output() avanceActualizado = new EventEmitter<{ id: any; avance: number }>();

  // ── Estado ─────────────────────────────────────────────────────────────────
  seguimientos = signal<any[]>([]);
  loading      = signal(false);
  openMenu     = signal<string | null>(null);

  editOpen              = signal(false);
  bitacorasOpen         = signal(false);
  seguimientoEditando   = signal<any>(null);
  seguimientoSeleccionado = signal<any>(null);
  editObservacion = '';

  private pendingActaItem: any = null;

  // ── Opciones de estado ──────────────────────────────────────────────────────
  readonly ESTADOS = [
    { key: 'activo',    label: 'Activo',    dot: 'bg-green-500',  text: 'text-green-700'  },
    { key: 'pendiente', label: 'Pendiente', dot: 'bg-yellow-500', text: 'text-yellow-700' },
    { key: 'inactivo',  label: 'Inactivo',  dot: 'bg-red-500',    text: 'text-red-600'    },
  ];

  estadoBadgeCls(estado: string): object {
    const e = (estado ?? '').toLowerCase();
    return {
      'bg-green-100  text-green-700':  e === 'activo',
      'bg-yellow-100 text-yellow-700': e === 'pendiente',
      'bg-red-100    text-red-600':    e === 'inactivo',
      'bg-gray-100   text-gray-500':   !['activo','pendiente','inactivo'].includes(e),
    };
  }

  // ── Ciclo de vida ──────────────────────────────────────────────────────────
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen']?.currentValue && this.alumno) {
      this.cargarSeguimientos();
      this.openMenu.set(null);
    }
  }

  async cargarSeguimientos(): Promise<void> {
    if (!this.alumno) return;
    this.loading.set(true);
    try {
      const etapaId = this.alumno.id_practica ?? this.alumno.idPractica ?? null;
      const data = etapaId
        ? await this.seguimientoSvc.obtenerSeguimientosPorEtapa(etapaId)
        : await this.seguimientoSvc.obtenerSeguimientos(this.alumno.id);
      this.seguimientos.set(data);
    } catch (e) { console.error(e); }
    finally { this.loading.set(false); }
  }

  toggleMenu(id: string): void {
    this.openMenu.update(v => v === id ? null : id);
  }

  abrirDetalle(item: any): void {
    this.openMenu.set(null);
    this.seguimientoSeleccionado.set(item);
    this.bitacorasOpen.set(true);
    this.closed.emit();
  }

  abrirEditar(item: any): void {
    this.openMenu.set(null);
    this.seguimientoEditando.set(item);
    this.editObservacion = item.observacion ?? '';
    this.editOpen.set(true);
  }

  async guardarEdicion(): Promise<void> {
    const seg = this.seguimientoEditando();
    if (!seg) return;
    try {
      await this.seguimientoSvc.actualizarSeguimiento(seg.id, { observacion: this.editObservacion });
      this.toast.ok('Seguimiento actualizado', 'La observación fue guardada correctamente.');
      await this.cargarSeguimientos();
      this.editOpen.set(false);
    } catch (e: any) { this.toast.httpError(e, 'Error al guardar el seguimiento.'); }
  }

  async onCambiarEstado(item: any, estado: string): Promise<void> {
    this.openMenu.set(null);
    try {
      await this.seguimientoSvc.cambiarEstado(item.id, estado);
      // Actualización optimista local
      this.seguimientos.update(list =>
        list.map(s => s.id === item.id ? { ...s, estado } : s)
      );
      this.toast.ok('Estado actualizado', `El seguimiento cambió a "${estado}".`);
      // Recarga para confirmar lo que quedó en BD
      await this.cargarSeguimientos();
    } catch (e: any) { this.toast.httpError(e, 'Error al cambiar el estado.'); }
  }

  subirActa(item: any): void {
    this.openMenu.set(null);
    this.pendingActaItem = item;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = (e: any) => this.onActaFileChange(e);
    input.click();
  }

  async onActaFileChange(event: any): Promise<void> {
    const file: File | undefined = event.target?.files?.[0];
    if (!file || !this.pendingActaItem) return;
    const targetId = this.pendingActaItem.id;
    this.pendingActaItem = null;
    try {
      const resp: any = await this.seguimientoSvc.subirActa(targetId, file);
      // El backend devuelve el objeto Seguimiento con actas_pdf actualizado
      const filename: string =
        resp?.actas_pdf ?? resp?.filename ?? file.name;
      // Actualización optimista local
      this.seguimientos.update(list =>
        list.map(s => s.id === targetId ? { ...s, actas_pdf: filename } : s)
      );
      this.toast.ok('Acta subida', 'El acta PDF fue cargada correctamente.');
      // Recarga para confirmar lo que quedó en BD
      await this.cargarSeguimientos();
    } catch (e: any) { this.toast.httpError(e, 'Error al subir el acta.'); }
  }

  /** El backend crea cada seguimiento con actas_pdf: 'pendiente' como placeholder — no es un archivo real. */
  tieneActaReal(item: any): boolean {
    return !!item.actas_pdf && item.actas_pdf !== 'pendiente';
  }

  async descargarActa(item: any): Promise<void> {
    this.openMenu.set(null);
    if (!this.tieneActaReal(item)) return;
    try {
      const blob = await this.seguimientoSvc.descargarArchivo('actas', item.actas_pdf);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      this.toast.httpError(e, 'No se pudo descargar el acta.');
    }
  }

  onAvanceActualizado(avance: number): void {
    if (this.alumno) {
      this.avanceActualizado.emit({ id: this.alumno.id, avance });
    }
  }
}
