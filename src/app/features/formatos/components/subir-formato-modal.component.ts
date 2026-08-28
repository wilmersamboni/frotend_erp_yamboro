import {
  Component, Input, Output, EventEmitter,
  signal, ViewChild, ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { FileUploadZoneComponent } from '../../../shared/components/file-upload-zone.component';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';

export interface TipoFormato { value: string; label: string; icon: string; }

@Component({
  selector: 'app-subir-formato-modal',
  standalone: true,
  imports: [FormsModule, FileUploadZoneComponent, SearchableSelectComponent],
  styles: [`
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spinner { animation: spin 0.8s linear infinite; }
  `],
  template: `
    <!-- Input FUERA del panel — siempre en el DOM para que @ViewChild lo encuentre -->
    <input #fileInput type="file" style="display:none"
           accept="application/pdf,.doc,.docx,image/*"
           (change)="onFileChange($event)" />

    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-[fadeInUp_0.25s_ease_both]">
      <div class="bg-gradient-to-r from-[#39A900]/8 to-transparent px-6 py-4 border-b border-gray-100">
        <h2 class="text-sm font-semibold text-gray-800">Nuevo formato</h2>
      </div>

      <div class="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">

        <!-- Nombre -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</label>
          <input
            type="text"
            [(ngModel)]="nombreFormato"
            placeholder="Ej: Contrato empresa XYZ"
            class="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 hover:bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/25 focus:border-[#39A900] transition-all placeholder:text-gray-400"
          />
        </div>

        <!-- Tipo -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</label>
          <app-ss [options]="tipoOptions()" placeholder="Selecciona un tipo"
                  [(ngModel)]="tipoSeleccionado"></app-ss>
        </div>

        <!-- Zona de subida -->
        <div class="sm:col-span-2 space-y-1.5">
          <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Archivo</label>
          <app-file-upload-zone
            [hint]="'PDF, DOC, DOCX, Imagen'"
            [files]="archivos"
            (filesChange)="archivos = $event"
            (clickZone)="abrirSelector()"
          />
        </div>

        <!-- Botón subir -->
        <div class="sm:col-span-2 flex justify-end">
          <button
            (click)="handleUpload()"
            [disabled]="!archivos.length || uploading()"
            class="inline-flex items-center gap-2 px-6 py-2.5 bg-[#39A900] hover:bg-[#2d8400]
                   text-white text-sm font-semibold rounded-xl transition-all duration-200
                   shadow-sm hover:shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
                   disabled:hover:bg-[#39A900] disabled:active:scale-100">
            @if (uploading()) {
              <svg class="w-4 h-4 spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Subiendo...
            } @else {
              <span>↑</span>
              Subir archivo
            }
          </button>
        </div>

      </div>
    </div>
  `,
})
export class SubirFormatoModalComponent {
  @Input({ required: true }) tipos: TipoFormato[] = [];
  @Output() subido = new EventEmitter<{ nombre: string; tipo: string }>();

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  uploading = signal(false);

  archivos:        File[] = [];
  nombreFormato    = '';
  tipoSeleccionado = '';

  constructor(
    private api: ApiService,
    private toast: ToastService,
  ) {}

  tipoOptions(): SSOption[] {
    return this.tipos.map(t => ({ value: t.value, label: `${t.icon} ${t.label}` }));
  }

  abrirSelector(): void {
    const input = this.fileInputRef?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.archivos = Array.from(input.files ?? []);
    input.value = '';
  }

  async handleUpload(): Promise<void> {
    const archivo = this.archivos[0];
    if (!archivo)                   { this.toast.warn('Campo requerido', 'Selecciona un archivo.'); return; }
    if (!this.nombreFormato.trim()) { this.toast.warn('Campo requerido', 'Escribe un nombre descriptivo.'); return; }
    if (!this.tipoSeleccionado)     { this.toast.warn('Campo requerido', 'Selecciona el tipo de formato.'); return; }

    this.uploading.set(true);
    try {
      await this.api.subirFormato(this.nombreFormato.trim(), this.tipoSeleccionado, archivo);
      this.resetForm();
      this.toast.ok('Archivo subido', 'El formato fue registrado correctamente.');
      this.subido.emit({ nombre: this.nombreFormato.trim(), tipo: this.tipoSeleccionado });
    } catch (e: any) {
      this.toast.httpError(e, 'Error al subir el archivo.');
    } finally {
      this.uploading.set(false);
    }
  }

  private resetForm(): void {
    this.archivos         = [];
    this.nombreFormato    = '';
    this.tipoSeleccionado = '';
  }
}
