import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, signal } from '@angular/core';
import { AprendicesRowComponent } from './aprendices-row.component';

@Component({
  selector: 'app-aprendices-table',
  standalone: true,
  imports: [AprendicesRowComponent],
  template: `
  <div class="overflow-x-auto">
    <table class="w-full text-sm">

      <thead>
        <tr>
          @for(col of columns; track col.key){
            <th>{{col.name}}</th>
          }
        </tr>
      </thead>

      <tbody>
        @for(row of rows; track row.id){
          <app-aprendices-row
            [row]="row"
            (seguimientos)="seguimientos.emit($event)"
            (observacion)="observacion.emit($event)"
            (crearPractica)="crearPractica.emit($event)"
          />
        }
      </tbody>

    </table>
  </div>
  `
})
export class AprendicesTableComponent {

  @Input() rows:any[] = [];
  @Input() columns:any[] = [];

  @Output() seguimientos = new EventEmitter();
  @Output() observacion = new EventEmitter();
  @Output() crearPractica = new EventEmitter();

}
