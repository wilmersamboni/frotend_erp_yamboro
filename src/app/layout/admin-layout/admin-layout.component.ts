import { Component, signal, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AdminNavbarComponent } from './admin-navbar.component';
import { AdminSidebarComponent } from './admin-sidebar.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterOutlet, AdminNavbarComponent, AdminSidebarComponent],
  template: `
    <div class="flex h-screen">
      @if (mobileMenuOpen()) {
        <div class="fixed inset-0 bg-black/40 z-[60] lg:hidden" (click)="mobileMenuOpen.set(false)"></div>
      }

      <div
        (mouseenter)="sidebarOpen.set(true)"
        (mouseleave)="sidebarOpen.set(false)"
        (click)="onSidebarAreaClick($event)"
        class="h-screen"
      >
        <app-admin-sidebar [open]="sidebarOpen() || mobileMenuOpen()" [mobileOpen]="mobileMenuOpen()" />
      </div>

      <div class="flex flex-col flex-1 min-h-screen overflow-hidden" style="background:#F0F2F5;">
        <app-admin-navbar (menuClick)="mobileMenuOpen.update(v => !v)" [menuOpen]="mobileMenuOpen()" />
        <main class="p-6 flex-1 overflow-y-auto bg-[#EEF2F7]">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class AdminLayoutComponent {
  sidebarOpen = signal(false);
  mobileMenuOpen = signal(false);

  private readonly closeOnBodyScrollLock = effect(() => {
    document.body.style.overflow = this.mobileMenuOpen() ? 'hidden' : '';
  });

  onSidebarAreaClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('a')) {
      this.mobileMenuOpen.set(false);
    }
  }
}
