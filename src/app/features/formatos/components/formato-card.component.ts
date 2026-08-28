import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Formato } from '../../../shared/models';

const FILE_BASE = '/uploads/formatos/';

const TIPOS: { value: string; label: string }[] = [
  { value: 'bitacora',         label: 'Bitácora' },
  { value: 'acta_seguimiento', label: 'Acta seguimiento' },
  { value: 'otro',             label: 'Otro' },
];

@Component({
  selector: 'app-formato-card',
  standalone: true,
  styles: [`
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .card-enter { animation: fadeInUp 0.3s ease both; }
    .card-enter:nth-child(1) { animation-delay: 0.05s; }
    .card-enter:nth-child(2) { animation-delay: 0.10s; }
    .card-enter:nth-child(3) { animation-delay: 0.15s; }
    .card-enter:nth-child(4) { animation-delay: 0.20s; }
    .card-enter:nth-child(5) { animation-delay: 0.25s; }
    .card-enter:nth-child(6) { animation-delay: 0.30s; }
    .card-enter:nth-child(7) { animation-delay: 0.35s; }
    .card-enter:nth-child(8) { animation-delay: 0.40s; }
    .file-row:hover .file-icon-bg { background: #dcfce7; }
  `],
  template: `
    <div class="card-enter group bg-white rounded-2xl border border-gray-100 hover:border-gray-200 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">

      <!-- Cabecera -->
      <div class="p-4 pb-3">
        <div class="flex items-start gap-3">
          <div class="file-icon-bg w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center transition-colors duration-200 flex-shrink-0">
            <span class="text-base">{{ iconoArchivo(formato.ruta_archivo) }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm text-gray-800 leading-snug line-clamp-2 group-hover:text-[#39A900] transition-colors">
              {{ formato.nombre }}
            </p>
            <div class="flex items-center gap-1.5 mt-1.5">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full
                           bg-[#39A900]/10 text-[#2d8400] uppercase tracking-wide">
                {{ tipoLabel(formato.tipo) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Divisor -->
      <div class="mx-4 border-t border-gray-50"></div>

      <!-- Acciones -->
      <div class="p-3 flex gap-1.5">
        <a [href]="fileUrl(formato.ruta_archivo)"
           target="_blank"
           class="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
          <span>👁</span> Ver
        </a>
        <a [href]="fileUrl(formato.ruta_archivo)"
           [download]="formato.nombre_original"
           class="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold
                  rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
          <span>↓</span> Descargar
        </a>
        @if (esAdmin) {
          <button
            (click)="eliminar.emit(formato.id)"
            title="Eliminar"
            class="w-8 flex items-center justify-center py-1.5 text-[11px] rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors">
            🗑
          </button>
        }
      </div>

    </div>
  `,
})
export class FormatoCardComponent {
  @Input({ required: true }) formato!: Formato;
  @Input() esAdmin = false;
  @Output() eliminar = new EventEmitter<string>();

  fileUrl(rutaArchivo: string): string {
    return FILE_BASE + rutaArchivo;
  }

  tipoLabel(tipo: string): string {
    return TIPOS.find(t => t.value === tipo)?.label ?? tipo;
  }

  iconoArchivo(ruta: string): string {
    const ext = ruta?.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return '📄';
    if (['doc', 'docx'].includes(ext ?? '')) return '📝';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext ?? '')) return '🖼️';
    return '📁';
  }
}
