import { Component, OnInit, signal, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

interface Message { role: 'user' | 'assistant'; content: string; }

/**
 * Equivalente a BlogPage.tsx de React.
 * Chat con IA — mantiene historial de mensajes y hace scroll automático.
 *
 * React:                       Angular:
 * useState([])       →  signal([])
 * useRef()           →  @ViewChild + ElementRef
 * useEffect(scroll)  →  ngAfterViewChecked
 */
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="flex flex-col items-center gap-4 py-8 w-full">
      <h1 class="text-4xl font-bold text-gray-800">MiChats</h1>

      <div class="w-full max-w-4xl bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col h-[60vh] min-h-[300px]">

        <!-- Mensajes -->
        <div class="flex-1 overflow-y-auto p-4 space-y-3" #messagesContainer>

          @for (msg of messages(); track $index) {
            <div class="flex gap-2 items-start"
              [class.justify-end]="msg.role === 'user'"
              [class.justify-start]="msg.role === 'assistant'">

              <!-- Avatar asistente -->
              @if (msg.role === 'assistant') {
                <div class="w-8 h-8 rounded-full bg-[#39A900] flex items-center justify-center flex-shrink-0 mt-1">
                  <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14
                         a2 2 0 012 2v10a2 2 0 01-2 2h-2"/>
                  </svg>
                </div>
              }

              <div class="max-w-[75%] rounded-xl px-4 py-2.5 text-sm"
                [class.bg-[#39A900]]="msg.role === 'user'"
                [class.text-white]="msg.role === 'user'"
                [class.bg-gray-100]="msg.role === 'assistant'"
                [class.text-gray-800]="msg.role === 'assistant'">
                <p class="whitespace-pre-wrap">{{ msg.content }}</p>
              </div>

              <!-- Avatar usuario -->
              @if (msg.role === 'user') {
                <div class="w-8 h-8 rounded-full bg-[#39A900] flex items-center justify-center flex-shrink-0 mt-1">
                  <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>
                </div>
              }
            </div>
          }

          <!-- Indicador cargando -->
          @if (isLoading()) {
            <div class="flex gap-2 items-start justify-start">
              <div class="w-8 h-8 rounded-full bg-[#39A900] flex items-center justify-center flex-shrink-0 mt-1">
                <svg class="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
              <div class="bg-gray-100 rounded-xl px-4 py-2.5">
                <div class="flex gap-1">
                  <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:0ms"></span>
                  <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:150ms"></span>
                  <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay:300ms"></span>
                </div>
              </div>
            </div>
          }

          <div #anchor></div>
        </div>

        <!-- Input -->
        <div class="p-3 border-t border-gray-100">
          <div class="flex gap-2">
            <input
              type="text"
              [(ngModel)]="input"
              (keyup.enter)="handleSubmit()"
              [disabled]="isLoading()"
              placeholder="Escribe tu mensaje..."
              class="flex-1 bg-gray-50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#39A900]/30 disabled:opacity-50 border border-gray-100"
            />
            <button
              (click)="handleSubmit()"
              [disabled]="isLoading() || !input.trim()"
              class="bg-[#39A900] text-white rounded-xl px-4 py-2.5 disabled:opacity-50
                     hover:bg-[#2d8400] transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class ChatComponent implements AfterViewChecked {
  @ViewChild('anchor') anchor!: ElementRef;

  messages  = signal<Message[]>([
    { role: 'assistant', content: '¡Hola! Soy tu asistente. ¿En qué puedo ayudarte hoy?' },
  ]);
  isLoading = signal(false);
  input     = '';

  constructor(private http: HttpClient) {}

  ngAfterViewChecked(): void {
    this.anchor?.nativeElement.scrollIntoView({ behavior: 'smooth' });
  }

async handleSubmit(): Promise<void> {
  if (!this.input.trim() || this.isLoading()) return;

  const userMsg: Message = { role: 'user', content: this.input.trim() };
  this.messages.update(m => [...m, userMsg]);
  this.input = '';
  this.isLoading.set(true);

  try {
    const resp: any = await firstValueFrom(
      this.http.post('https://danin8n.duckdns.org/webhook/bot_virtual', {
        message: userMsg.content
      })
    );

    const reply = resp?.reply ?? 'Lo siento, no obtuve respuesta.';
    this.messages.update(m => [...m, { role: 'assistant', content: reply }]);

  } catch {
    this.messages.update(m => [
      ...m,
      { role: 'assistant', content: 'Lo siento, no fue posible conectar con el asistente.' },
    ]);
  } finally {
    this.isLoading.set(false);
  }
}
}
