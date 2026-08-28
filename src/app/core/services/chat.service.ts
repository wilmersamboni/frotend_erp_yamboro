import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ChatService {

  // Asistente virtual servido por backend-practica-hexagonal (módulo IA,
  // modelo local vía Ollama) — antes era un webhook externo de n8n.
  // x-tenant y la cookie de sesión los agrega authInterceptor, igual que en
  // cualquier otra llamada a apiPracticaUrl.
  private chatUrl = `${environment.apiPracticaUrl}/ia/chat`;
  private sessionId: string = crypto.randomUUID();

  constructor(private http: HttpClient) {}

  // Genera nuevo sessionId → el backend empieza la conversación desde cero (sin el historial en caché de la sesión anterior)
  resetSession() {
    this.sessionId = crypto.randomUUID();
  }

  /** Adopta el sessionId de una conversación ya existente — para retomarla en vez de empezar una nueva al enviar el próximo mensaje. */
  adoptarSession(sessionId: string) {
    this.sessionId = sessionId;
  }

  sendMessage(userMessage: string): Observable<any> {
    return this.http.post<any>(this.chatUrl, {
      sessionId: this.sessionId,
      mensaje: userMessage
    });
  }

  /** Última conversación guardada del usuario actual, o null si nunca ha chateado. Ver ChatAsistenteController.obtenerHistorial(). */
  obtenerHistorialReciente(): Observable<{ sessionId: string; mensajes: { rol: string; contenido: string }[] } | null> {
    return this.http.get<{ sessionId: string; mensajes: { rol: string; contenido: string }[] } | null>(`${this.chatUrl}/historial`);
  }
}