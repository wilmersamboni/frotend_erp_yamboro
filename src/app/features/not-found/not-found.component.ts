import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './not-found.component.html',
  styleUrls: ['./not-found.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class NotFoundComponent implements OnInit, OnDestroy {
  clockInterval: any;

  ngOnInit() {
    // Lógica del Cursor
    const cursor = document.getElementById('cursor');
    const moveCursor = (e: MouseEvent) => {
      if (cursor) {
        cursor.style.left = e.clientX + 'px';
        cursor.style.top = e.clientY + 'px';
      }
    };

    document.addEventListener('mousemove', moveCursor);

    // Lógica del Reloj
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
  }

  updateClock() {
    const clock = document.getElementById('clock');
    if (clock) {
      const now = new Date();
      clock.textContent = now.toTimeString().slice(0, 8);
    }
  }

  ngOnDestroy() {
    if (this.clockInterval) clearInterval(this.clockInterval);
  }
}
