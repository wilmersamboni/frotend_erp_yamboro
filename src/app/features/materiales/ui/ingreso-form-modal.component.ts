import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiDay } from '@taiga-ui/cdk';
import { DateInputComponent } from '../../../shared/components/date-input.component';
import { TuiDayCache } from '../../../shared/utils/tui-day.util';
import { SearchableSelectComponent, SSOption } from '../../../shared/components/searchable-select.component';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import {
  ArrowLeft, ArrowRight, Building2, CalendarDays, Check, CircleCheck, FileText, Gift, Handshake, LucideAngularModule,
  LucideIconData, MapPin, Package, PackagePlus, Plus, Receipt, RefreshCw, School, ShoppingCart, Trash2, Upload, X,
} from 'lucide-angular';
import { ToastService, mensajeDeError } from '../../../core/services/toast.service';
import { PersonaService } from '../../../core/services/persona.service';
import {
  AreaIngreso,
  IngresoMaterialDetalle,
  MaterialesApiService,
  Producto,
  Proveedor,
  Sitio,
  TipoDocumentoProveedor,
  TipoIngreso,
  TipoSoporte,
} from '../data-access/materiales-api.service';
import { codigoLoteSugerido } from '../codigo-lote.util';

export const TIPOS_INGRESO: { value: TipoIngreso; label: string }[] = [
  { value: 'COMPRA', label: 'Compra' },
  { value: 'DONACION', label: 'Donación' },
  { value: 'COMODATO', label: 'Comodato' },
  { value: 'TRASLADO_CENTRO', label: 'Traslado de otro centro' },
  { value: 'REPOSICION', label: 'Reposición' },
  { value: 'OTRO', label: 'Otro' },
];

export const TIPOS_SOPORTE: { value: TipoSoporte; label: string }[] = [
  { value: 'FACTURA', label: 'Factura' },
  { value: 'REMISION', label: 'Remisión' },
  { value: 'ORDEN_COMPRA', label: 'Orden de compra' },
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'ACTA', label: 'Acta' },
  { value: 'GIL_F_014', label: 'Formato GIL-F-014' },
  { value: 'OTRO', label: 'Otro' },
];

interface LineaForm {
  key: number;
  id_producto: string;
  cantidad: number | null;
  valor_unitario: number | null;
  placasTexto: string;
  codigo_lote: string;
  fecha_vencimiento: string;
  /** Uno por línea: un TuiDayCache compartido alternaría fechas y recrearía el TuiDay en cada render. */
  cacheVence: TuiDayCache;
}

/** Hoy en hora local (AAAA-MM-DD) — `toISOString()` daría mañana después de las 7 pm en Colombia. */
function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

/** Mismas reglas que el backend (ingresos.controller): PDF o foto, 10 MB c/u, 5 por ingreso. */
export const MAX_SOPORTES = 5;
export const ACEPTA_SOPORTE = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp';
const EXT_SOPORTE = /\.(pdf|png|jpe?g|webp)$/i;

/** Filtra los archivos elegidos; devuelve los válidos y, si hubo descartes, el porqué. */
export function filtrarSoportes(elegidos: File[], yaTiene: number): { validos: File[]; aviso: string | null } {
  const validos: File[] = [];
  const motivos: string[] = [];
  for (const f of elegidos) {
    if (!EXT_SOPORTE.test(f.name)) motivos.push(`«${f.name}» no es PDF ni imagen`);
    else if (f.size > 10 * 1024 * 1024) motivos.push(`«${f.name}» pesa más de 10 MB`);
    else if (yaTiene + validos.length >= MAX_SOPORTES) motivos.push(`«${f.name}» pasa el tope de ${MAX_SOPORTES} soportes`);
    else validos.push(f);
  }
  return { validos, aviso: motivos.length ? motivos.join('; ') + '.' : null };
}

export function tamanoLegible(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * <app-ingreso-form-modal> — registrar un ingreso de materiales a la sede
 * (2026-10-05). Cabecera (tipo, proveedor, bodega, soporte, fechas, quién
 * recibió) + líneas con fichas del catálogo. El backend lo guarda todo en una
 * transacción: el documento, las unidades/lotes en la bodega y su kardex.
 *
 * Destino (2026-10-08): como en Yamboro el material llega a las áreas, por
 * defecto queda en el ÁREA por repartir (mismo camino que el formato GIL-F-014:
 * placas y lotes se ponen al repartir); "directo a una bodega" sigue disponible.
 * Los equipos que entran con placa SENA piden cuentadante (instructor o
 * habilitado en Usuarios); sin placa y los consumibles no llevan.
 */
@Component({
  selector: 'app-ingreso-form-modal',
  standalone: true,
  imports: [DialogDirective, FormsModule, SearchableSelectComponent, LucideAngularModule, DateInputComponent],
  styles: [`
    .boton-primario { background-color: var(--accent-brand); }
    .boton-primario:hover { filter: brightness(.96); }
  `],
  template: `
    @if (open) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="cerrar()">
        <div class="bg-white rounded-3xl shadow-2xl w-full max-w-3xl my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[92vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="shrink-0 border-b border-gray-200 bg-white px-5 pt-5 pb-4 sm:px-7">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-[#39A900]/10 text-[#2d8000] ring-1 ring-[#39A900]/20">
                  <lucide-icon [img]="ic.PackagePlus" [size]="22"></lucide-icon>
                </span>
                <div>
                  <h2 class="text-lg font-bold leading-tight text-gray-900">Llegó material</h2>
                  <p class="text-xs text-gray-500">Paso {{ paso }} de {{ pasos.length }} · {{ pasos[paso - 1] }}</p>
                </div>
              </div>
              <button aria-label="Cerrar" (click)="cerrar()" class="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <lucide-icon [img]="ic.X" [size]="20"></lucide-icon>
              </button>
            </div>
            <!-- Pasos -->
            <ol class="mt-5 flex items-center" aria-label="Pasos">
              @for (t of pasos; track t; let i = $index) {
                <li class="flex items-center" [class.flex-1]="i < pasos.length - 1">
                  <span class="flex flex-col items-center gap-1">
                    <span class="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition"
                      [class]="i + 1 < paso ? 'bg-[#39A900] text-white' : i + 1 === paso ? 'bg-[#39A900] text-white ring-4 ring-[#39A900]/20' : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'">
                      @if (i + 1 < paso) { <lucide-icon [img]="ic.Check" [size]="16"></lucide-icon> } @else { {{ i + 1 }} }
                    </span>
                    <span class="hidden sm:block text-[11px] font-medium whitespace-nowrap" [class]="i + 1 === paso ? 'text-gray-900' : 'text-gray-500'">{{ t }}</span>
                  </span>
                  @if (i < pasos.length - 1) {
                    <span class="mx-2 h-0.5 flex-1 rounded sm:-mt-5" [class]="i + 1 < paso ? 'bg-[#39A900]' : 'bg-gray-200'"></span>
                  }
                </li>
              }
            </ol>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 space-y-5">
            @switch (paso) {
              @case (1) {
                <div class="flex items-center gap-3">
                  <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><lucide-icon [img]="ic.Building2" [size]="20"></lucide-icon></span>
                  <div><h3 class="text-base font-bold text-gray-900">¿De dónde viene el material?</h3><p class="text-sm text-gray-500">Elige cómo llegó a la sede.</p></div>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  @for (t of tiposIngreso; track t.value) {
                    <button type="button" (click)="tipoIngreso = t.value"
                      class="relative rounded-2xl border-2 p-3.5 text-left transition"
                      [class]="tipoIngreso === t.value ? 'border-[#39A900] bg-[#39A900]/5 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-300'">
                      @if (tipoIngreso === t.value) {
                        <span class="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#39A900] text-white"><lucide-icon [img]="ic.Check" [size]="13"></lucide-icon></span>
                      }
                      <span class="flex h-10 w-10 items-center justify-center rounded-xl" [class]="tipoIngreso === t.value ? 'bg-[#39A900] text-white' : 'bg-gray-100 text-gray-500'">
                        <lucide-icon [img]="iconoTipo[t.value]" [size]="20"></lucide-icon>
                      </span>
                      <span class="mt-2 block text-sm font-semibold text-gray-900">{{ t.label }}</span>
                      <span class="block text-[11px] text-gray-500 leading-snug">{{ ayudaTipo[t.value] }}</span>
                    </button>
                  }
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">
                    ¿Quién lo entregó? @if (tipoIngreso === 'COMPRA') { <span class="text-red-500">*</span> } @else { <span class="text-gray-400 font-normal text-xs">(opcional)</span> }
                  </label>
                  <app-ss [options]="opcionesProveedor" placeholder="Buscar el proveedor por nombre o NIT…" [(ngModel)]="idProveedor"></app-ss>
                  @if (!creandoProveedor) {
                    <button type="button" (click)="abrirProveedorNuevo()" class="mt-1.5 text-xs font-medium text-[#2d8000] hover:underline">¿No está en la lista? Crear proveedor</button>
                  }
                </div>
              @if (creandoProveedor) {
                <div class="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-2.5">
                  <p class="text-xs text-gray-500">Datos mínimos; el resto (dirección, correo, contacto…) se completa después en Proveedores.</p>
                  <input type="text" [(ngModel)]="provNuevo.nombre" placeholder="Nombre o razón social *" [class]="campo" />
                  <div class="grid grid-cols-3 gap-2">
                    <select [(ngModel)]="provNuevo.tipo_documento" [class]="campo">
                      <option value="NIT">NIT</option><option value="CC">Cédula</option><option value="CE">C. extranjería</option><option value="OTRO">Otro</option>
                    </select>
                    <input type="text" [(ngModel)]="provNuevo.documento" placeholder="Número *" class="col-span-2" [class]="campo" />
                  </div>
                  <input type="tel" [(ngModel)]="provNuevo.telefono" placeholder="Teléfono" [class]="campo" />
                  <div class="flex justify-end gap-2">
                    <button type="button" (click)="creandoProveedor = false" class="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
                    <button type="button" (click)="guardarProveedor()" [disabled]="guardandoProveedor"
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style="background-color: var(--accent-brand)">
                      {{ guardandoProveedor ? 'Creando…' : 'Crear y usar' }}
                    </button>
                  </div>
                </div>
              }

              }

              @case (2) {
                <div class="flex items-center gap-3">
                  <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600"><lucide-icon [img]="ic.Receipt" [size]="20"></lucide-icon></span>
                  <div><h3 class="text-base font-bold text-gray-900">¿Qué papel lo respalda?</h3><p class="text-sm text-gray-500">La factura, remisión u otro documento. Si no hay ninguno, sigue.</p></div>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <button type="button" (click)="tipoSoporte = ''" class="flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition"
                    [class]="!tipoSoporte ? 'border-[#39A900] bg-[#39A900]/5 text-[#2d8000]' : 'border-gray-100 text-gray-600 hover:border-gray-300'">
                    <lucide-icon [img]="ic.X" [size]="16"></lucide-icon> Ninguno
                  </button>
                  @for (t of tiposSoporte; track t.value) {
                    <button type="button" (click)="tipoSoporte = t.value" class="flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition"
                      [class]="tipoSoporte === t.value ? 'border-[#39A900] bg-[#39A900]/5 text-[#2d8000]' : 'border-gray-100 text-gray-600 hover:border-gray-300'">
                      <lucide-icon [img]="ic.FileText" [size]="16"></lucide-icon> {{ t.label }}
                    </button>
                  }
                </div>
                @if (tipoSoporte) {
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Número del documento</label>
                      <input type="text" [(ngModel)]="numeroSoporte" maxlength="80" placeholder="Ej: FE-12345" [class]="campo" />
                    </div>
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-1">Fecha del documento</label>
                      <app-date-input placeholder="DD/MM/AAAA" [clearable]="true"
                        [ngModel]="cacheSoporte.get(fechaSoporte)" (ngModelChange)="fechaSoporte = aIso($event)"></app-date-input>
                    </div>
                  </div>
              <label class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition"
                [class]="soportes.length >= maxSoportes ? 'pointer-events-none border-gray-200 opacity-50' : 'border-gray-300 hover:border-[#39A900] hover:bg-[#39A900]/5'">
                <span class="flex h-12 w-12 items-center justify-center rounded-full bg-[#39A900]/10 text-[#2d8000]"><lucide-icon [img]="ic.Upload" [size]="22"></lucide-icon></span>
                <span class="text-sm font-semibold text-gray-800">Sube la foto o el PDF del documento</span>
                <span class="text-xs text-gray-500">PDF, JPG o PNG · hasta 10 MB · máximo {{ maxSoportes }} archivos</span>
                <input type="file" multiple [accept]="aceptaSoporte" class="hidden" (change)="elegirSoportes($event)" />
              </label>
              @if (soportes.length) {
                <ul class="space-y-2">
                  @for (f of soportes; track f) {
                    <li class="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600"><lucide-icon [img]="ic.FileText" [size]="16"></lucide-icon></span>
                      <span class="min-w-0 flex-1"><span class="block truncate text-sm text-gray-800">{{ f.name }}</span><span class="block text-xs text-gray-400">{{ tamano(f.size) }}</span></span>
                      <button type="button" (click)="quitarSoporte(f)" [attr.aria-label]="'Quitar ' + f.name" class="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><lucide-icon [img]="ic.Trash2" [size]="16"></lucide-icon></button>
                    </li>
                  }
                </ul>
              }
                }
              }

              @case (3) {
                <div class="flex items-center gap-3">
                  <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><lucide-icon [img]="ic.MapPin" [size]="20"></lucide-icon></span>
                  <div><h3 class="text-base font-bold text-gray-900">¿Dónde y cuándo llegó?</h3><p class="text-sm text-gray-500">Si queda en el área para repartir o entra directo a una bodega, y el día que llegó.</p></div>
                </div>
                @if (areas.length && opcionesSitio.length) {
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button type="button" (click)="destino = 'AREA'" class="rounded-2xl border-2 p-3.5 text-left transition"
                      [class]="destino === 'AREA' ? 'border-[#39A900] bg-[#39A900]/5 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-300'">
                      <span class="block text-sm font-semibold text-gray-900">Al área, por repartir</span>
                      <span class="block text-[11px] text-gray-500 leading-snug">Lo normal: llega al área y el líder lo reparte a sus bodegas.</span>
                    </button>
                    <button type="button" (click)="destino = 'BODEGA'" class="rounded-2xl border-2 p-3.5 text-left transition"
                      [class]="destino === 'BODEGA' ? 'border-[#39A900] bg-[#39A900]/5 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-300'">
                      <span class="block text-sm font-semibold text-gray-900">Directo a una bodega</span>
                      <span class="block text-[11px] text-gray-500 leading-snug">Cuando ya se sabe en qué bodega queda todo.</span>
                    </button>
                  </div>
                }
                @if (destino === 'AREA') {
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Área a la que llegó <span class="text-red-500">*</span></label>
                    <app-ss [options]="opcionesArea" placeholder="— Selecciona el área —" [(ngModel)]="idArea"></app-ss>
                    @if (areaElegida(); as a) {
                      <p class="text-[11px] mt-1" [class]="a.puede_repartir ? 'text-gray-400' : 'text-amber-700'">
                        {{ a.puede_repartir ? 'Al registrar sigues con el reparto a sus bodegas; las placas y los lotes se ponen ahí.' : 'Queda por repartir: lo reparte el líder del área cuando vuelva.' }}
                      </p>
                    }
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Cuentadante <span class="text-gray-400 font-normal text-xs">(opcional)</span></label>
                    <app-ss [options]="opcionesCuentadante" placeholder="— Buscar instructor o habilitado —" [(ngModel)]="idCuentadante"></app-ss>
                    <p class="text-[11px] text-gray-400 mt-1">Responde por los equipos que se repartan con placa SENA; si no lo eliges, se pide al repartir.</p>
                  </div>
                } @else {
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Bodega que lo recibe <span class="text-red-500">*</span></label>
                    <app-ss [options]="opcionesSitio" placeholder="— Selecciona la bodega —" [(ngModel)]="idSitio"></app-ss>
                  </div>
                }
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Día en que llegó <span class="text-red-500">*</span></label>
                    <app-date-input placeholder="DD/MM/AAAA" [max]="hoyTuiDay"
                      [ngModel]="cacheIngreso.get(fechaIngreso)" (ngModelChange)="fechaIngreso = aIso($event)"></app-date-input>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">¿Quién lo recibió? <span class="text-gray-400 font-normal text-xs">(si no fuiste tú)</span></label>
                    <input type="text" [(ngModel)]="recibidoPor" maxlength="150" placeholder="Ej: Portería, Juan Pérez" [class]="campo" />
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">¿Algo que anotar? <span class="text-gray-400 font-normal text-xs">(opcional)</span></label>
                  <textarea rows="2" [(ngModel)]="observaciones" maxlength="2000" placeholder="Estado en que llegó, cajas abiertas, faltantes…" [class]="campo"></textarea>
                </div>
              }

              @case (4) {
            <!-- ── Productos ── -->
            <section>
              <div class="mb-4 flex items-center gap-3">
                <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><lucide-icon [img]="ic.Package" [size]="20"></lucide-icon></span>
                <div><h3 class="text-base font-bold text-gray-900">¿Qué llegó?</h3><p class="text-sm text-gray-500">Busca cada producto en el catálogo y escribe cuántos llegaron.</p></div>
              </div>
              <div class="space-y-3">
                @for (l of lineas; track l.key; let i = $index) {
                  <div class="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
                    <div class="flex items-start gap-3">
                      <span class="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#39A900]/10 text-xs font-bold text-[#2d8000]">{{ i + 1 }}</span>
                      <div class="flex-1 min-w-0">
                        <app-ss [options]="opcionesProducto" [placeholder]="cargandoCatalogo ? 'Cargando catálogo…' : 'Buscar producto del catálogo…'"
                          [ngModel]="l.id_producto" (ngModelChange)="elegirProducto(l, $event)"></app-ss>
                      </div>
                      @if (lineas.length > 1) {
                        <button type="button" (click)="quitarLinea(l)" aria-label="Quitar producto" class="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600"><lucide-icon [img]="ic.Trash2" [size]="16"></lucide-icon></button>
                      }
                    </div>
                    @if (ficha(l); as p) {
                      <div class="pl-10 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label class="block text-[11px] font-medium text-gray-500 mb-0.5">Cantidad <span class="text-red-500">*</span></label>
                          <div class="flex items-center rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-[#39A900]/30 focus-within:border-[#39A900]">
                            <input type="number" min="1" [max]="p.tipo_material === 'DEVOLUTIVO' ? 500 : null" [(ngModel)]="l.cantidad" class="w-full px-2 py-1.5 rounded-l-lg text-sm focus:outline-none" />
                            <span class="px-2 text-[11px] text-gray-400 whitespace-nowrap">{{ p.unidad_medida }}</span>
                          </div>
                        </div>
                        <div>
                          <label class="block text-[11px] font-medium text-gray-500 mb-0.5">Valor unitario</label>
                          <input type="number" min="0" step="1" [(ngModel)]="l.valor_unitario" placeholder="$" class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                        </div>
                        @if (p.tipo_material !== 'DEVOLUTIVO') {
                          @if (destino === 'BODEGA') {
                          <div>
                            <label class="block text-[11px] font-medium text-gray-500 mb-0.5">Código de lote</label>
                            <input type="text" [(ngModel)]="l.codigo_lote" maxlength="60" [placeholder]="'Auto: ' + sugerirCodigo(p.nombre)" title="Déjalo vacío y se genera solo, o escribe el tuyo" class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
                          </div>
                          }
                          @if (p.tipo_material === 'PERECEDERO') {
                            <div>
                              <label class="block text-[11px] font-medium text-gray-500 mb-0.5">Vence <span class="text-red-500">*</span></label>
                              <app-date-input placeholder="DD/MM/AAAA" [min]="cacheLimite.get(fechaIngreso || hoy)"
                                [ngModel]="l.cacheVence.get(l.fecha_vencimiento)" (ngModelChange)="l.fecha_vencimiento = aIso($event)"></app-date-input>
                            </div>
                          }
                        } @else {
                          <div class="col-span-2 flex items-end text-[11px] text-gray-400 pb-2">Devolutivo · {{ p.tipo_material === 'DEVOLUTIVO' && p.usa_placa_sena !== false ? 'cada unidad lleva placa SENA' : 'se identifica con el SKU de la ficha' }}</div>
                        }
                      </div>
                      @if (p.tipo_material === 'DEVOLUTIVO' && p.usa_placa_sena !== false && destino === 'AREA') {
                        <p class="pl-10 text-[11px] text-gray-400">Las placas SENA se ponen al repartir a cada bodega.</p>
                      }
                      @if (p.tipo_material === 'DEVOLUTIVO' && p.usa_placa_sena !== false && destino === 'BODEGA') {
                        <div class="pl-10">
                          <textarea rows="2" [(ngModel)]="l.placasTexto" placeholder="Placas SENA (opcional): una por línea o separadas por coma"
                            class="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]"></textarea>
                          <p class="text-[11px]" [class.text-red-500]="sobranPlacas(l)" [class.text-gray-400]="!sobranPlacas(l)">{{ resumenPlacas(l) }}</p>
                        </div>
                      }
                    }
                  </div>
                }
              </div>
              <button type="button" (click)="agregarLinea()"
                class="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 py-3 text-sm font-semibold text-gray-600 transition hover:border-[#39A900] hover:text-[#2d8000]">
                <lucide-icon [img]="ic.Plus" [size]="18"></lucide-icon> Agregar otro producto
              </button>
              @if (destino === 'BODEGA' && hayPlacas) {
                <div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
                  <label class="block text-sm font-medium text-gray-700 mb-1">Cuentadante <span class="text-red-500">*</span></label>
                  <app-ss [options]="opcionesCuentadante" placeholder="— Buscar instructor o habilitado —" [(ngModel)]="idCuentadante"></app-ss>
                  <p class="text-[11px] text-gray-500 mt-1">Escribiste placas SENA: quien elijas queda a cargo de esos equipos. Los que entran sin placa no llevan cuentadante.</p>
                </div>
              }
            </section>

              }

              @case (5) {
                <div class="flex items-center gap-3">
                  <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><lucide-icon [img]="ic.CircleCheck" [size]="20"></lucide-icon></span>
                  <div><h3 class="text-base font-bold text-gray-900">Revisa y confirma</h3><p class="text-sm text-gray-500">Si algo no está bien, vuelve atrás y corrígelo.</p></div>
                </div>
                <div class="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-[15px] leading-relaxed text-gray-800">{{ frase() }}</div>
                <div class="grid grid-cols-3 gap-2.5 text-center">
                  <div class="rounded-2xl border border-gray-200 bg-white p-3"><p class="text-2xl font-bold text-gray-900">{{ resumen.lineas }}</p><p class="text-xs text-gray-500">producto(s)</p></div>
                  <div class="rounded-2xl border border-gray-200 bg-white p-3"><p class="text-2xl font-bold text-gray-900">{{ resumen.cantidad }}</p><p class="text-xs text-gray-500">en total</p></div>
                  <div class="rounded-2xl border border-gray-200 bg-white p-3"><p class="text-lg font-bold text-gray-900 leading-8">{{ resumen.valor !== null ? pesos(resumen.valor) : '—' }}</p><p class="text-xs text-gray-500">valor</p></div>
                </div>
                <ul class="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white text-sm">
                  @for (l of lineasValidas; track l.key) {
                    <li class="flex items-center gap-3 px-4 py-3">
                      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500"><lucide-icon [img]="ic.Package" [size]="18"></lucide-icon></span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium text-gray-900">{{ ficha(l)?.nombre }}</span>
                        <span class="block text-xs text-gray-500">{{ detalleLinea(l) }}</span>
                      </span>
                      <span class="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1 font-semibold text-gray-700">{{ l.cantidad }} {{ ficha(l)?.unidad_medida?.toLowerCase() }}</span>
                    </li>
                  }
                </ul>
                @if (soportes.length) {
                  <p class="flex items-center gap-2 text-xs text-gray-500"><lucide-icon [img]="ic.FileText" [size]="14"></lucide-icon>{{ soportes.length }} archivo(s) adjunto(s).</p>
                }
              }
            }

            @if (error) { <p class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{{ error }}</p> }
          </div>

          <div class="shrink-0 flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/70 px-5 py-4 sm:px-7">
            <button (click)="paso === 1 ? cerrar() : atras()" class="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100">
              @if (paso > 1) { <lucide-icon [img]="ic.ArrowLeft" [size]="16"></lucide-icon> }
              {{ paso === 1 ? 'Cancelar' : 'Atrás' }}
            </button>
            <div class="flex items-center gap-3">
              @if (paso >= 4) {
                <span class="hidden sm:inline text-xs text-gray-500">{{ resumen.cantidad }} en total@if (resumen.valor !== null) { · {{ pesos(resumen.valor) }} }</span>
              }
              @if (paso < pasos.length) {
                <button (click)="siguiente()" class="boton-primario inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm">
                  Siguiente <lucide-icon [img]="ic.ArrowRight" [size]="16"></lucide-icon>
                </button>
              } @else {
                <button (click)="guardar()" [disabled]="saving" class="boton-primario inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
                  <lucide-icon [img]="ic.Check" [size]="16"></lucide-icon> {{ saving ? 'Registrando…' : 'Registrar' }}
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class IngresoFormModalComponent implements OnChanges {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);
  private readonly personaApi = inject(PersonaService);

  @Input() open = false;
  /** Bodegas donde el usuario puede registrar ingresos (las que gestiona). */
  @Input() sitios: Sitio[] = [];
  /** Áreas donde puede registrar llegadas (con sus bodegas y si reparte). */
  @Input() areas: AreaIngreso[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() guardado = new EventEmitter<IngresoMaterialDetalle>();

  readonly tiposIngreso = TIPOS_INGRESO;
  readonly tiposSoporte = TIPOS_SOPORTE;
  readonly hoy = hoyLocal();
  // <app-date-input> (calendario de Taiga) trabaja con TuiDay; el formulario sigue en 'yyyy-MM-dd'.
  readonly hoyTuiDay = TuiDayCache.fromIso(this.hoy);
  readonly cacheSoporte = new TuiDayCache();
  readonly cacheIngreso = new TuiDayCache();
  readonly cacheLimite = new TuiDayCache();
  aIso(day: TuiDay | null): string {
    return TuiDayCache.toIso(day);
  }
  readonly pesos = (v: number) => pesos.format(v);
  readonly tamano = tamanoLegible;
  readonly maxSoportes = MAX_SOPORTES;
  readonly aceptaSoporte = ACEPTA_SOPORTE;
  /** Archivos elegidos; se suben apenas el ingreso queda registrado. */
  soportes: File[] = [];
  readonly campo = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900] disabled:bg-gray-50 disabled:text-gray-400';

  catalogo: Producto[] = [];
  proveedores: Proveedor[] = [];
  cargandoCatalogo = false;

  tipoIngreso: TipoIngreso = 'COMPRA';
  idProveedor = '';
  /** AREA: queda por repartir (modalidad FORMATO_AREA); BODEGA: entra directo. */
  destino: 'AREA' | 'BODEGA' = 'AREA';
  idArea = '';
  idSitio = '';
  idCuentadante = '';
  /** Misma regla que la pantalla de cuentadante: instructor o habilitado en Usuarios. */
  opcionesCuentadante: SSOption[] = [];
  tipoSoporte: TipoSoporte | '' = 'FACTURA';
  numeroSoporte = '';
  fechaSoporte = '';
  fechaIngreso = hoyLocal();
  /** Código que se generará si la línea deja el lote vacío (2026-10-06). */
  readonly sugerirCodigo = (nombre: string): string => codigoLoteSugerido(nombre, this.fechaIngreso);
  recibidoPor = '';
  observaciones = '';
  lineas: LineaForm[] = [];
  private siguienteKey = 1;
  saving = false;
  error: string | null = null;

  // ── Asistente paso a paso (2026-10-05): una pregunta por pantalla ──
  readonly pasos = ['De dónde viene', 'Documento', 'Dónde y cuándo', 'Qué llegó', 'Confirmar'];
  paso = 1;
  readonly iconoTipo: Record<string, LucideIconData> = {
    COMPRA: ShoppingCart, DONACION: Gift, COMODATO: Handshake, TRASLADO_CENTRO: School, REPOSICION: RefreshCw, OTRO: Package,
  };
  readonly ic = {
    ArrowLeft, ArrowRight, Building2, CalendarDays, Check, CircleCheck, FileText, MapPin, Package, PackagePlus, Plus, Receipt, Trash2, Upload, X,
  };
  readonly ayudaTipo: Record<string, string> = {
    COMPRA: 'Se compró a un proveedor',
    DONACION: 'Lo regaló una empresa o persona',
    COMODATO: 'Prestado por un tercero: hay que devolverlo',
    TRASLADO_CENTRO: 'Lo envió otro centro del SENA',
    REPOSICION: 'Cambio por garantía o reposición',
    OTRO: 'Otro origen',
  };

  /** Valida el paso actual; si está bien, avanza. */
  siguiente(): void {
    this.error = this.errorDelPaso(this.paso);
    if (!this.error) this.paso = Math.min(this.pasos.length, this.paso + 1);
  }

  atras(): void {
    this.error = null;
    this.paso = Math.max(1, this.paso - 1);
  }

  private errorDelPaso(paso: number): string | null {
    if (paso === 1 && this.tipoIngreso === 'COMPRA' && !this.idProveedor) return 'Una compra necesita el proveedor. Búscalo o créalo.';
    if (paso === 3) {
      if (this.destino === 'AREA' && !this.idArea) return 'Elige el área a la que llegó el material.';
      if (this.destino === 'BODEGA' && !this.idSitio) return 'Elige la bodega que recibe el material.';
      if (!this.fechaIngreso) return 'Escribe el día en que llegó.';
      if (this.fechaIngreso > this.hoy) return 'El día de llegada no puede ser futuro.';
    }
    if (paso === 4) return this.errorDeLineas();
    return null;
  }

  get lineasValidas(): LineaForm[] {
    return this.lineas.filter((l) => l.id_producto || l.cantidad);
  }

  private errorDeLineas(): string | null {
    const usadas = this.lineasValidas;
    if (!usadas.length) return 'Agrega al menos un producto.';
    for (const [i, l] of usadas.entries()) {
      const p = this.ficha(l);
      const pos = `Producto ${i + 1}`;
      if (!p) return `${pos}: elige la ficha del catálogo.`;
      const c = Number(l.cantidad);
      if (!Number.isInteger(c) || c < 1) return `${pos}: la cantidad debe ser un entero de 1 en adelante.`;
      if (p.tipo_material === 'DEVOLUTIVO' && c > 500) return `${pos}: hasta 500 unidades por línea.`;
      if (this.sobranPlacas(l)) return `${pos}: ${this.resumenPlacas(l)}`;
      if (p.tipo_material === 'PERECEDERO' && !l.fecha_vencimiento) return `${pos}: falta la fecha de vencimiento.`;
    }
    if (this.destino === 'BODEGA' && this.hayPlacas && !this.idCuentadante) {
      return 'Escribiste placas SENA: elige el cuentadante que queda a cargo de esos equipos.';
    }
    return null;
  }

  /** ¿Alguna línea de equipo trae placas? (solo cuenta en "directo a una bodega"). */
  get hayPlacas(): boolean {
    return this.lineasValidas.some((l) => this.ficha(l)?.tipo_material === 'DEVOLUTIVO' && this.placas(l).length > 0);
  }

  get opcionesArea(): SSOption[] {
    return this.areas.map((a) => ({ value: a.id_area, label: `${a.nombre} (${a.bodegas.length} bodega${a.bodegas.length === 1 ? '' : 's'})` }));
  }

  areaElegida(): AreaIngreso | null {
    return this.areas.find((a) => a.id_area === this.idArea) ?? null;
  }

  /** El ingreso dicho en palabras, para confirmar sin leer formularios. */
  frase(): string {
    const tipo = (TIPOS_INGRESO.find((t) => t.value === this.tipoIngreso)?.label ?? '').toLowerCase();
    const prov = this.proveedores.find((p) => p.id_proveedor === this.idProveedor)?.nombre;
    const bodega =
      this.destino === 'AREA'
        ? `el área ${this.areaElegida()?.nombre ?? ''} (queda por repartir a sus bodegas)`
        : this.sitios.find((s) => s.id_sitio === this.idSitio)?.nombre ?? 'la bodega';
    const soporte = this.tipoSoporte
      ? ` con ${(TIPOS_SOPORTE.find((t) => t.value === this.tipoSoporte)?.label ?? '').toLowerCase()}${this.numeroSoporte.trim() ? ' ' + this.numeroSoporte.trim() : ''}`
      : ' sin documento de respaldo';
    const r = this.resumen;
    return `Vas a registrar ${r.cantidad} en total (${r.lineas} producto${r.lineas === 1 ? '' : 's'}) que llegaron el ${this.fechaIngreso} a ${bodega}, ` +
      `por ${tipo}${prov ? ' de ' + prov : ''}${soporte}.${r.valor !== null ? ` Valor total: ${this.pesos(r.valor)}.` : ''}`;
  }

  detalleLinea(l: LineaForm): string {
    const p = this.ficha(l);
    if (!p) return '';
    if (this.destino === 'AREA') return 'Por repartir';
    if (p.tipo_material === 'DEVOLUTIVO') {
      const n = this.placas(l).length;
      return n ? `${n} con placa · ${Number(l.cantidad) - n} sin placa todavía` : 'Sin placas todavía';
    }
    return [l.codigo_lote ? `Lote ${l.codigo_lote}` : 'Lote sin código', l.fecha_vencimiento ? `vence ${l.fecha_vencimiento}` : null].filter(Boolean).join(' · ');
  }

  creandoProveedor = false;
  guardandoProveedor = false;
  provNuevo: { nombre: string; tipo_documento: TipoDocumentoProveedor; documento: string; telefono: string } =
    { nombre: '', tipo_documento: 'NIT', documento: '', telefono: '' };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.reiniciar();
      void this.cargar();
    }
  }

  private reiniciar(): void {
    this.tipoIngreso = 'COMPRA';
    this.idProveedor = '';
    // Por defecto al área (así llega en Yamboro); sin áreas, directo a la bodega.
    this.destino = this.areas.length ? 'AREA' : 'BODEGA';
    this.idArea = this.areas.length === 1 ? this.areas[0].id_area : '';
    this.idCuentadante = '';
    this.idSitio = this.opcionesSitio.length === 1 ? this.opcionesSitio[0].value : '';
    this.tipoSoporte = 'FACTURA';
    this.numeroSoporte = '';
    this.fechaSoporte = '';
    this.fechaIngreso = hoyLocal();
    this.recibidoPor = '';
    this.observaciones = '';
    this.lineas = [];
    this.agregarLinea();
    this.soportes = [];
    this.paso = 1;
    this.creandoProveedor = false;
    this.error = null;
  }

  private async cargar(): Promise<void> {
    this.cargandoCatalogo = true;
    try {
      const [catalogo, proveedores, personas] = await Promise.all([
        this.api.catalogoProductos(),
        this.api.listarProveedores(),
        this.personaApi.listarResponsablesBodega().catch(() => [] as any[]),
      ]);
      this.catalogo = catalogo;
      this.proveedores = proveedores;
      this.opcionesCuentadante = personas
        .filter((u: any) => u.persona?.cargo === 'instructor' || u.puedeSerCuentadante === true)
        .map((u: any) => ({
          value: u.idUsuario,
          label: [`${u.persona?.nombre ?? ''} ${u.persona?.apellido ?? ''}`.trim(), u.persona?.documento ?? u.persona?.cedula, u.persona?.cargo]
            .filter(Boolean)
            .join(' — '),
        }));
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cargar el catálogo o los proveedores.');
    } finally {
      this.cargandoCatalogo = false;
    }
  }

  get opcionesSitio(): SSOption[] {
    return this.sitios.filter((s) => s.estado).map((s) => ({ label: s.nombre, value: s.id_sitio }));
  }

  get opcionesProveedor(): SSOption[] {
    return this.proveedores.map((p) => ({ value: p.id_proveedor, label: `${p.nombre} — ${p.tipo_documento} ${p.documento}` }));
  }

  get opcionesProducto(): SSOption[] {
    return this.catalogo.map((p) => ({
      value: p.id_producto,
      label: `${p.nombre}${p.marca ? ' · ' + p.marca : ''}${p.modelo ? ' ' + p.modelo : ''} — ${p.codigo_unspsc || 'sin UNSPSC'} (${p.unidad_medida})`,
    }));
  }

  ficha(l: LineaForm): Producto | null {
    return this.catalogo.find((p) => p.id_producto === l.id_producto) ?? null;
  }

  agregarLinea(): void {
    this.lineas = [...this.lineas, { key: this.siguienteKey++, id_producto: '', cantidad: null, valor_unitario: null, placasTexto: '', codigo_lote: '', fecha_vencimiento: '', cacheVence: new TuiDayCache() }];
  }

  quitarLinea(l: LineaForm): void {
    this.lineas = this.lineas.filter((x) => x !== l);
  }

  elegirProducto(l: LineaForm, id: string): void {
    if (l.id_producto === id) return;
    l.id_producto = id;
    l.placasTexto = '';
    l.codigo_lote = '';
    l.fecha_vencimiento = '';
  }

  placas(l: LineaForm): string[] {
    return l.placasTexto.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  }

  sobranPlacas(l: LineaForm): boolean {
    return !!l.cantidad && this.placas(l).length > l.cantidad;
  }

  resumenPlacas(l: LineaForm): string {
    const n = this.placas(l).length;
    const c = Number(l.cantidad) || 0;
    if (!n) return 'Las que no escribas quedan listas para asignarles la placa después.';
    if (n > c) return `Hay ${n} placas para ${c} unidad(es): sobran ${n - c}.`;
    return n === c ? `Las ${c} unidades quedan con su placa.` : `${n} con placa · ${c - n} quedan para asignarles la placa después.`;
  }

  get resumen(): { lineas: number; cantidad: number; valor: number | null } {
    const validas = this.lineas.filter((l) => l.id_producto && Number(l.cantidad) > 0);
    const conValor = validas.some((l) => l.valor_unitario !== null && `${l.valor_unitario}` !== '');
    return {
      lineas: validas.length,
      cantidad: validas.reduce((a, l) => a + Number(l.cantidad), 0),
      valor: conValor ? validas.reduce((a, l) => a + Number(l.cantidad) * Number(l.valor_unitario || 0), 0) : null,
    };
  }

  elegirSoportes(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const { validos, aviso } = filtrarSoportes(Array.from(input.files ?? []), this.soportes.length);
    this.soportes = [...this.soportes, ...validos];
    if (aviso) this.toast.warn('Algunos archivos no se adjuntaron', aviso, 7000);
    input.value = '';
  }

  quitarSoporte(f: File): void {
    this.soportes = this.soportes.filter((x) => x !== f);
  }

  abrirProveedorNuevo(): void {
    this.provNuevo = { nombre: '', tipo_documento: 'NIT', documento: '', telefono: '' };
    this.creandoProveedor = true;
  }

  async guardarProveedor(): Promise<void> {
    const p = this.provNuevo;
    if (p.nombre.trim().length < 2 || p.documento.trim().length < 3) {
      this.error = 'El proveedor necesita nombre y número de documento.';
      return;
    }
    this.guardandoProveedor = true;
    this.error = null;
    try {
      const creado = await this.api.crearProveedor({
        nombre: p.nombre.trim(), tipo_documento: p.tipo_documento, documento: p.documento.trim(), telefono: p.telefono.trim() || undefined,
      });
      this.proveedores = [...this.proveedores, creado].sort((a, b) => a.nombre.localeCompare(b.nombre));
      this.idProveedor = creado.id_proveedor;
      this.creandoProveedor = false;
      this.toast.ok('Proveedor creado', `«${creado.nombre}» quedó seleccionado.`);
    } catch (e: any) {
      // 409: ya existe con ese documento — se selecciona el existente.
      const id = e?.status === 409 ? e?.error?.data?.id_proveedor : null;
      if (id && this.proveedores.some((x) => x.id_proveedor === id)) {
        this.idProveedor = id;
        this.creandoProveedor = false;
        this.toast.ok('Ya existía', 'Ese documento ya estaba registrado: quedó seleccionado.');
      } else {
        this.error = mensajeDeError(e, 'No se pudo crear el proveedor.');
      }
    } finally {
      this.guardandoProveedor = false;
    }
  }

  cerrar(): void {
    this.closed.emit();
  }

  async guardar(): Promise<void> {
    // Mismas validaciones de cada paso; si alguna falla, se vuelve a ese paso.
    for (const p of [1, 3, 4]) {
      const e = this.errorDelPaso(p);
      if (e) { this.error = e; this.paso = p; return; }
    }
    const usadas = this.lineasValidas;

    this.saving = true;
    this.error = null;
    try {
      const alArea = this.destino === 'AREA';
      const det = await this.api.registrarIngreso({
        ...(alArea ? { modalidad: 'FORMATO_AREA' as const, id_area: this.idArea } : { id_sitio: this.idSitio }),
        id_cuentadante: (alArea || this.hayPlacas) && this.idCuentadante ? this.idCuentadante : undefined,
        tipo_ingreso: this.tipoIngreso,
        id_proveedor: this.idProveedor || null,
        tipo_soporte: this.tipoSoporte || null,
        numero_soporte: this.tipoSoporte ? this.numeroSoporte.trim() || null : null,
        fecha_soporte: this.tipoSoporte ? this.fechaSoporte || null : null,
        fecha_ingreso: this.fechaIngreso,
        recibido_por: this.recibidoPor.trim() || null,
        observaciones: this.observaciones.trim() || null,
        lineas: usadas.map((l) => {
          const p = this.ficha(l)!;
          // Al área: placas y lotes se ponen al repartir a cada bodega.
          const placas = p.tipo_material === 'DEVOLUTIVO' && !alArea ? this.placas(l) : [];
          return {
            id_producto: l.id_producto,
            cantidad: Number(l.cantidad),
            valor_unitario: l.valor_unitario !== null && `${l.valor_unitario}` !== '' ? Number(l.valor_unitario) : null,
            placas_sena: placas.length ? placas : undefined,
            codigo_lote: p.tipo_material !== 'DEVOLUTIVO' && !alArea ? l.codigo_lote.trim() || null : null,
            fecha_vencimiento: p.tipo_material === 'PERECEDERO' ? l.fecha_vencimiento : null,
          };
        }),
      });
      this.toast.ok(
        `Ingreso ${det.codigo} registrado`,
        alArea
          ? `${det.cantidad_total} en total quedaron en el área ${det.area_nombre ?? ''}, por repartir.`
          : `${det.cantidad_total} en total entraron a ${det.sitio_nombre ?? 'la bodega'}.`,
      );
      // El ingreso ya quedó: si el archivo falla, se avisa y se adjunta desde el detalle.
      if (this.soportes.length) {
        try {
          det.soportes = await this.api.subirSoportesIngreso(det.id_ingreso, this.soportes);
        } catch (e) {
          this.toast.warn('Soporte no adjuntado', `${mensajeDeError(e, 'No se pudo subir el archivo.')} Adjúntalo desde el detalle del ingreso.`, 8000);
        }
      }
      this.guardado.emit(det);
    } catch (e) {
      this.error = mensajeDeError(e, 'No se pudo registrar el ingreso.');
    } finally {
      this.saving = false;
    }
  }
}
