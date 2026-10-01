import { Directive, ElementRef, Input, NgZone, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Búsqueda con espera: en un `<input appEspera [(ngModel)]="texto">` el modelo
 * (y todo lo que filtre a partir de él) se actualiza cuando el usuario deja de
 * teclear, no en cada tecla.
 *
 * Cómo: el evento `input` del navegador se frena antes de que llegue a Angular y
 * se vuelve a disparar una vez pasada la espera; el `<input>` sigue mostrando lo
 * que se escribe. Mientras se teclea no corre ninguna detección de cambios ni se
 * filtra la lista: se hace una sola vez al terminar. Enter y salir del campo
 * aplican de inmediato. No hace falta tocar el componente: su `ngModel`,
 * `(ngModelChange)` o `(input)` siguen funcionando igual, solo más tarde.
 *
 *   <input appEspera [(ngModel)]="filtroTexto" />          // 300 ms
 *   <input [appEspera]="500" [(ngModel)]="filtroTexto" />  // otra espera
 */
@Directive({
  selector: 'input[appEspera]',
  standalone: true,
})
export class EsperaDirective implements OnInit, OnDestroy {
  /** Milisegundos de espera tras la última tecla. */
  @Input() appEspera: number | '' = '';

  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private readonly zona = inject(NgZone);
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private reenviando = false;
  /** Escucha en el padre y en captura: ahí siempre llega antes que a los oyentes del propio `<input>`. */
  private contenedor: HTMLElement = this.el;

  private readonly alEscribir = (e: Event) => {
    if (e.target !== this.el || this.reenviando) return;
    e.stopImmediatePropagation();
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.enviar(), this.espera());
  };
  private readonly alTeclear = (e: KeyboardEvent) => { if (e.key === 'Enter') this.enviar(); };
  private readonly alSalir = () => this.enviar();

  ngOnInit(): void {
    // Fuera de la zona: teclear no dispara la detección de cambios; se vuelve a entrar al enviar.
    this.contenedor = this.el.parentElement ?? this.el;
    this.zona.runOutsideAngular(() => {
      this.contenedor.addEventListener('input', this.alEscribir, true);
      this.el.addEventListener('keydown', this.alTeclear);
      this.el.addEventListener('blur', this.alSalir);
    });
  }

  ngOnDestroy(): void {
    this.contenedor.removeEventListener('input', this.alEscribir, true);
    this.el.removeEventListener('keydown', this.alTeclear);
    this.el.removeEventListener('blur', this.alSalir);
    if (this.temporizador) clearTimeout(this.temporizador);
  }

  private espera(): number {
    return typeof this.appEspera === 'number' && this.appEspera >= 0 ? this.appEspera : 300;
  }

  /** Entrega ya el último valor escrito, si había uno pendiente. */
  private enviar(): void {
    if (!this.temporizador) return;
    clearTimeout(this.temporizador);
    this.temporizador = null;
    this.zona.run(() => {
      this.reenviando = true;
      try {
        this.el.dispatchEvent(new Event('input', { bubbles: true }));
      } finally {
        this.reenviando = false;
      }
    });
  }
}
