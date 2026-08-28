import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TenantAdminService } from '../../../../core/services/admin/tenant-admin.service';
import { AdminToastService } from '../../../../core/admin-auth/admin-toast.service';
import { AdminCredencialesModalComponent } from '../../../../shared/components/admin/credenciales-modal.component';
import { TenantCredenciales } from '../../../../shared/models/admin/tenant.model';
import { SearchableSelectComponent, SSOption } from '../../../../shared/components/searchable-select.component';

@Component({
  selector: 'app-tenant-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AdminCredencialesModalComponent, SearchableSelectComponent],
  template: `
    <div class="max-w-3xl mx-auto rounded-3xl p-8">
      <div class="mb-6 mx-auto text-center">
        <nav class="flex items-center justify-center gap-1.5 text-xs text-gray-400 mb-2">
          <a routerLink="/tenants" class="hover:text-[#007832] transition-colors">Centros de Formación</a>
          <span>/</span>
          <span class="text-gray-600 font-medium">{{ modoEdicion() ? 'Editar' : 'Nuevo' }}</span>
        </nav>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight">{{ modoEdicion() ? 'Editar Centro' : 'Nuevo Centro' }}</h1>
      </div>

      @if (cargando()) {
        <div class="flex flex-col items-center justify-center py-16">
          <svg class="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#39A900" stroke-width="3">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="space-y-5 max-w-3xl mx-auto">
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2 font-semibold text-sm text-gray-800">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#39A900" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1" />
              </svg>
              Datos generales
            </div>
            <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="md:col-span-1">
                <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  Nombre del Centro <span class="text-red-500">*</span>
                </label>
                <input type="text" formControlName="nombre" placeholder="Centro Agropecuario Yamboró"
                  (input)="onNombreChange()"
                  class="w-full text-sm rounded-xl border outline-none px-3.5 py-2.5 transition-colors focus:border-[#39A900]"
                  [class.border-red-400]="form.controls.nombre.invalid && form.controls.nombre.touched"
                  [class.border-gray-200]="!(form.controls.nombre.invalid && form.controls.nombre.touched)" />
                @if (form.controls.nombre.invalid && form.controls.nombre.touched) {
                  <p class="mt-1 text-xs text-red-500">El nombre es obligatorio (máx. 200 caracteres).</p>
                }
              </div>
              <div>
                <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  Slug <span class="text-red-500">*</span>
                </label>
                <input type="text" formControlName="slug" placeholder="huila"
                  class="w-full text-sm rounded-xl border outline-none px-3.5 py-2.5 transition-colors focus:border-[#39A900]"
                  [class.border-red-400]="form.controls.slug.invalid && form.controls.slug.touched"
                  [class.border-gray-200]="!(form.controls.slug.invalid && form.controls.slug.touched)" />
                @if (form.controls.slug.invalid && form.controls.slug.touched) {
                  <p class="mt-1 text-xs text-red-500">Solo minúsculas, números y guiones.</p>
                }
              </div>
              @if (modoEdicion()) {
                <div>
                  <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Estado</label>
                  <app-ss [options]="estadoOptions" formControlName="estado"></app-ss>
                </div>
              }
              <div class="md:col-span-2">
                <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  Dominio <span class="text-red-500">*</span>
                </label>
                <input type="text" formControlName="dominio" placeholder="huila.sistema.com"
                  class="w-full text-sm rounded-xl border outline-none px-3.5 py-2.5 transition-colors focus:border-[#39A900]"
                  [class.border-red-400]="form.controls.dominio.invalid && form.controls.dominio.touched"
                  [class.border-gray-200]="!(form.controls.dominio.invalid && form.controls.dominio.touched)" />
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pb-4">
            <button type="button" (click)="cancelar()" [disabled]="guardando()"
              class="text-sm font-semibold px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" [disabled]="guardando()"
              class="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style="background:#39A900;">
              @if (guardando()) {
                <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <circle cx="12" cy="12" r="10" stroke-opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              }
              {{ guardando() ? 'Guardando...' : (modoEdicion() ? 'Guardar cambios' : 'Crear Tenant') }}
            </button>
          </div>
        </form>
      }
    </div>

    <app-admin-credenciales-modal
      [visible]="mostrarCredenciales()"
      titulo="Tenant creado — guarda las credenciales"
      [login]="credencialesNuevas()?.login ?? ''"
      [password]="credencialesNuevas()?.password ?? ''"
      (cerrar)="onCerrarCredenciales()" />
  `,
})
export class TenantFormComponent {
  private readonly fb            = inject(FormBuilder);
  private readonly tenantService = inject(TenantAdminService);
  private readonly toast         = inject(AdminToastService);
  private readonly router        = inject(Router);
  private readonly route         = inject(ActivatedRoute);

  readonly modoEdicion        = signal(false);
  readonly tenantId           = signal<string | null>(null);
  readonly cargando           = signal(false);
  readonly guardando          = signal(false);
  readonly mostrarCredenciales = signal(false);
  readonly credencialesNuevas  = signal<TenantCredenciales | null>(null);

  readonly estadoOptions: SSOption[] = [
    { value: 'activo',   label: 'Activo' },
    { value: 'inactivo', label: 'Inactivo' },
  ];

  readonly form = this.fb.nonNullable.group({
    nombre:  ['', [Validators.required, Validators.maxLength(200)]],
    slug:    ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/^[a-z0-9-]+$/)]],
    dominio: ['', [Validators.required, Validators.maxLength(200)]],
    estado:  ['activo' as 'activo' | 'inactivo', [Validators.required]],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) { this.modoEdicion.set(true); this.tenantId.set(id); this.cargarTenant(id); }
  }

  onNombreChange(): void {
    if (this.modoEdicion()) return;
    const slug = this.form.controls.nombre.value
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
    this.form.controls.slug.setValue(slug);
  }

  private cargarTenant(id: string): void {
    this.cargando.set(true);
    this.tenantService.obtenerPorId(id).subscribe({
      next: (t) => { this.form.patchValue({ nombre: t.nombre, slug: t.slug, dominio: t.dominio, estado: t.estado }); this.cargando.set(false); },
      error: () => { this.cargando.set(false); this.toast.error('No se pudo cargar el centro.'); this.router.navigate(['/tenants']); },
    });
  }

  onSubmit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); this.toast.error('Revisa los campos marcados en rojo.'); return; }
    this.guardando.set(true);
    const payload = this.form.getRawValue();
    const id = this.tenantId();

    if (this.modoEdicion() && id) {
      this.tenantService.actualizar(id, payload).subscribe({
        next: () => {
          this.guardando.set(false);
          this.toast.success('Centro actualizado correctamente.');
          this.router.navigate(['/tenants']);
        },
        error: (err) => { this.guardando.set(false); this.toast.error(err?.error?.message ?? 'Ocurrió un error al guardar el centro.'); },
      });
    } else {
      this.tenantService.crear(payload).subscribe({
        next: (respuesta) => {
          this.guardando.set(false);
          if (respuesta.credencialesDefecto) {
            this.credencialesNuevas.set(respuesta.credencialesDefecto);
            this.mostrarCredenciales.set(true);
          } else {
            this.toast.success('Centro creado correctamente.');
            this.router.navigate(['/tenants']);
          }
        },
        error: (err) => { this.guardando.set(false); this.toast.error(err?.error?.message ?? 'Ocurrió un error al guardar el centro.'); },
      });
    }
  }

  onCerrarCredenciales(): void {
    this.mostrarCredenciales.set(false);
    this.router.navigate(['/tenants']);
  }

  cancelar(): void { this.router.navigate(['/tenants']); }
}
