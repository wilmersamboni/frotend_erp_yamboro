import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { FORMATOS_ESCANEO_DEFECTO } from './barcode-scanner.types';

/**
 * Escáner de código de barras/QR reusable — "tonto": solo lee un string de
 * la cámara y lo emite (`scanned`), no sabe nada de placas, ítems ni
 * solicitudes (ver plan de escaneo offline, Fase 0). Decodifica 100% en el
 * cliente (`@zxing/browser`), sin ninguna llamada a red.
 *
 * Por defecto SIEMPRE incluye un `<input>` de texto de respaldo — la cámara
 * nunca es el único camino de entrada (placa dañada, código ilegible,
 * permiso de cámara denegado o dispositivo sin cámara trasera utilizable).
 * `[modoManual]="false"` lo saca (ver abajo) para pantallas que ya tienen su
 * propia entrada manual — no tiene sentido duplicarla.
 *
 * `[activo]`: lo controla el padre (ej. `[activo]="modalOpen"`) — al pasar
 * a `false` corta la cámara de inmediato, para no dejarla prendida cuando
 * se cierra el modal que lo contiene.
 */
@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="rounded-xl border border-gray-200 bg-gray-50 p-3">
      @if (modoManual) {
        <div class="flex rounded-lg border border-gray-200 bg-white p-1 mb-3">
          <button type="button" (click)="activarCamara()"
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors"
            [class.bg-gray-100]="modo() === 'camara'"
            [class.text-gray-800]="modo() === 'camara'"
            [class.text-gray-400]="modo() !== 'camara'">
            <lucide-icon name="camera" [size]="16"></lucide-icon>
            Escanear
          </button>
          <button type="button" (click)="activarManual()"
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors"
            [class.bg-gray-100]="modo() === 'manual'"
            [class.text-gray-800]="modo() === 'manual'"
            [class.text-gray-400]="modo() !== 'manual'">
            <lucide-icon name="keyboard" [size]="16"></lucide-icon>
            Escribir a mano
          </button>
        </div>
      }

      @if (modo() === 'camara') {
        <div class="relative rounded-lg overflow-hidden bg-black" style="aspect-ratio: 4/3;">
          <video #video class="w-full h-full object-cover" [style.transform]="espejo() ? 'scaleX(-1)' : null" muted playsinline></video>
          @if (linternaDisponible()) {
            <button type="button" (click)="toggleLinterna()"
              class="absolute bottom-2 right-2 p-2 rounded-full bg-black/50 text-white">
              <lucide-icon [name]="linternaActiva() ? 'flashlight-off' : 'flashlight'" [size]="18"></lucide-icon>
            </button>
          }
        </div>
        @if (error()) {
          <p class="text-xs text-red-500 mt-2">{{ error() }}</p>
        } @else {
          <p class="text-xs text-gray-400 mt-2">Apuntá la cámara al código de barras o QR de la placa.</p>
        }
      } @else if (modoManual) {
        <div class="flex gap-2">
          <input type="text" [(ngModel)]="manual" (keydown.enter)="emitirManual()"
            placeholder="Escribí o pegá la placa..."
            class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30" />
          <button type="button" (click)="emitirManual()" [disabled]="!manual.trim()"
            class="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            style="background-color: #39A900">
            Agregar
          </button>
        </div>
      } @else {
        <button type="button" (click)="activarCamara()"
          class="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-gray-300 text-sm text-gray-600 hover:border-[#39A900] hover:text-[#39A900] transition-colors">
          <lucide-icon name="camera" [size]="16"></lucide-icon>
          Escanear con la cámara
        </button>
        @if (error()) {
          <p class="text-xs text-red-500 mt-2">{{ error() }}</p>
        }
      }
    </div>
  `,
})
export class BarcodeScannerComponent implements OnChanges, OnDestroy {
  @Input() activo = true;
  @Input() formatos = FORMATOS_ESCANEO_DEFECTO;
  /** Ventana mínima entre dos emisiones del mismo código — evita que un
   *  código quieto frente a la cámara dispare el mismo scan en cada frame. */
  @Input() debounceMs = 1500;
  /** `false` para pantallas que ya tienen su propia entrada manual (ej. la
   *  grilla de "Asignar placas SENA") — oculta el toggle y el input de texto
   *  propio, deja solo la cámara (con su botón para activarla). */
  @Input() modoManual = true;
  @Output() scanned = new EventEmitter<string>();

  @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;

  modo = signal<'camara' | 'manual'>('manual');
  error = signal<string | null>(null);
  linternaDisponible = signal(false);
  linternaActiva = signal(false);
  /** Solo se activa para cámara frontal ('user' — el caso típico en una
   *  laptop sin cámara trasera): sin espejar, un código/texto sostenido
   *  frente a la propia cámara se ve al revés, igual que en cualquier
   *  videollamada sin espejo. La trasera ('environment', el caso real en
   *  celular) nunca se espeja — ahí no hay "verse a uno mismo". */
  espejo = signal(false);
  manual = '';

  private readonly cdr = inject(ChangeDetectorRef);
  private reader: BrowserMultiFormatReader | null = null;
  private controls: IScannerControls | null = null;
  private ultimoCodigo: string | null = null;
  private ultimoTimestamp = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['activo'] && !this.activo) {
      this.detenerCamara();
      this.modo.set('manual');
    }
  }

  ngOnDestroy(): void {
    this.detenerCamara();
  }

  activarManual(): void {
    this.detenerCamara();
    this.modo.set('manual');
  }

  async activarCamara(): Promise<void> {
    this.modo.set('camara');
    this.error.set(null);
    // El <video> recién existe en el DOM después de que `modo` cambie a
    // 'camara' — un `await Promise.resolve()` (microtask) NO alcanza acá: en
    // una app con zone.js, la detección de cambios que de verdad crea el
    // elemento corre recién cuando termina la tarea/zona en curso, no dentro
    // de una cadena de microtasks todavía abierta por este mismo async
    // handler. `detectChanges()` fuerza esa actualización ya mismo, sin
    // esperar nada (bug real: sin esto, `videoRef` seguía undefined y el
    // escáner caía siempre a "No se pudo inicializar la cámara").
    this.cdr.detectChanges();
    if (!this.videoRef) {
      this.error.set('No se pudo inicializar la cámara.');
      this.modo.set('manual');
      return;
    }
    try {
      const hints = new Map<DecodeHintType, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, this.formatos);
      // TRY_HARDER: hace que ZXing pruebe más variantes de rotación/lectura
      // por frame (más lento por intento, pero lee bastante más códigos
      // chicos/borrosos/en mal ángulo) — vale la pena porque además bajamos
      // el intervalo entre intentos (ver `delayBetweenScanAttempts` abajo),
      // así que igual escanea seguido.
      hints.set(DecodeHintType.TRY_HARDER, true);
      this.reader = new BrowserMultiFormatReader(hints, {
        // Default de la librería: 500ms entre intentos (2 por segundo) — se
        // sentía lento/errático porque muchos frames buenos para decodificar
        // se salteaban sin más razón que el timer. 100ms (~10/s) es un
        // balance razonable contra el costo extra de TRY_HARDER + la
        // resolución más alta de abajo.
        delayBetweenScanAttempts: 100,
        delayBetweenScanSuccess: 1500,
      });
      // `decodeFromConstraints` (no `decodeFromVideoDevice`, que no deja
      // pasar constraints propios) — pide explícitamente más resolución.
      // Sin esto, `getUserMedia` arranca en ~640x480 por defecto: un código
      // a distancia normal ocupa muy pocos píxeles reales y ZXing no lo
      // decodifica, obligando a acercarlo de forma poco práctica a la
      // cámara. `ideal` (no `exact`/`min`): si el dispositivo no da esa
      // resolución, cae a la mejor que tenga en vez de fallar. `facingMode`
      // también como `ideal`: prioriza la trasera en celular sin reventar
      // en una laptop que solo tiene frontal. `focusMode: 'continuous'`
      // (no tipado en lib.dom — de ahí el `as any`) le pide a la cámara que
      // siga reenfocando sola en vez de enfocar una sola vez al arrancar:
      // sin esto, un código chico/cercano queda desenfocado si no estaba
      // justo en foco al abrir la cámara.
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: 'continuous' } as any],
        },
      };
      this.controls = await this.reader.decodeFromConstraints(
        constraints,
        this.videoRef.nativeElement,
        (result) => {
          if (result) this.onLectura(result.getText());
        },
      );
      this.linternaDisponible.set(!!this.controls.switchTorch);
      this.actualizarEspejo();
    } catch {
      this.error.set(
        this.modoManual
          ? 'No se pudo acceder a la cámara — revisá el permiso, o escribí la placa a mano.'
          : 'No se pudo acceder a la cámara — revisá el permiso, o usá los campos de abajo.',
      );
      this.modo.set('manual');
    }
  }

  private detenerCamara(): void {
    this.controls?.stop();
    this.controls = null;
    this.reader = null;
    this.linternaDisponible.set(false);
    this.linternaActiva.set(false);
    this.espejo.set(false);
  }

  /** Mira qué cámara terminó usando el navegador de verdad (no lo que se
   *  pidió como `ideal`, sino lo que el dispositivo realmente entregó) para
   *  decidir si espejar la vista previa. */
  private actualizarEspejo(): void {
    try {
      const stream = this.videoRef?.nativeElement.srcObject as MediaStream | undefined;
      const track = stream?.getVideoTracks()[0];
      const facingMode = track?.getSettings().facingMode;
      this.espejo.set(facingMode === 'user');
    } catch {
      this.espejo.set(false);
    }
  }

  async toggleLinterna(): Promise<void> {
    if (!this.controls?.switchTorch) return;
    const nuevo = !this.linternaActiva();
    try {
      await this.controls.switchTorch(nuevo);
      this.linternaActiva.set(nuevo);
    } catch {
      // Soporte de linterna es experimental/inconsistente entre navegadores
      // (ver docs de @zxing/browser) — falla silenciosa, no interrumpe el escaneo.
    }
  }

  private onLectura(texto: string): void {
    const ahora = Date.now();
    if (texto === this.ultimoCodigo && ahora - this.ultimoTimestamp < this.debounceMs) return;
    this.ultimoCodigo = texto;
    this.ultimoTimestamp = ahora;
    this.scanned.emit(texto);
  }

  emitirManual(): void {
    const texto = this.manual.trim();
    if (!texto) return;
    this.scanned.emit(texto);
    this.manual = '';
  }
}
