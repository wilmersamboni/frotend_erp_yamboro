import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({ providedIn: 'root' })
export class AdminToastService {
  private readonly msg = inject(MessageService);

  success(text: string): void {
    this.msg.add({ severity: 'success', summary: 'Éxito', detail: text, life: 4000 });
  }

  error(text: string): void {
    this.msg.add({ severity: 'error', summary: 'Error', detail: text, life: 5000 });
  }

  info(text: string): void {
    this.msg.add({ severity: 'info', summary: 'Info', detail: text, life: 4000 });
  }

  show(text: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
    const severityMap: Record<string, string> = {
      success: 'success', error: 'error', info: 'info', warning: 'warn',
    };
    this.msg.add({ severity: severityMap[type], detail: text, life: 4000 });
  }
}
