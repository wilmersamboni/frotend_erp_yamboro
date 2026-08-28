import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../../core/admin-auth/admin-auth.service';
import { AdminToastService } from '../../../core/admin-auth/admin-toast.service';

// Fotos reales del Centro Yamboró reutilizadas para el carrusel — mismas que
// el login normal (login.component.ts), viven en public/login/.
const CAROUSEL_IMAGENES = [
  'login/campus-1.jpg',
  'login/campus-2.jpg',
  'login/campus-3.jpg',
  'login/campus-4.jpg',
  'login/campus-5.jpg',
  'login/campus-6.png',
  'login/campus-7.png',
];

const CAROUSEL_INTERVALO_MS = 6000;

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './admin-login.component.html',
  styleUrl: './admin-login.component.css',
})
export class AdminLoginComponent implements OnInit, OnDestroy {
  private readonly fb           = inject(FormBuilder);
  private readonly authService  = inject(AdminAuthService);
  private readonly toast        = inject(AdminToastService);
  private readonly router       = inject(Router);

  readonly cargando        = signal(false);
  readonly mostrarPassword = signal(false);
  readonly year            = new Date().getFullYear();

  readonly carouselImagenes = CAROUSEL_IMAGENES;
  slideActivo = signal(0);

  private carouselTimer: ReturnType<typeof setInterval> | null = null;

  readonly form = this.fb.nonNullable.group({
    correo:   ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  ngOnInit(): void {
    this.carouselTimer = setInterval(() => this.siguienteSlide(), CAROUSEL_INTERVALO_MS);
  }

  ngOnDestroy(): void {
    if (this.carouselTimer) clearInterval(this.carouselTimer);
  }

  private reiniciarTemporizador(): void {
    if (this.carouselTimer) clearInterval(this.carouselTimer);
    this.carouselTimer = setInterval(() => this.siguienteSlide(), CAROUSEL_INTERVALO_MS);
  }

  siguienteSlide(): void {
    this.slideActivo.update(i => (i + 1) % this.carouselImagenes.length);
  }

  anteriorSlide(): void {
    this.slideActivo.update(i => (i - 1 + this.carouselImagenes.length) % this.carouselImagenes.length);
  }

  irASlide(i: number): void {
    this.slideActivo.set(i);
    this.reiniciarTemporizador();
  }

  onFlechaSiguiente(): void {
    this.siguienteSlide();
    this.reiniciarTemporizador();
  }

  onFlechaAnterior(): void {
    this.anteriorSlide();
    this.reiniciarTemporizador();
  }

  toggleMostrarPassword(): void {
    this.mostrarPassword.update((v) => !v);
  }

  onSubmit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.cargando.set(true);

    this.authService.login(this.form.getRawValue()).subscribe({
      next: () => {
        this.cargando.set(false);
        this.toast.success('Bienvenido al panel administrativo');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.cargando.set(false);
        this.toast.error(err?.error?.message ?? 'Credenciales inválidas. Inténtalo de nuevo.');
      },
    });
  }
}
