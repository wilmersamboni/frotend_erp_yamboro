import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';
import { MaterialesApiService, ResultadoImportacion } from '../../core/services/materiales/materiales-api.service';

/**
 * #5 — Importación masiva de productos (.xlsx / .csv).
 *
 * Sube un archivo con la plantilla → el backend crea productos y su stock
 * (ítems DEVOLUTIVO o lote CONSUMO/PERECEDERO), fila por fila. Una fila mala
 * no aborta el resto: se listan los errores con su nº de fila.
 *
 * Ruta gateada por `materiales.productos.crear`.
 */
@Component({
  selector: 'app-materiales-importar',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="p-6 max-w-2xl">
      <div class="mb-5">
        <h1 class="text-xl font-bold text-gray-800">Importar productos</h1>
        <p class="text-sm text-gray-400">Carga masiva desde un archivo .xlsx o .csv. Máximo 500 filas.</p>
      </div>

      <ol class="space-y-4 text-sm">
        <li class="flex items-start gap-3">
          <span class="flex-none w-6 h-6 rounded-full bg-gray-100 text-gray-500 font-bold grid place-items-center">1</span>
          <div>
            <p class="text-gray-700 font-medium">Descargá la plantilla</p>
            <button (click)="descargarPlantilla()" [disabled]="descargando"
              class="mt-1 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:border-[#39A900] hover:text-[#2d8000] transition-colors disabled:opacity-60">
              {{ descargando ? 'Generando…' : '⬇ plantilla-productos.xlsx' }}
            </button>
            <p class="text-[11px] text-gray-400 mt-1">La hoja "Instrucciones" explica cada columna.</p>
          </div>
        </li>

        <li class="flex items-start gap-3">
          <span class="flex-none w-6 h-6 rounded-full bg-gray-100 text-gray-500 font-bold grid place-items-center">2</span>
          <div class="flex-1">
            <p class="text-gray-700 font-medium">Completala y subila</p>
            <label class="mt-1 block border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-[#39A900]/50 transition-colors"
              (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
              <input type="file" accept=".xlsx,.csv" class="hidden" (change)="onPick($event)" />
              @if (archivo) {
                <span class="text-gray-700 font-medium">{{ archivo.name }}</span>
                <span class="text-gray-400 text-xs block">{{ (archivo.size / 1024).toFixed(0) }} KB — clic para cambiar</span>
              } @else {
                <span class="text-gray-400">Arrastrá el archivo acá o hacé clic para elegirlo</span>
              }
            </label>
            <button (click)="importar()" [disabled]="!archivo || importando"
              class="mt-3 px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors"
              style="background-color: #39A900">
              {{ importando ? 'Importando…' : 'Importar' }}
            </button>
          </div>
        </li>
      </ol>

      @if (resultado) {
        <div class="mt-8 border-t border-gray-100 pt-6">
          <div class="grid grid-cols-4 gap-3 mb-4">
            <div class="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div class="text-xl font-bold text-gray-700">{{ resultado.total }}</div>
              <div class="text-[11px] text-gray-500 font-medium">Filas</div>
            </div>
            <div class="rounded-xl border border-green-100 bg-green-50 p-3">
              <div class="text-xl font-bold text-green-600">{{ resultado.productos_creados }}</div>
              <div class="text-[11px] text-green-600 font-medium">Productos creados</div>
            </div>
            <div class="rounded-xl border border-blue-100 bg-blue-50 p-3">
              <div class="text-xl font-bold text-blue-600">{{ resultado.stock_agregado }}</div>
              <div class="text-[11px] text-blue-600 font-medium">Stock (ítems/uds)</div>
            </div>
            <div class="rounded-xl p-3" [class]="resultado.errores.length ? 'border border-red-100 bg-red-50' : 'border border-gray-100 bg-gray-50'">
              <div class="text-xl font-bold" [class]="resultado.errores.length ? 'text-red-600' : 'text-gray-400'">{{ resultado.errores.length }}</div>
              <div class="text-[11px] font-medium" [class]="resultado.errores.length ? 'text-red-600' : 'text-gray-400'">Errores</div>
            </div>
          </div>

          @if (resultado.errores.length) {
            <div class="flex items-center justify-between mb-2">
              <h2 class="text-sm font-semibold text-gray-700">Filas con error</h2>
              <button (click)="copiarErrores()" class="text-xs text-gray-500 hover:text-gray-700">Copiar</button>
            </div>
            <div class="overflow-x-auto rounded-xl border border-gray-100">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 text-gray-500 text-left">
                  <tr><th class="px-3 py-2 font-medium w-16">Fila</th><th class="px-3 py-2 font-medium">Error</th></tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (e of resultado.errores; track e.fila) {
                    <tr><td class="px-3 py-2 text-gray-500">{{ e.fila }}</td><td class="px-3 py-2 text-red-700">{{ e.error }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="text-sm text-green-600">Todas las filas se importaron sin errores.</p>
          }

          <a routerLink="/materiales/productos" class="inline-block mt-4 text-sm font-semibold text-[#2d8000] hover:underline">Ver productos →</a>
        </div>
      }
    </div>
  `,
})
export class MaterialesImportarComponent {
  archivo: File | null = null;
  descargando = false;
  importando = false;
  resultado: ResultadoImportacion | null = null;

  constructor(private api: MaterialesApiService, private toast: ToastService) {}

  onPick(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.archivo = input.files?.[0] ?? null;
    this.resultado = null;
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0];
    if (f && /\.(xlsx|csv)$/i.test(f.name)) {
      this.archivo = f;
      this.resultado = null;
    } else {
      this.toast.warn('Archivo inválido', 'Tiene que ser .xlsx o .csv.');
    }
  }

  async descargarPlantilla(): Promise<void> {
    this.descargando = true;
    try {
      const blob = await this.api.descargarPlantillaProductos();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla-productos.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      this.toast.httpError(e, 'No se pudo descargar la plantilla.');
    } finally {
      this.descargando = false;
    }
  }

  async importar(): Promise<void> {
    if (!this.archivo) return;
    this.importando = true;
    this.resultado = null;
    try {
      this.resultado = await this.api.importarProductos(this.archivo);
      const { productos_creados, stock_agregado, errores } = this.resultado;
      if (errores.length === 0) {
        this.toast.ok('Importación completa', `${productos_creados} producto(s), ${stock_agregado} de stock.`);
      } else {
        this.toast.warn('Importación con errores', `${errores.length} fila(s) fallaron — revisá el detalle.`);
      }
    } catch (e) {
      this.toast.httpError(e, 'No se pudo importar el archivo.');
    } finally {
      this.importando = false;
    }
  }

  copiarErrores(): void {
    if (!this.resultado) return;
    const txt = this.resultado.errores.map((e) => `Fila ${e.fila}: ${e.error}`).join('\n');
    navigator.clipboard?.writeText(txt).then(
      () => this.toast.ok('Errores copiados'),
      () => this.toast.warn('No se pudo copiar', 'Copialos a mano.'),
    );
  }
}
