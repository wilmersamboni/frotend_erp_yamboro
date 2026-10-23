import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { AtlasEscena } from './atlas-escena';
import { DURACION_TRANSITORIO, MaquinaEstado, webglDisponible, type EstadoAtlas, type EstadoTransitorio } from './atlas-estados';

let cargaEscena: Promise<typeof import('./atlas-escena')> | null = null;

/**
 * Descarga (una sola vez) el código 3D. Se puede llamar antes de que exista ninguna mascota — p. ej. cuando el
 * usuario abre el menú "Contáctanos", unos segundos antes de elegir el asistente — para que al abrir el chat
 * ya esté en memoria y solo falte crear la escena.
 */
export function precargarEscenaAtlas(): Promise<typeof import('./atlas-escena')> {
  cargaEscena ??= import('./atlas-escena');
  return cargaEscena;
}

/**
 * Atlas, la mascota 3D del chat. Muestra la escena de three.js (carga diferida:
 * ese código solo se descarga cuando se abre /m) y, mientras llega o si el
 * celular no puede con WebGL, un orbe hecho solo con CSS que reacciona igual.
 *
 * El tamaño y la posición los decide quien la usa: el componente llena su caja.
 *
 * Ajuste manual (localStorage `atlas3d`): `respaldo` fuerza el orbe CSS;
 * `forzar` desactiva el vigilante de FPS (para depurar).
 */
@Component({
  selector: 'app-atlas-mascota',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './atlas-mascota.component.html',
  styleUrls: ['./atlas-mascota.component.css'],
  host: { 'aria-hidden': 'true', '[class.avatar]': 'compacta()' },
})
export class AtlasMascotaComponent implements AfterViewInit, OnDestroy {
  /** Modo avatar (cabecera) en vez de héroe de cuerpo entero. */
  readonly compacta = input(false);
  /**
   * false = el chat que la contiene está oculto: la escena deja de dibujar (no gasta GPU ni batería) y
   * retoma al volver a ser true. La escena se conserva, así reabrir el chat no vuelve a crear nada.
   */
  readonly activa = input(true);

  protected readonly tres = signal(false);
  protected readonly estadoVisual = signal<EstadoAtlas>('saludo');

  private readonly zona = inject(NgZone);
  private readonly caja = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly lienzo = viewChild.required<ElementRef<HTMLCanvasElement>>('lienzo');

  private escena: AtlasEscena | null = null;
  private observador: ResizeObserver | null = null;
  private destruido = false;
  private ultimoToque = 0;
  private temporizador: ReturnType<typeof setTimeout> | undefined;
  /** Espejo del estado para el orbe CSS (la escena 3D lleva el suyo). */
  private readonly maquinaVisual = new MaquinaEstado();

  private readonly alMover = (e: PointerEvent) => this.mirarDesde(e.clientX, e.clientY);
  private readonly alCambiarVisibilidad = () => this.sincronizarBucle();

  constructor() {
    effect(() => {
      // Las señales se leen ANTES de tocar `escena`. Con `this.escena?.compacta(this.compacta())`, mientras
      // `escena` es null la expresión se corta, no se lee `compacta` y el efecto queda sin dependencias:
      // nunca vuelve a correr y la escena se queda en el modo con el que nació.
      const compacta = this.compacta();
      this.escena?.compacta(compacta);
    });
    effect(() => {
      this.activa();
      this.sincronizarBucle();
    });
  }

  ngAfterViewInit(): void {
    this.disparar('saludo');
    if (this.preferencia() !== 'respaldo' && webglDisponible()) void this.montar3D();
  }

  ngOnDestroy(): void {
    this.destruido = true;
    clearTimeout(this.temporizador);
    this.degradar();
  }

  // ── API para quien la usa ────────────────────────────────────────────────
  pensar(activo: boolean): void {
    this.maquinaVisual.pensar(activo);
    this.refrescarVisual();
    this.escena?.pensar(activo);
  }

  celebrar(): void {
    this.escena?.celebrar();
    this.disparar('feliz');
  }

  fallar(): void {
    this.escena?.fallar();
    this.disparar('error');
  }

  saludar(): void {
    this.escena?.saludar();
    this.disparar('saludo');
  }

  protected tocar(): void {
    const ahora = performance.now();
    if (ahora - this.ultimoToque < 700) return;
    this.ultimoToque = ahora;
    this.escena?.cosquillas();
    this.disparar('feliz');
  }

  // ── Interno ──────────────────────────────────────────────────────────────
  private async montar3D(): Promise<void> {
    try {
      const { AtlasEscena } = await precargarEscenaAtlas();
      if (this.destruido) return;
      const reducirMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const sinVigilancia = this.preferencia() === 'forzar';

      // El bucle de dibujo y los listeners van FUERA de la zona de Angular: si no, cada frame dispararía una detección de cambios.
      const escena = this.zona.runOutsideAngular(
        () =>
          new AtlasEscena({
            lienzo: this.lienzo().nativeElement,
            reducirMovimiento,
            sinVigilancia,
            alDegradar: () => this.zona.run(() => this.degradar()),
          }),
      );
      this.escena = escena;
      escena.pensar(this.maquinaVisual.actual(this.ahora()) === 'pensando');
      escena.compacta(this.compacta());

      // Compila los shaders sin bloquear la página; mientras tanto se ve el orbe CSS.
      await escena.preparar();
      if (this.destruido || this.escena !== escena) return; // se cerró o degradó mientras compilaba

      this.zona.runOutsideAngular(() => {
        this.observador = new ResizeObserver(() => this.ajustar());
        this.observador.observe(this.caja.nativeElement);
        this.ajustar();
        window.addEventListener('pointermove', this.alMover, { passive: true });
        document.addEventListener('visibilitychange', this.alCambiarVisibilidad);
        this.sincronizarBucle();
      });
      this.tres.set(true);
    } catch {
      this.degradar();
    }
  }

  /** La escena dibuja solo si el componente está activo Y la pestaña visible. */
  private sincronizarBucle(): void {
    const escena = this.escena;
    if (!escena) return;
    if (this.activa() && !document.hidden) this.zona.runOutsideAngular(() => escena.iniciar());
    else escena.pausar();
  }

  /** Libera la escena 3D y deja el orbe CSS (WebGL lento, contexto perdido o componente destruido). */
  private degradar(): void {
    this.observador?.disconnect();
    this.observador = null;
    window.removeEventListener('pointermove', this.alMover);
    document.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
    this.escena?.destruir();
    this.escena = null;
    if (!this.destruido) this.tres.set(false);
  }

  private ajustar(): void {
    const r = this.caja.nativeElement.getBoundingClientRect();
    this.escena?.redimensionar(Math.round(r.width), Math.round(r.height));
  }

  private mirarDesde(x: number, y: number): void {
    const r = this.caja.nativeElement.getBoundingClientRect();
    this.escena?.mirarHacia((x - (r.left + r.width / 2)) / (window.innerWidth / 2), (y - (r.top + r.height / 2)) / (window.innerHeight / 2));
  }

  private disparar(estado: EstadoTransitorio): void {
    this.maquinaVisual.disparar(estado, this.ahora());
    this.refrescarVisual();
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.refrescarVisual(), DURACION_TRANSITORIO[estado] * 1000 + 30);
  }

  private refrescarVisual(): void {
    this.estadoVisual.set(this.maquinaVisual.actual(this.ahora()));
  }

  private ahora(): number {
    return performance.now() / 1000;
  }

  private preferencia(): string | null {
    try {
      return localStorage.getItem('atlas3d');
    } catch {
      return null;
    }
  }
}
