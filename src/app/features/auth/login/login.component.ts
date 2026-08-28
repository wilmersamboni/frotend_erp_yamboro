import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

// Direcciones IPv4 (ej: 192.168.50.108) — no son subdominios de tenant.
// Debe coincidir con la misma exclusión de auth.interceptor.ts: sin esto,
// el primer octeto ("192") se guardaba como slug de tenant apenas cargaba
// esta página, contaminando localStorage antes de que el usuario intentara
// nada (y ganándole de mano al fallback de authInterceptor, que solo se usa
// cuando NO hay tenantSlug ya guardado).
const IPV4_REGEX = /^\d{1,3}(\.\d{1,3}){3}$/;

// Fotos reales del Centro Yamboró para el carrusel del panel izquierdo — los
// archivos van en public/login/ (no src/assets/: en Angular 21 el proyecto
// usa la carpeta "public" como estático servido en la raíz, "assets" en
// angular.json solo está mapeado para taiga-ui/leaflet).
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
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements OnInit, OnDestroy {
  credentials  = { login: '', password: '' };
  tenantSlug   = '';
  loading      = signal(false);
  error        = signal<string | null>(null);
  showPassword = signal(false);
  year         = new Date().getFullYear();

  // slug resuelto del subdominio (ej: centro-huila-test.localhost → 'centro-huila-test'),
  // o el tenant fijo del despliegue si se entra por IP (sin subdominio posible).
  readonly slugFromUrl = this.resolveSlugFromUrl() ?? (environment.defaultTenant || null);

  // hostname sin el slug, para mostrarlo en el mensaje de error (ej: localhost:4200)
  readonly host = window.location.host.replace(/^[^.]+\./, '');

  readonly carouselImagenes = CAROUSEL_IMAGENES;
  slideActivo = signal(0);

  private carouselTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute) {}

  private resolveSlugFromUrl(): string | null {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || IPV4_REGEX.test(hostname)) {
      return null;
    }
    const parts = hostname.split('.');
    return parts.length >= 2 ? parts[0].toLowerCase() : null;
  }

  ngOnInit(): void {
    // Si el slug viene de la URL, lo guardamos en localStorage y no se muestra el campo
    if (this.slugFromUrl) {
      this.tenantSlug = this.slugFromUrl;
      localStorage.setItem('tenantSlug', this.slugFromUrl);
    }

    this.iniciarCarrusel();
  }

  ngOnDestroy(): void {
    if (this.carouselTimer) clearInterval(this.carouselTimer);
  }

  private iniciarCarrusel(): void {
    this.carouselTimer = setInterval(() => this.siguienteSlide(), CAROUSEL_INTERVALO_MS);
  }

  // Reinicia el temporizador al navegar a mano — evita que la flecha del
  // usuario y el avance automático compitan y salte dos veces seguidas.
  private reiniciarTemporizador(): void {
    if (this.carouselTimer) clearInterval(this.carouselTimer);
    this.iniciarCarrusel();
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

  async onSubmit(): Promise<void> {
    if (!this.tenantSlug.trim()) {
      this.error.set('Debes ingresar el nombre del centro (slug) para continuar.');
      return;
    }
    localStorage.setItem('tenantSlug', this.tenantSlug.trim().toLowerCase());
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.login(this.credentials);
      // Si llegó acá redirigido por el authGuard (ej. desde un link de
      // /responder/:token), vuelve exactamente a esa página en vez de /home.
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      this.router.navigateByUrl(returnUrl ?? '/home');
    } catch {
      this.error.set('Usuario o contraseña incorrectos. Intenta de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }
}
