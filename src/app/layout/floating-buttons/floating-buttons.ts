import {  OnDestroy, } from '@angular/core';
import { AfterViewChecked, Component, ElementRef, HostListener, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatService } from '../../core/services/chat.service';
import { ContactWidgetService } from '../../core/services/contact-widget.service';
import { AuthService } from '../../core/services/auth.service';

/**
 * Solo dibuja la ventana de chat — el disparador vive en el sidebar
 * ("Contáctanos", junto a "Cerrar sesión"). Antes este componente también
 * era un ícono flotante de 150px fijo en toda la pantalla: tapaba tablas y
 * en móvil se comía media pantalla, así que se movió al sidebar.
 */
@Component({
  selector: 'app-floating-buttons',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './floating-buttons.html',
  styleUrls: ['./floating-buttons.css'],
})
export class FloatingButtons implements AfterViewChecked {

  @ViewChild('mensajesContainer') private mensajesContainer?: ElementRef<HTMLElement>;
  @ViewChild('textareaMensaje') private textareaMensaje?: ElementRef<HTMLTextAreaElement>;

  mensajeUsuario = '';
  cargando = false;

  // Para no scrollear en CADA ciclo de detección de cambios — ngAfterViewChecked
  // corre muy seguido; solo hace falta reaccionar cuando de verdad cambió algo
  // que altera la altura del panel de mensajes.
  private ultimoConteoMensajes = 0;
  private ultimoCargando = false;

  mensajes: { rol: 'usuario' | 'asistente', texto: string }[] = [
    { rol: 'asistente', texto: '¡Hola! Soy **Atlas**, el asistente virtual del ERP. Puedo ayudarte con matrículas, cursos, horarios, prácticas empresariales, encuestas y ambientes. ¿En qué te ayudo?' }
  ];

  // undefined = todavía no corrió el effect de abajo ni una vez (arranque
  // de la app) — distinto de null (sesión cerrada), para no disparar un
  // reinicio de conversación en el primer render.
  private usuarioAnterior: string | null | undefined = undefined;

  constructor(
    private chatService: ChatService,
    private sanitizer: DomSanitizer,
    public contactWidget: ContactWidgetService,
    private auth: AuthService,
    private elementRef: ElementRef<HTMLElement>,
  ) {
    // El disparador (botón "Contáctanos" del sidebar) solo prende/apaga el signal.
    effect(() => {
      if (this.contactWidget.chatAbierto()) {
        // El panel usa *ngIf: al reabrir, Angular recrea el DOM del chat
        // desde cero con scrollTop=0. ngAfterViewChecked solo reengancha el
        // scroll cuando cambia la cantidad de mensajes, y al reabrir sigue
        // siendo la misma conversación de antes — forzar el conteo a un
        // valor imposible hace que el próximo ciclo lo detecte como cambio
        // y sí vuelva a scrollear al final.
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
        this.mensajes = historial.mensajes.map((m) => ({
          rol: m.rol === 'asistente' ? 'asistente' : 'usuario',
          texto: m.contenido,
        }));
      },
      error: () => {
        // Silencioso a propósito — sin historial previo disponible, el saludo por defecto es una degradación aceptable.
      },
    });
  }

  // /** Clic fuera de la ventana del chat (y fuera del botón que lo abre, ver sidebar.component.ts) la cierra. */
  // @HostListener('document:click', ['$event'])
  // onClickFuera(event: MouseEvent): void {
  //   if (!this.chatAbierto) return;
  //   const target = event.target as Node;
  //   if (!this.elementRef.nativeElement.contains(target)) {
  //     this.cerrarChat();
  //   }
  // }



  get chatAbierto(): boolean {
    return this.contactWidget.chatAbierto();
  }

  cerrarChat(): void {
    this.contactWidget.cerrarChat();
  }

  /** Solo se usa para 'cambio-usuario' ahora — el cierre por inactividad se quitó a pedido del negocio. */
  private reiniciarConversacion(motivo: 'cambio-usuario') {
    this.mensajes = [
      {
        rol: 'asistente',
        texto: '¡Hola! Soy **Atlas**, el asistente virtual del ERP. Puedo ayudarte con matrículas, cursos, horarios, prácticas empresariales, encuestas y ambientes. ¿En qué te ayudo?'
      }
    ];

    // Genera nuevo sessionId para que el backend empiece la conversación desde cero
    this.chatService.resetSession();
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

  formatearMensaje(texto: string): SafeHtml {
    // Antes había un reemplazo adicional que insertaba un salto de párrafo
    // después de CUALQUIER punto seguido de mayúscula, sin distinguir fin de
    // oración de una abreviatura — partía nombres reales como "Lab. Salud 1"
    // en dos líneas. Los saltos de párrafo reales ya vienen como '\n' en el
    // texto del backend (ver el '\n' entre elementos de una lista), así que
    // no hace falta adivinarlos a partir de la puntuación.
    //
    // El texto puede venir de un LLM o de un webhook externo (ver CLAUDE.md
    // raíz) — se escapa ANTES de aplicar el markdown propio para que
    // cualquier etiqueta HTML/JS que traiga quede como texto literal en vez
    // de ejecutarse al pasar por bypassSecurityTrustHtml().
    let html = this.escaparHtml(texto)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/(\d+)\.\s(.+)/g, '<li><span class="paso-num">$1</span> $2</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ol>$1</ol>')
      .replace(/\n/g, '<br>');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private escaparHtml(texto: string): string {
    return texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  enviar() {
    if (!this.mensajeUsuario.trim() || this.cargando) return;

    const texto = this.mensajeUsuario;
    this.mensajes.push({ rol: 'usuario', texto });
    this.mensajeUsuario = '';
    this.cargando = true;

    // El textarea creció con el mensaje anterior — limpiar mensajeUsuario no
    // encoge por sí solo la altura inline que le puso ajustarAlturaTextarea().
    const textarea = this.textareaMensaje?.nativeElement;
    if (textarea) textarea.style.height = 'auto';

    this.chatService.sendMessage(texto).subscribe({
      next: (res) => {
        this.mensajes.push({ rol: 'asistente', texto: res.reply || 'Sin respuesta' });
        this.cargando = false;
      },
      error: () => {
        this.mensajes.push({ rol: 'asistente', texto: 'Ocurrió un error, intenta de nuevo.' });
        this.cargando = false;
      }
    });
  }
}








