import { AfterViewChecked, Component, ElementRef, ViewChild, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../core/services/chat.service';
import { ContactWidgetService } from '../../core/services/contact-widget.service';
import { AuthService } from '../../core/services/auth.service';
import { formatearMensajeChat } from '../../core/utils/chat-formato';
import { AtlasMascotaComponent } from '../../features/assistant/mascota/atlas-mascota.component';
import { sugerenciasAtlas } from '../../features/assistant/sugerencias-atlas';

interface MensajeChat {
  rol: 'usuario' | 'asistente';
  texto: string;
  /** Solo las respuestas del asistente: texto ya escapado y con formato (ver core/utils/chat-formato.ts). */
  html: string;
}

const SALUDO =
  '¡Hola! Soy **Atlas**, el asistente virtual del ERP. Puedo ayudarte con matrículas, cursos, horarios, prácticas empresariales, encuestas y ambientes. ¿En qué te ayudo?';

/**
 * Ventana de chat con Atlas dentro del ERP — el disparador vive en el sidebar
 * ("Contáctanos", junto a "Cerrar sesión"). Antes este componente también
 * era un ícono flotante de 150px fijo en toda la pantalla: tapaba tablas y
 * en móvil se comía media pantalla, así que se movió al sidebar.
 *
 * Misma imagen que el chat móvil (/m, features/assistant): Atlas en 3D, grande
 * al empezar y como avatar de la cabecera cuando hay conversación. Es el mismo
 * ChatService y el mismo endpoint; solo cambia la pantalla.
 */
@Component({
  selector: 'app-floating-buttons',
  standalone: true,
  imports: [FormsModule, AtlasMascotaComponent],
  templateUrl: './floating-buttons.html',
  styleUrls: ['./floating-buttons.css'],
})
export class FloatingButtons implements AfterViewChecked {

  @ViewChild('mensajesContainer') private mensajesContainer?: ElementRef<HTMLElement>;
  @ViewChild('textareaMensaje') private textareaMensaje?: ElementRef<HTMLTextAreaElement>;

  private mascota?: AtlasMascotaComponent;

  /**
   * El panel se dibuja la primera vez que se abre y DESPUÉS SE CONSERVA: cerrar solo lo oculta (y pausa a
   * Atlas). Antes se destruía y se recreaba en cada apertura —los ~40 mensajes, el contexto WebGL, los
   * shaders—, lo que bloqueaba la página ~360 ms cada vez. Si la primera apertura ocurre mientras Atlas
   * contesta, tiene que arrancar pensando.
   */
  readonly haAbierto = signal(false);

  @ViewChild(AtlasMascotaComponent)
  set mascotaRef(mascota: AtlasMascotaComponent | undefined) {
    this.mascota = mascota;
    // Diferido: cambiar su estado en pleno ciclo de detección de este componente da NG0100 en desarrollo.
    if (mascota) queueMicrotask(() => mascota.pensar(this.cargando));
  }

  mensajeUsuario = '';
  cargando = false;

  // Para no scrollear en CADA ciclo de detección de cambios — ngAfterViewChecked
  // corre muy seguido; solo hace falta reaccionar cuando de verdad cambió algo
  // que altera la altura del panel de mensajes.
  private ultimoConteoMensajes = 0;
  private ultimoCargando = false;

  mensajes: MensajeChat[] = [this.crearMensaje('asistente', SALUDO)];

  // undefined = todavía no corrió el effect de abajo ni una vez (arranque
  // de la app) — distinto de null (sesión cerrada), para no disparar un
  // reinicio de conversación en el primer render.
  private usuarioAnterior: string | null | undefined = undefined;

  constructor(
    private chatService: ChatService,
    private contactWidget: ContactWidgetService,
    private auth: AuthService,
  ) {
    // El disparador (botón "Contáctanos" del sidebar) solo prende/apaga el signal.
    effect(() => {
      if (this.contactWidget.chatAbierto()) {
        this.haAbierto.set(true);
        // Al reabrir sigue siendo la misma conversación de antes y ngAfterViewChecked
        // solo reengancha el scroll cuando cambia la cantidad de mensajes — forzar
        // el conteo a un valor imposible hace que el próximo ciclo lo detecte como
        // cambio y vuelva a scrollear al final.
        this.ultimoConteoMensajes = -1;
      }
    });

    // AuthService.logout() no recarga la página (solo router.navigate) y
    // este componente está montado una sola vez en la raíz de la app — sin
    // esto, la conversación (y el sessionId que se manda al backend)
    // sobrevivía al cierre de sesión y se mezclaba visualmente con la del
    // siguiente usuario que iniciara sesión en la misma pestaña. Además se
    // cierra el panel (no solo se limpia): si quedaba abierto, se veía
    // flotando sobre la propia pantalla de login tras cerrar sesión.
    effect(() => {
      const usuarioActual = this.auth.user()?.id ?? null;
      if (this.usuarioAnterior !== undefined && this.usuarioAnterior !== usuarioActual) {
        this.reiniciarConversacion('cambio-usuario');
        this.contactWidget.cerrarChat();
      }
      this.usuarioAnterior = usuarioActual;

      // Recarga (o el primer login) con sesión ya válida: retoma la última
      // conversación de ESTE usuario en vez de mostrar siempre el saludo —
      // también cubre el caso de cambio de usuario de arriba, porque
      // reiniciarConversacion() ya limpió mensajes/sessionId antes de llegar acá.
      if (usuarioActual) {
        this.cargarHistorialReciente();
      }
    });
  }

  /** Si el usuario ya había chateado antes, retoma esa conversación (mensajes + sessionId) en vez de arrancar en el saludo. Si falla o no hay nada, se queda con el saludo por defecto — nunca bloquea el chat. */
  private cargarHistorialReciente(): void {
    this.chatService.obtenerHistorialReciente().subscribe({
      next: (historial) => {
        if (!historial?.mensajes.length) return;
        this.chatService.adoptarSession(historial.sessionId);
        this.mensajes = historial.mensajes.map((m) =>
          this.crearMensaje(m.rol === 'asistente' ? 'asistente' : 'usuario', m.contenido),
        );
      },
      error: () => {
        // Silencioso a propósito — sin historial previo disponible, el saludo por defecto es una degradación aceptable.
      },
    });
  }

  get chatAbierto(): boolean {
    return this.contactWidget.chatAbierto();
  }

  /** Atlas se muestra grande al empezar y pasa a avatar de la cabecera cuando ya hay conversación. */
  get compacta(): boolean {
    return this.mensajes.some((m) => m.rol === 'usuario');
  }

  /** Preguntas rápidas según el rol; desaparecen al empezar a conversar. */
  get sugerencias(): string[] {
    return this.compacta ? [] : sugerenciasAtlas(this.auth.isAdmin(), this.auth.cargo());
  }

  cerrarChat(): void {
    this.contactWidget.cerrarChat();
  }

  /** Solo se usa para 'cambio-usuario' ahora — el cierre por inactividad se quitó a pedido del negocio. */
  private reiniciarConversacion(motivo: 'cambio-usuario') {
    this.mensajes = [this.crearMensaje('asistente', SALUDO)];

    // Genera nuevo sessionId para que el backend empiece la conversación desde cero
    this.chatService.resetSession();
    this.mascota?.saludar();
  }

  ngAfterViewChecked(): void {
    if (this.mensajes.length !== this.ultimoConteoMensajes || this.cargando !== this.ultimoCargando) {
      this.ultimoConteoMensajes = this.mensajes.length;
      this.ultimoCargando = this.cargando;
      this.scrollAlFinal();
    }
  }

  private scrollAlFinal(): void {
    const el = this.mensajesContainer?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  /** El textarea crece con el texto hasta un tope (ver max-height en el CSS), luego scrollea internamente. */
  ajustarAlturaTextarea(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  onEnter(event: Event, textarea: HTMLTextAreaElement): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) return; // Shift+Enter: salto de línea normal, no envía
    event.preventDefault();
    this.enviar();
  }

  enviar(sugerencia?: string) {
    const texto = (sugerencia ?? this.mensajeUsuario).trim();
    if (!texto || this.cargando) return;

    this.mensajes.push(this.crearMensaje('usuario', texto));
    this.mensajeUsuario = '';
    this.cargando = true;
    this.mascota?.pensar(true);

    // El textarea creció con el mensaje anterior — limpiar mensajeUsuario no
    // encoge por sí solo la altura inline que le puso ajustarAlturaTextarea().
    const textarea = this.textareaMensaje?.nativeElement;
    if (textarea) textarea.style.height = 'auto';

    this.chatService.sendMessage(texto).subscribe({
      next: (res) => {
        this.mensajes.push(this.crearMensaje('asistente', res.reply || 'Sin respuesta'));
        this.terminarEspera();
        this.mascota?.celebrar();
      },
      error: () => {
        this.mensajes.push(this.crearMensaje('asistente', 'Ocurrió un error, intenta de nuevo.'));
        this.terminarEspera();
        this.mascota?.fallar();
      }
    });
  }

  private terminarEspera(): void {
    this.cargando = false;
    this.mascota?.pensar(false);
  }

  private crearMensaje(rol: MensajeChat['rol'], texto: string): MensajeChat {
    return { rol, texto, html: rol === 'asistente' ? formatearMensajeChat(texto) : '' };
  }
}
