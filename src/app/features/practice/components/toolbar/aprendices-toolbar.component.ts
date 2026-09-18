import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-aprendices-toolbar',
  standalone:true,
  template:`
  <div class="flex justify-between p-4">

    <input
      class="border px-3 py-2 rounded"
      [value]="filter"
      (input)="filterChange.emit($any($event.target).value)"
      placeholder="Buscar..."
    >

  </div>
  `
})
export class AprendicesToolbarComponent {

  @Input() filter = '';

  @Input() areas:string[] = [];
  @Input() selectedAreas:string[] = [];

  @Input() statusOptions:any[] = [];
  @Input() selectedStatuses:string[] = [];

  @Output() filterChange = new EventEmitter<string>();
  @Output() areasChange = new EventEmitter<string[]>();
  @Output() statusChange = new EventEmitter<string[]>();

}
