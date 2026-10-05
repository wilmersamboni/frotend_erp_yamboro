import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminTableComponent, TableRowLink } from '../../shared/components/admin-table.component';
import { SearchableSelectComponent, SSOption } from '../../shared/components/searchable-select.component';
import { DialogDirective } from '../../shared/directives/dialog.directive';
import { ToastService, mensajeDeError } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Marca, MaterialesApiService } from './data-access/materiales-api.service';

/**
 * Marcas del catálogo (2026-10-05) — lista única por centro que se elige en la
 * ficha, en vez de texto libre ("Dell", "DELL", "dell" eran tres marcas).
 * Todos los gestores la ven; crear, renombrar, desactivar y juntar es de
 * quien gestiona el catálogo (administrador y líderes de área), mismo
 * criterio que crear fichas.
 */
@Component({
  selector: 'app-materiales-marcas',
  standalone: true,
  imports: [FormsModule, AdminTableComponent, DialogDirective, SearchableSelectComponent],
  template: `
    <div class="p-6">
      <div class="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 class="text-xl font-bold text-gray-800">Marcas</h1>
          <p class="text-sm text-gray-500 mt-0.5">Lista única de marcas del catálogo. Se elige al crear o editar una ficha.</p>
        </div>
        <label class="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" [(ngModel)]="verInactivas" (ngModelChange)="cargar()" class="rounded" />
          Ver desactivadas
        </label>
      </div>

      <app-admin-table
        [addLabel]="gestiona ? 'Nueva marca' : null"
        (add)="nueva()"
        [rows]="filas"
        [searchable]="true"
        searchPlaceholder="Buscar marca…"
        [columns]="['nombre', 'fichas', 'estado_txt']"
        [columnLabels]="{ nombre: 'Marca', fichas: 'Fichas', estado_txt: 'Estado' }"
        [loading]="loading"
        [canEdit]="gestiona"
        [canDelete]="gestiona"
        [deleteLabel]="etiquetaEstado"
        [rowLinks]="gestiona ? acciones : []"
        (edit)="editar($event)"
        (delete)="alternarEstado($event)" />
    </div>

    @if (modal) {
      <div appDialog class="fixed inset-0 bg-black/40 flex items-start sm:items-center justify-center z-50 overflow-y-auto p-2 sm:p-4" (click)="modal = null">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md my-auto flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between px-5 pt-5 pb-3">
            <h2 class="text-lg font-bold text-gray-800">
              {{ modal === 'juntar' ? 'Juntar «' + seleccion?.nombre + '» en otra marca' : seleccion ? 'Renombrar marca' : 'Nueva marca' }}
            </h2>
            <button aria-label="Cerrar" (click)="modal = null" class="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-xl leading-none">×</button>
          </div>
          <div class="px-5 pb-2 space-y-3">
            @if (modal === 'juntar') {
              <p class="text-xs text-gray-500">
                Sus {{ seleccion?.fichas }} ficha(s) pasan a la marca que elijas, y «{{ seleccion?.nombre }}» desaparece de la lista.
                Úsalo cuando son la misma marca escrita distinto.
              </p>
              <app-ss [options]="opcionesDestino" placeholder="Marca que se queda…" [(ngModel)]="idDestino"></app-ss>
            } @else {
              <input type="text" [(ngModel)]="nombre" maxlength="80" placeholder="Ej: DELL, Bosch, 3M" (keydown.enter)="guardar()"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 focus:border-[#39A900]" />
              @if (seleccion) { <p class="text-xs text-gray-400">Cambia el nombre en las {{ seleccion.fichas }} ficha(s) que la usan.</p> }
            }
            @if (error) { <p class="text-red-600 text-xs p-2 bg-red-50 rounded-lg">{{ error }}</p> }
          </div>
          <div class="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 mt-2">
            <button (click)="modal = null" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
            <button (click)="modal === 'juntar' ? juntar() : guardar()" [disabled]="saving"
              class="px-5 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-60" style="background-color: var(--accent-brand)">
              {{ saving ? 'Guardando…' : modal === 'juntar' ? 'Juntar' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class MaterialesMarcasComponent implements OnInit {
  private readonly api = inject(MaterialesApiService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  marcas: Marca[] = [];
  filas: any[] = [];
  loading = false;
  verInactivas = false;
  gestiona = false;

  modal: 'nombre' | 'juntar' | null = null;
  seleccion: Marca | null = null;
  nombre = '';
  idDestino = '';
  saving = false;
  error: string | null = null;

  etiquetaEstado = (row: any): string => (row.activo ? 'Desactivar' : 'Activar');
  readonly acciones: TableRowLink[] = [{ label: 'Juntar', onClick: (row) => this.abrirJuntar(row) }];

  ngOnInit(): void {
    void this.cargar();
    void this.api.puedeGestionarCatalogo().then((v) => (this.gestiona = v)).catch(() => (this.gestiona = false));
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.marcas = await this.api.listarMarcas(this.verInactivas);
      this.filas = this.marcas.map((m) => ({ ...m, estado_txt: m.activo ? 'Activa' : 'Desactivada' }));
    } catch (e) {
      this.toast.httpError(e, 'No se pudieron cargar las marcas.');
    } finally {
      this.loading = false;
    }
  }

  get opcionesDestino(): SSOption[] {
    return this.marcas
      .filter((m) => m.activo && m.id_marca !== this.seleccion?.id_marca)
      .map((m) => ({ value: m.id_marca, label: `${m.nombre} (${m.fichas} ficha${m.fichas === 1 ? '' : 's'})` }));
  }

  nueva(): void {
    this.seleccion = null;
    this.nombre = '';
    this.error = null;
    this.modal = 'nombre';
  }

  editar(m: Marca): void {
    this.seleccion = m;
    this.nombre = m.nombre;
    this.error = null;
    this.modal = 'nombre';
  }

  abrirJuntar(m: Marca): void {
    this.seleccion = m;
    this.idDestino = '';
    this.error = null;
    this.modal = 'juntar';
  }

  async guardar(): Promise<void> {
    if (!this.nombre.trim()) { this.error = 'Escribe el nombre de la marca.'; return; }
    this.saving = true;
    this.error = null;
    try {
      if (this.seleccion) {
        await this.api.actualizarMarca(this.seleccion.id_marca, { nombre: this.nombre.trim() });
        this.toast.ok('Marca renombrada');
      } else {
        await this.api.crearMarca(this.nombre.trim());
        this.toast.ok('Marca creada');
      }
      this.modal = null;
      await this.cargar();
    } catch (e) {
      this.error = mensajeDeError(e, 'No se pudo guardar la marca.');
    } finally {
      this.saving = false;
    }
  }

  async juntar(): Promise<void> {
    if (!this.seleccion || !this.idDestino) { this.error = 'Elige la marca que se queda.'; return; }
    this.saving = true;
    this.error = null;
    try {
      const r = await this.api.fusionarMarca(this.seleccion.id_marca, this.idDestino);
      this.toast.ok(`Juntadas en «${r.marca.nombre}»`, `${r.fichas_movidas} ficha(s) cambiaron de marca.`);
      if (r.fichas_repetidas.length) {
        this.toast.warn('Quedaron fichas repetidas', `Revisa y junta: ${r.fichas_repetidas.join(', ')}.`, 9000);
      }
      this.modal = null;
      await this.cargar();
    } catch (e) {
      this.error = mensajeDeError(e, 'No se pudieron juntar las marcas.');
    } finally {
      this.saving = false;
    }
  }

  async alternarEstado(m: Marca): Promise<void> {
    const activar = !m.activo;
    const pregunta = activar
      ? `¿Activar de nuevo «${m.nombre}»?`
      : `¿Desactivar «${m.nombre}»? Las fichas que la usan la conservan; solo deja de ofrecerse para fichas nuevas.`;
    if (!(await this.confirm.ask(pregunta))) return;
    try {
      await this.api.actualizarMarca(m.id_marca, { activo: activar });
      this.toast.ok(activar ? 'Marca activada' : 'Marca desactivada');
      await this.cargar();
    } catch (e) {
      this.toast.httpError(e, 'No se pudo cambiar el estado de la marca.');
    }
  }
}
