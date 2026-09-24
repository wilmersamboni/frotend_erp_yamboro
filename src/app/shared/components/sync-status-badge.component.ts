import { Component, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { SyncQueueService } from '../../core/offline/sync-queue.service';
import { NetworkStatusService } from '../../core/offline/network-status.service';
import { ReconciliationDialogComponent } from '../../core/offline/reconciliation-dialog.component';

/**
 * Badge flotante global (montado una vez en `app.ts`, igual que el chat) —
 * invisible por defecto (0 pendientes y 0 conflictos, el caso normal de
 * cualquier usuario que no esté escaneando offline) y aparece solo cuando
 * hay algo de la cola de sync que mostrar. Al tocarlo abre
 * `ReconciliationDialogComponent` con el detalle.
 */
@Component({
  selector: 'app-sync-status-badge',
  standalone: true,
  imports: [LucideAngularModule, ReconciliationDialogComponent],
  template: `
    @if (syncQueue.pendientes() > 0 || syncQueue.conflictos() > 0) {
      <button type="button" (click)="dialogoAbierto.set(true)"
        class="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-semibold transition-colors"
        [class.bg-amber-500]="syncQueue.conflictos() > 0"
        [class.bg-gray-700]="syncQueue.conflictos() === 0"
        [class.text-white]="true">
        <lucide-icon [name]="red.alcanzable() ? 'refresh-cw' : 'cloud-off'" [size]="16"></lucide-icon>
        @if (syncQueue.conflictos() > 0) {
          {{ syncQueue.conflictos() }} con conflicto
        } @else {
          {{ syncQueue.pendientes() }} pendiente{{ syncQueue.pendientes() === 1 ? '' : 's' }}
        }
      </button>
    }

    <app-reconciliation-dialog [abierto]="dialogoAbierto()" (cerrado)="dialogoAbierto.set(false)"></app-reconciliation-dialog>
  `,
})
export class SyncStatusBadgeComponent {
  readonly syncQueue = inject(SyncQueueService);
  readonly red = inject(NetworkStatusService);

  dialogoAbierto = signal(false);
}
