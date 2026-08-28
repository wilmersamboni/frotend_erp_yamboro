import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RootUserAdminService } from '../../../../core/services/admin/root-user-admin.service';
import { AdminToastService } from '../../../../core/admin-auth/admin-toast.service';

function passwordsCoincidenValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get('password')?.value ?? '';
    const confirmar = group.get('confirmarPassword')?.value ?? '';
    if (!password && !confirmar) return null;
    return password === confirmar ? null : { passwordsNoCoinciden: true };
  };
}

@Component({
  selector: 'app-root-user-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="max-w-2xl mx-auto rounded-3xl p-8">
      <div class="mb-6 mx-auto text-center">
        <nav class="flex items-center justify-center gap-1.5 text-xs text-gray-400 mb-2">
          <a routerLink="/root-users" class="hover:text-[#007832] transition-colors">Usuarios Root</a>
          <span>/</span>
          <span class="text-gray-600 font-medium">{{ modoEdicion() ? 'Editar' : 'Nuevo' }}</span>
        </nav>
        <h1 class="text-2xl font-bold text-gray-900 tracking-tight">{{ modoEdicion() ? 'Editar Usuario' : 'Nuevo Usuario Root' }}</h1>
      </div>

      @if (cargando()) {
        <div class="flex flex-col items-center justify-center py-16">
          <svg class="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#39A900" stroke-width="3">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="space-y-5">
          <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="md:col-span-2">
                <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  Nombre <span class="text-red-500">*</span>
                </label>
                <input type="text" formControlName="nombre" placeholder="Nombre completo"
                  class="w-full text-sm rounded-xl border outline-none px-3.5 py-2.5 transition-colors focus:border-[#39A900]"
                  [class.border-red-400]="form.controls.nombre.invalid && form.controls.nombre.touched"
                  [class.border-gray-200]="!(form.controls.nombre.invalid && form.controls.nombre.touched)" />
                @if (form.controls.nombre.invalid && form.controls.nombre.touched) {
                  <p class="mt-1 text-xs text-red-500">El nombre es obligatorio.</p>
                }
              </div>

              <div class="md:col-span-2">
                <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  Correo electrónico <span class="text-red-500">*</span>
                </label>
                <input type="email" formControlName="correo" placeholder="admin@sistema.com"
                  class="w-full text-sm rounded-xl border outline-none px-3.5 py-2.5 transition-colors focus:border-[#39A900]"
                  [class.border-red-400]="form.controls.correo.invalid && form.controls.correo.touched"
                  [class.border-gray-200]="!(form.controls.correo.invalid && form.controls.correo.touched)" />
                @if (form.controls.correo.invalid && form.controls.correo.touched) {
                  <p class="mt-1 text-xs text-red-500">Ingresa un correo electrónico válido.</p>
                }
              </div>

              <div>
                <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  Contraseña @if (!modoEdicion()) { <span class="text-red-500">*</span> }
                </label>
                <input type="password" formControlName="password"
                  [placeholder]="modoEdicion() ? 'Dejar vacío para no cambiar' : '••••••••'"
                  class="w-full text-sm rounded-xl border outline-none px-3.5 py-2.5 transition-colors focus:border-[#39A900]"
                  [class.border-red-400]="form.controls.password.invalid && form.controls.password.touched"
                  [class.border-gray-200]="!(form.controls.password.invalid && form.controls.password.touched)" />
              </div>

              <div>
                <label class="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                  Confirmar contraseña @if (!modoEdicion()) { <span class="text-red-500">*</span> }
                </label>
                <input type="password" formControlName="confirmarPassword" placeholder="••••••••"
                  class="w-full text-sm rounded-xl border outline-none px-3.5 py-2.5 transition-colors focus:border-[#39A900]"
                  [class.border-red-400]="form.errors?.['passwordsNoCoinciden'] && form.controls.confirmarPassword.touched"
                  [class.border-gray-200]="!(form.errors?.['passwordsNoCoinciden'] && form.controls.confirmarPassword.touched)" />
                @if (form.errors?.['passwordsNoCoinciden'] && form.controls.confirmarPassword.touched) {
                  <p class="mt-1 text-xs text-red-500">Las contraseñas no coinciden.</p>
                }
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
              {{ guardando() ? 'Guardando...' : (modoEdicion() ? 'Guardar cambios' : 'Crear Usuario') }}
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class RootUserFormComponent {
  private readonly fb              = inject(FormBuilder);
  private readonly rootUserService = inject(RootUserAdminService);
  private readonly toast           = inject(AdminToastService);
  private readonly router          = inject(Router);
  private readonly route           = inject(ActivatedRoute);

  readonly modoEdicion = signal(false);
  readonly usuarioId   = signal<string | null>(null);
  readonly cargando    = signal(false);
  readonly guardando   = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      nombre:           ['', [Validators.required, Validators.maxLength(150)]],
      correo:           ['', [Validators.required, Validators.email]],
      password:         [''],
      confirmarPassword:[''],
    },
    { validators: passwordsCoincidenValidator() },
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.modoEdicion.set(true);
      this.usuarioId.set(id);
      this.form.controls.password.clearValidators();
      this.cargarUsuario(id);
    } else {
      this.form.controls.password.addValidators([Validators.required, Validators.minLength(6)]);
    }
  }

  private cargarUsuario(id: string): void {
    this.cargando.set(true);
    this.rootUserService.obtenerPorId(id).subscribe({
      next: (u) => { this.form.patchValue({ nombre: u.nombre, correo: u.correo }); this.cargando.set(false); },
      error: () => { this.cargando.set(false); this.toast.error('No se pudo cargar el usuario.'); this.router.navigate(['/root-users']); },
    });
  }

  onSubmit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); this.toast.error('Revisa los campos marcados en rojo.'); return; }
    this.guardando.set(true);
    const { nombre, correo, password } = this.form.getRawValue();
    const id = this.usuarioId();
    const peticion = this.modoEdicion() && id
      ? this.rootUserService.actualizar(id, { nombre, correo, ...(password ? { password } : {}) })
      : this.rootUserService.crear({ nombre, correo, password });
    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        this.toast.success(this.modoEdicion() ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.');
        this.router.navigate(['/root-users']);
      },
      error: (err) => { this.guardando.set(false); this.toast.error(err?.error?.message ?? 'Ocurrió un error al guardar el usuario.'); },
    });
  }

  cancelar(): void { this.router.navigate(['/root-users']); }
}
