import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TenantAdminService } from '../../../../core/services/admin/tenant-admin.service';
import { AdminToastService } from '../../../../core/admin-auth/admin-toast.service';
import { TenantCreado } from '../../../../shared/models/admin/tenant.model';
import { DialogDirective } from '../../../../shared/directives/dialog.directive';

/**
 * Crear un centro sin salir de la lista. Las mismas reglas que el formulario de página
 * (`TenantFormComponent`, que se sigue usando para editar): el slug se propone a partir del
 * nombre y el dominio debe ser un nombre de host en minúsculas.
 */
@Component({
  selector: 'app-tenant-nuevo-modal',
  standalone: true,
  imports: [ReactiveFormsModule, DialogDirective],
  template: `
    <div appDialog class="fixed inset-0 z-[1090] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div class="px-5 pt-5 pb-3 flex items-start justify-between border-b border-gray-100">
          <div>
            <h2 class="text-base font-bold text-gray-900">Nuevo centro de formación</h2>
            <p class="text-xs text-gray-500 mt-0.5">Al crearlo se prepara su base de datos y se genera su usuario administrador.</p>
          </div>
          <button type="button" aria-label="Cerrar" (click)="cerrar.emit()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="guardar()" novalidate>
          <div class="p-5 space-y-4">
            <div>
              <label for="nc-nombre" class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Nombre del centro <span class="text-red-500">*</span></label>
              <input id="nc-nombre" type="text" formControlName="nombre" placeholder="Centro Agropecuario Yamboró" (input)="proponerSlug()"
                class="w-full text-sm rounded-xl border outline-none px-3.5 py-2.5 transition-colors" style="background:var(--surface);color:var(--text);"
                [class.border-red-400]="invalido('nombre')" [class.border-gray-200]="!invalido('nombre')" />
              @if (invalido('nombre')) { <p class="mt-1 text-xs text-red-500">El nombre es obligatorio (máximo 200 caracteres).</p> }
            </div>
            <div>
              <label for="nc-slug" class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Identificador (slug) <span class="text-red-500">*</span></label>
              <input id="nc-slug" type="text" formControlName="slug" placeholder="yamboro"
                class="w-full text-sm rounded-xl border outline-none px-3.5 py-2.5 transition-colors" style="background:var(--surface);color:var(--text);"
                [class.border-red-400]="invalido('slug')" [class.border-gray-200]="!invalido('slug')" />
              <p class="mt-1 text-xs" [class.text-red-500]="invalido('slug')" [class.text-gray-400]="!invalido('slug')">
                Nombre corto del centro para el sistema: solo minúsculas, números y guiones. No se cambia fácilmente después.
              </p>
            </div>
            <div>
              <label for="nc-dominio" class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Dirección de acceso (dominio) <span class="text-red-500">*</span></label>
              <input id="nc-dominio" type="text" formControlName="dominio" placeholder="yamboro.sistema.com" (blur)="normalizarDominio()"
                class="w-full text-sm rounded-xl border outline-none px-3.5 py-2.5 transition-colors" style="background:var(--surface);color:var(--text);"
                [class.border-red-400]="invalido('dominio')" [class.border-gray-200]="!invalido('dominio')" />
              <p class="mt-1 text-xs" [class.text-red-500]="invalido('dominio')" [class.text-gray-400]="!invalido('dominio')">
                La dirección con la que los usuarios del centro entran, en minúsculas y con al menos un punto.
              </p>
            </div>
          </div>

          <div class="px-5 pb-5 flex justify-end gap-2">
            <button type="button" (click)="cerrar.emit()" [disabled]="guardando()"
              class="text-sm font-semibold px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">Cancelar</button>
            <button type="submit" [disabled]="guardando()"
              class="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-opacity hover:opacity-90 disabled:opacity-60" style="background:var(--accent-brand);">
              {{ guardando() ? 'Creando…' : 'Crear centro' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class TenantNuevoModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(TenantAdminService);
  private readonly toast = inject(AdminToastService);

  @Output() cerrar = new EventEmitter<void>();
  @Output() creado = new EventEmitter<TenantCreado>();

  readonly guardando = signal(false);

  readonly form = this.fb.nonNullable.group({
    nombre:  ['', [Validators.required, Validators.maxLength(200)]],
    slug:    ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/^[a-z0-9-]+$/)]],
    dominio: ['', [
      Validators.required,
      Validators.maxLength(200),
      Validators.pattern(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/),
    ]],
  });

  invalido(campo: 'nombre' | 'slug' | 'dominio'): boolean {
    const c = this.form.controls[campo];
    return c.invalid && c.touched;
  }

  proponerSlug(): void {
    if (this.form.controls.slug.dirty) return;          // si ya lo escribieron a mano, no se pisa
    const slug = this.form.controls.nombre.value
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
    this.form.controls.slug.setValue(slug);
  }

  normalizarDominio(): void {
    this.form.controls.dominio.setValue(this.form.controls.dominio.value.trim().toLowerCase());
  }

  guardar(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); this.toast.error('Revisa los campos marcados en rojo.'); return; }
    this.guardando.set(true);
    this.api.crear({ ...this.form.getRawValue(), estado: 'activo' }).subscribe({
      next: (r) => { this.guardando.set(false); this.form.markAsPristine(); this.creado.emit(r); },
      error: (err) => { this.guardando.set(false); this.toast.httpError(err, 'No se pudo crear el centro.'); },
    });
  }
}
