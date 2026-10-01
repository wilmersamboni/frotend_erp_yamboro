import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EsperaDirective } from '../../../../shared/directives/espera.directive';

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [EsperaDirective, FormsModule],
  template: `
  <input appEspera
    type="text"
    [ngModel]="value"
    (ngModelChange)="valueChange.emit($event)"
    placeholder="🔍 Buscar..."
    class="border rounded-lg px-3 py-2 text-sm"
  />
  `
})
export class SearchInputComponent {

  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

}
