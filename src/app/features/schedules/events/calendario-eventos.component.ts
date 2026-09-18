import { Component, EventEmitter, Output, computed, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

/**
 * <app-calendario-eventos> — grid visual del calendario, extraído de
 * programador-eventos.component.ts. Recibe los eventos ya filtrados por el
 * padre y maneja su propio mes/año visible.
 */
@Component({
  selector: 'app-calendario-eventos',
  imports: [LucideAngularModule],
  template: `
    <div class="calendar-section mt-4">
      <div class="calendar-header">
        <button class="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" (click)="prevMes()">
          <lucide-icon name="chevron-left" [size]="18"></lucide-icon>
        </button>
        <h3 class="calendar-title">{{ mesActualLabel() }}</h3>
        <button class="w-8 h-8 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" (click)="nextMes()">
          <lucide-icon name="chevron-right" [size]="18"></lucide-icon>
        </button>
        <button class="border border-gray-300 hover:bg-gray-50 hover:border-[#39A900]/50 hover:text-[#39A900] text-gray-700 rounded-lg px-3 py-1.5 text-sm transition-all ml-auto" (click)="irHoy()">Hoy</button>
      </div>
      <div class="calendar-grid">
        @for (dia of diasSemana; track dia; let i = $index) {
          <div class="cal-day-header" [class.weekend]="i === 0 || i === 6">{{ dia }}</div>
        }
        @for (cell of calendarCells(); track cell.date) {
          <div class="cal-cell" [class.other-month]="!cell.isCurrentMonth" [class.today]="cell.isToday"
               [class.weekend]="cell.date.getDay() === 0 || cell.date.getDay() === 6"
               [class.past]="cell.isPast" [title]="cell.isPast ? 'No se pueden crear eventos en fechas pasadas' : ''"
               (click)="onDiaClick(cell)">
            <span class="cal-day-num">{{ cell.day }}</span>
            @for (ev of cell.events; track ev.id) {
              <div [class]="'cal-event ev-tipo-' + ev.tipo"
                   (click)="$event.stopPropagation(); eventoClick.emit(ev)">
                {{ ev.nombre }}
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .calendar-section {
      background: var(--surface); border-radius: 12px;
      border: 1px solid var(--border); overflow: hidden;
    }
    .calendar-header {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 20px; border-bottom: 1px solid var(--border);
    }
    .calendar-title { font-size: 1.1rem; font-weight: 700; color: var(--text); flex: 1; text-align: center; }
    .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
    .cal-day-header {
      text-align: center; padding: 10px 4px; font-size: 12px;
      font-weight: 700; color: var(--text-muted);
      background: var(--surface2); border-bottom: 1px solid var(--border);
    }
    .cal-day-header.weekend { color: #dc2626; }
    .cal-cell.weekend .cal-day-num { color: #dc2626; }
    .cal-cell.weekend.today .cal-day-num { color: #fff; }
    .cal-cell {
      min-height: 90px; padding: 6px; border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border); cursor: pointer;
      transition: background .15s; position: relative;
    }
    .cal-cell:hover { background: rgba(57,169,0,.06); }
    .cal-cell.other-month { opacity: .4; }
    .cal-cell.today { background: rgba(57,169,0,.08); }
    /* Días pasados: siguen mostrando sus eventos, pero no se puede crear uno
       nuevo desde acá (ver onDiaClick) — el cursor y la opacidad lo comunican
       antes de hacer clic, en vez de dejar llenar todo el formulario para
       recién ahí rechazarlo. */
    .cal-cell.past { cursor: default; opacity: .55; }
    .cal-cell.past:hover { background: transparent; }
    .cal-cell.past .cal-event { cursor: pointer; }
    .cal-cell.today .cal-day-num {
      background: var(--tui-primary); color: #fff; border-radius: 50%;
      width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
    }
    .cal-day-num { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 4px; }
    .cal-event {
      font-size: 10px; font-weight: 600; padding: 2px 5px;
      border-radius: 4px; margin-bottom: 2px; cursor: pointer;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      transition: opacity .15s;
    }
    .cal-event:hover { opacity: .8; }

    /* ── Event type colors — duplicado con el padre y con evento-modal (chips), cada
       componente tiene su propio encapsulamiento de estilos ── */
    .ev-tipo-formativo     { background: #dbeafe; color: #1d4ed8; }
    .ev-tipo-institucional { background: #dcfce7; color: #166534; }
    .ev-tipo-evaluacion    { background: #fed7aa; color: #92400e; }
    .ev-tipo-festivo       { background: #fee2e2; color: #991b1b; }

    .ml-auto { margin-left: auto; }

  `],
})
export class CalendarioEventosComponent {
  eventos = input<any[]>([]);

  @Output() diaClick = new EventEmitter<string>();
  @Output() eventoClick = new EventEmitter<any>();

  // Signals (no propiedades planas): calendarCells es un computed() y solo
  // se vuelve a evaluar cuando cambia una señal que lee — con propiedades
  // planas, prevMes()/nextMes() nunca disparaban un recálculo del grid.
  viewYear  = signal(new Date().getFullYear());
  viewMonth = signal(new Date().getMonth());

  diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  calendarCells = computed(() => {
    const year = this.viewYear();
    const month = this.viewMonth();
    const eventos = this.eventos();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const cells: any[] = [];

    // Usar fecha LOCAL (no toISOString que convierte a UTC y puede desfasar el día)
    const dayStrOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStr = dayStrOf(today);

    const prevDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevDays - i);
      const dayStr = dayStrOf(d);
      cells.push({ date: d, day: d.getDate(), isCurrentMonth: false, isToday: false, isPast: dayStr < todayStr, dayStr, events: [] });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const isToday = date.toDateString() === today.toDateString();
      const dayStr = dayStrOf(date);
      const dayEvents = eventos.filter(ev => {
        const start = ev.fechaInicio?.split('T')[0] ?? '';
        const end   = (ev.fechaFin ?? ev.fechaInicio)?.split('T')[0] ?? start;
        return dayStr >= start && dayStr <= end;
      });
      cells.push({ date, day: d, isCurrentMonth: true, isToday, isPast: dayStr < todayStr, dayStr, events: dayEvents });
    }
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d);
      const dayStr = dayStrOf(date);
      cells.push({ date, day: d, isCurrentMonth: false, isToday: false, isPast: dayStr < todayStr, dayStr, events: [] });
    }
    return cells;
  });

  mesActualLabel = computed(() => {
    const nombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${nombres[this.viewMonth()]} ${this.viewYear()}`;
  });

  prevMes() {
    if (this.viewMonth() === 0) { this.viewMonth.set(11); this.viewYear.update(y => y - 1); }
    else this.viewMonth.update(m => m - 1);
  }
  nextMes() {
    if (this.viewMonth() === 11) { this.viewMonth.set(0); this.viewYear.update(y => y + 1); }
    else this.viewMonth.update(m => m + 1);
  }
  irHoy() { this.viewYear.set(new Date().getFullYear()); this.viewMonth.set(new Date().getMonth()); }

  /** Usado por el padre cuando el filtro de mes cambia, para saltar el calendario a ese mes. */
  irAMes(month: number) { this.viewMonth.set(month); }

  onDiaClick(cell: { date: Date; isPast: boolean; dayStr?: string }) {
    if (cell.isPast) return; // no se pueden crear eventos en fechas pasadas — ver EventosService.create()
    const d = cell.date;
    // Fecha LOCAL, no toISOString() (convierte a UTC y puede desfasar el día).
    const dayStr = cell.dayStr ?? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.diaClick.emit(dayStr);
  }
}
