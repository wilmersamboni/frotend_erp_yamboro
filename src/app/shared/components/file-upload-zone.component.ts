import {
  Component, Input, Output, EventEmitter, signal,
} from '@angular/core';

/**
 * Zona visual de carga de archivos reutilizable.
 *
 * El <input type="file"> NO vive aquí — debe estar en el componente padre
 * FUERA de cualquier @if, para que siempre esté en el DOM.
 *
 * El padre escucha (clickZone) y llama a su propio fileInput.click().
 * Esto garantiza que el selector del navegador se abra de forma fiable.
 *
 * Uso en el padre:
 *
 *   <!-- Input FUERA de @if (siempre en el DOM) -->
 *   <input #fileInput type="file" [multiple]="true" style="display:none"
 *          accept="..." (change)="onFilesChange($event)" />
 *
 *   <app-file-upload-zone
 *     [multiple]="true"
 *     [hint]="'PDF, Word · Hasta 20 archivos'"
 *     [files]="archivos"
 *     (filesChange)="archivos = $event"
 *     (clickZone)="fileInput.click()"
 *   />
 */
@Component({
  selector: 'app-file-upload-zone',
  standalone: true,
  styles: [`
    .zone-drag { border-color: #39A900 !important; background: rgb(57 169 0 / 0.06) !important; }
  `],
  template: `
    <!-- Zona visual: clic delega al padre via (clickZone) -->
    <div
      class="flex flex-col items-center justify-center gap-2 w-full min-h-[7rem]
             border-2 border-dashed rounded-xl cursor-pointer transition-all select-none"
      [class.zone-drag]="isDragging()"
      [class.border-green-500]="!isDragging() && files.length > 0"
      [class.bg-green-50]="!isDragging() && files.length > 0"
      [class.border-gray-200]="!isDragging() && files.length === 0"
      [class.bg-gray-50]="!isDragging() && files.length === 0"
      (click)="clickZone.emit()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave()"
      (drop)="onDrop($event)">

      <!-- Archivo único seleccionado -->
      @if (!multiple && files.length > 0) {
        <div class="flex items-center gap-2 text-green-600 pointer-events-none">
          <span class="text-xl">✅</span>
          <span class="text-sm font-medium max-w-xs truncate">{{ files[0].name }}</span>
        </div>
        <span class="text-xs text-gray-400 pointer-events-none">
          {{ formatBytes(files[0].size) }}
        </span>
      }

      <!-- Estado vacío / arrastrando / contador múltiple -->
      @if (multiple || files.length === 0) {
        <span class="text-2xl text-gray-300 pointer-events-none">
          {{ isDragging() ? '📂' : '📎' }}
        </span>
        <span class="text-sm text-gray-400 pointer-events-none">
          {{ isDragging() ? 'Suelta los archivos aquí' : 'Haz clic o arrastra archivos aquí' }}
        </span>
        @if (hint) {
          <span class="text-xs text-gray-300 pointer-events-none">{{ hint }}</span>
        }
        @if (multiple && files.length > 0) {
          <span class="text-xs font-semibold text-green-600 pointer-events-none">
            {{ files.length }} archivo{{ files.length !== 1 ? 's' : '' }} seleccionado{{ files.length !== 1 ? 's' : '' }}
          </span>
        }
      }
    </div>

    <!-- Lista de archivos (modo múltiple) -->
    @if (multiple && files.length > 0) {
      <div class="mt-2 space-y-1.5">
        @for (f of files; track f.name + f.size) {
          <div class="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-xs">
            <span class="text-base leading-none">{{ iconoArchivo(f.name) }}</span>
            <span class="flex-1 truncate text-gray-700">{{ f.name }}</span>
            <span class="text-gray-400 flex-shrink-0">{{ formatBytes(f.size) }}</span>
            <button
              type="button"
              (click)="quitarArchivo(f); $event.stopPropagation()"
              class="text-red-400 hover:text-red-600 transition-colors flex-shrink-0 leading-none"
              title="Quitar">✕</button>
          </div>
        }
      </div>
    }
  `,
})
export class FileUploadZoneComponent {
  @Input() multiple = false;
  @Input() hint     = 'PDF, DOC, DOCX, Imagen';

  /** Lista de archivos actual — two-way binding [(files)] */
  @Input()  files: File[] = [];
  @Output() filesChange = new EventEmitter<File[]>();

  /** El padre escucha esto y llama a su propio fileInput.click() */
  @Output() clickZone = new EventEmitter<void>();

  protected isDragging = signal(false);

  /* ── Drag & drop ───────────────────────────────────────────── */
  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  protected onDragLeave(): void {
    this.isDragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    if (!dropped.length) return;
    const resultado = this.multiple ? [...this.files, ...dropped] : [dropped[0]];
    this.filesChange.emit(resultado);
  }

  protected quitarArchivo(archivo: File): void {
    this.filesChange.emit(this.files.filter(f => f !== archivo));
  }

  /* ── Utilidades ────────────────────────────────────────────── */
  protected iconoArchivo(nombre: string): string {
    const ext = nombre.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'pdf')                                        return '📄';
    if (['doc', 'docx'].includes(ext))                       return '📝';
    if (['xls', 'xlsx'].includes(ext))                       return '📊';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return '🖼️';
    if (ext === 'zip')                                        return '🧷';
    return '📁';
  }

  protected formatBytes(bytes: number): string {
    if (bytes < 1024)      return bytes + ' B';
    if (bytes < 1_048_576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1_048_576).toFixed(1) + ' MB';
  }
}
