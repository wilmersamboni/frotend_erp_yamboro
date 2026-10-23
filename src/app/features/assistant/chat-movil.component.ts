import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ChatService } from '../../core/services/chat.service';
import { formatearMensajeChat } from '../../core/utils/chat-formato';
import { AtlasMascotaComponent } from './mascota/atlas-mascota.component';
import { sugerenciasAtlas } from './sugerencias-atlas';

interface Mensaje {
  rol: 'usuario' | 'asistente';
  texto: string;
  /** Solo las respuestas del asistente: texto ya escapado y con formato. */
  html: string;
}

const SALUDO =
  '¡Hola! Soy **Atlas**, el asistente virtual del ERP. Puedo ayudarte con matrículas, cursos, horarios, prácticas empresariales, encuestas y ambientes. ¿En qué te ayudo?';

/** Pasado este tiempo esperando respuesta se avisa que puede demorar (el modelo corre local y en frío tarda más). */
const AVISO_LENTO_MS = 8000;

/**
 * Chat de pantalla completa pensado para el celular (PWA), en /m. Usa el mismo
 * ChatService, la misma sesión (cookie) y el mismo endpoint /api2/ia/chat que el
 * widget flotante: no hay un canal aparte, así que roles, permisos y RLS son
 * exactamente los de siempre.
 *
 * Al abrirse cambia el <link rel="manifest"> por uno cuyo start_url es /m, para
 * que "instalar" desde acá deje un acceso que abre directo el chat (y no el ERP
 * completo), y con él el ícono de iOS y el favicon, para que ese acceso lleve la
 * imagen de Atlas y no el logo del sistema. Al salir restaura los originales.
 */
@Component({
  selector: 'app-chat-movil',
  standalone: true,
  imports: [RouterLink, AtlasMascotaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-movil.component.html',
  styleUrls: ['./chat-movil.component.css'],
  host: { '[style.--vv-h]': 'alturaVisible()', '[style.--vv-top]': 'desplazamientoVisible()' },
})
export class ChatMovilComponent implements OnInit, OnDestroy {
  private readonly chat = inject(ChatService);
  protected readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');
  private readonly campo = viewChild<ElementRef<HTMLTextAreaElement>>('campo');
  private readonly mascota = viewChild(AtlasMascotaComponent);

  protected readonly mensajes = signal<Mensaje[]>([this.crearMensaje('asistente', SALUDO)]);
  protected readonly texto = signal('');
  protected readonly cargando = signal(false);
  protected readonly lento = signal(false);
  protected readonly menuAbierto = signal(false);

  /** Alto y desplazamiento del área realmente visible: con el teclado abierto el visualViewport es más chico que la ventana. */
  protected readonly alturaVisible = signal('100dvh');
  protected readonly desplazamientoVisible = signal('0px');
  protected readonly campoEnfocado = signal(false);
  private readonly proporcionVisible = signal(1);
  /** Teclado virtual abierto = el campo tiene el foco Y el área visible se achicó (solo lo segundo puede ser un falso positivo mientras carga la ventana). */
  protected readonly tecladoAbierto = computed(() => this.campoEnfocado() && this.proporcionVisible() < 0.8);

  /** La mascota se muestra grande al empezar y pasa a avatar de la cabecera cuando hay conversación o el teclado ocupa la pantalla. */
  protected readonly compacta = computed(() => this.tecladoAbierto() || this.mensajes().some((m) => m.rol === 'usuario'));
  protected readonly estadoTexto = computed(() => (this.cargando() ? 'pensando…' : 'en línea'));

  protected readonly nombre = computed(() => {
    const completo = this.auth.user()?.nombre?.trim();
    return completo ? completo.split(/\s+/)[0] : '';
  });

  protected readonly sugerencias = computed(() => {
    if (this.mensajes().some((m) => m.rol === 'usuario')) return [];
    return sugerenciasAtlas(this.auth.isAdmin(), this.auth.cargo());
  });

  protected readonly puedeEnviar = computed(() => this.texto().trim().length > 0 && !this.cargando());

  private readonly enlacesOriginales = new Map<HTMLLinkElement, { href: string | null; type: string | null }>();
  private temporizadorLento: ReturnType<typeof setTimeout> | undefined;
  private readonly alAjustarVisor = () => this.sincronizarVisor();

  constructor() {
    // Cada mensaje nuevo (o el indicador de "escribiendo") lleva el scroll al final.
    effect(() => {
      this.mensajes();
      this.cargando();
      requestAnimationFrame(() => this.scrollAlFinal());
    });
    // La mascota piensa mientras Atlas contesta. (Se lee `cargando` antes que `mascota`: ver el
    // efecto de `compacta` en AtlasMascotaComponent sobre `?.` y dependencias que no se registran.)
    effect(() => {
      const pensando = this.cargando();
      this.mascota()?.pensar(pensando);
    });
  }

  ngOnInit(): void {
    this.usarIdentidadDelChat();
    this.sincronizarVisor();
    window.visualViewport?.addEventListener('resize', this.alAjustarVisor);
    window.visualViewport?.addEventListener('scroll', this.alAjustarVisor);
    this.cargarHistorialReciente();
  }

  ngOnDestroy(): void {
    clearTimeout(this.temporizadorLento);
    window.visualViewport?.removeEventListener('resize', this.alAjustarVisor);
    window.visualViewport?.removeEventListener('scroll', this.alAjustarVisor);
    this.restaurarIdentidad();
  }

  protected enviar(sugerencia?: string): void {
    const limpio = (sugerencia ?? this.texto()).trim();
    if (!limpio || this.cargando()) return;

    this.agregar('usuario', limpio);
    this.texto.set('');
    this.reajustarCampo(true);
    this.cargando.set(true);
    this.temporizadorLento = setTimeout(() => this.lento.set(true), AVISO_LENTO_MS);

    this.chat
      .sendMessage(limpio)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.agregar('asistente', res?.reply || 'Sin respuesta');
          this.terminarEspera();
          this.mascota()?.celebrar();
        },
        error: () => {
          this.agregar('asistente', 'Ocurrió un error, intenta de nuevo.');
          this.terminarEspera();
          this.mascota()?.fallar();
        },
      });
  }

  protected alEscribir(event: Event): void {
    this.texto.set((event.target as HTMLTextAreaElement).value);
    this.reajustarCampo();
  }

  protected alPulsarEnter(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) return; // Shift+Enter: salto de línea normal
    event.preventDefault();
    this.enviar();
  }

  protected nuevaConversacion(): void {
    this.menuAbierto.set(false);
    this.chat.resetSession();
    this.mensajes.set([this.crearMensaje('asistente', SALUDO)]);
    this.mascota()?.saludar();
  }

  protected cerrarSesion(): void {
    this.menuAbierto.set(false);
    void this.auth.logout();
  }

  private agregar(rol: Mensaje['rol'], texto: string): void {
    this.mensajes.update((ms) => [...ms, this.crearMensaje(rol, texto)]);
  }

  private crearMensaje(rol: Mensaje['rol'], texto: string): Mensaje {
    return { rol, texto, html: rol === 'asistente' ? formatearMensajeChat(texto) : '' };
  }

  private terminarEspera(): void {
    clearTimeout(this.temporizadorLento);
    this.lento.set(false);
    this.cargando.set(false);
  }

  /** Retoma la última conversación del usuario; si falla o no hay, queda el saludo (nunca bloquea el chat). */
  private cargarHistorialReciente(): void {
    this.chat
      .obtenerHistorialReciente()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (historial) => {
          if (!historial?.mensajes.length) return;
          this.chat.adoptarSession(historial.sessionId);
          this.mensajes.set(
            historial.mensajes.map((m) => this.crearMensaje(m.rol === 'asistente' ? 'asistente' : 'usuario', m.contenido)),
          );
        },
        error: () => undefined,
      });
  }

  private scrollAlFinal(): void {
    const el = this.lista()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  /** El textarea crece con el texto hasta el tope del CSS; `vaciar` lo devuelve a una línea tras enviar. */
  private reajustarCampo(vaciar = false): void {
    const el = this.campo()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    if (!vaciar) el.style.height = `${el.scrollHeight}px`;
  }

  /** Con el teclado abierto en el celular, el área visible es menor que la ventana: sin esto la barra de escribir queda tapada. */
  private sincronizarVisor(): void {
    const vv = window.visualViewport;
    if (!vv) return;
    this.alturaVisible.set(`${Math.round(vv.height)}px`);
    this.desplazamientoVisible.set(`${Math.round(vv.offsetTop)}px`);
    this.proporcionVisible.set(window.innerHeight > 0 ? vv.height / window.innerHeight : 1);
    requestAnimationFrame(() => this.scrollAlFinal());
  }

  /**
   * Mientras el chat está abierto, la página se presenta como "Atlas": manifiesto (start_url /m), ícono de
   * pantalla de inicio de iOS (que no lee el manifiesto) y favicon. Cada enlace se restaura al salir.
   */
  private usarIdentidadDelChat(): void {
    this.cambiarEnlace('link[rel="manifest"]', 'manifest-chat.webmanifest');
    this.cambiarEnlace('link[rel="apple-touch-icon"]', '/icons/atlas-apple-180x180.png');
    this.cambiarEnlace('link[rel="icon"]', '/icons/atlas-favicon-64x64.png', 'image/png');
  }

  private cambiarEnlace(selector: string, href: string, type?: string): void {
    const enlace = document.querySelector<HTMLLinkElement>(selector);
    if (!enlace) return;
    this.enlacesOriginales.set(enlace, { href: enlace.getAttribute('href'), type: enlace.getAttribute('type') });
    enlace.setAttribute('href', href);
    if (type) enlace.setAttribute('type', type);
  }

  private restaurarIdentidad(): void {
    for (const [enlace, original] of this.enlacesOriginales) {
      if (original.href !== null) enlace.setAttribute('href', original.href);
      if (original.type !== null) enlace.setAttribute('type', original.type);
      else enlace.removeAttribute('type');
    }
    this.enlacesOriginales.clear();
  }
}
