import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, signal } from '@angular/core';

@Component({
  selector: 'app-aprendices-row',
  standalone: true,
  template: `
  <tr>

    <td>{{row.name}}</td>
    <td>{{row.cedula}}</td>
    <td>{{row.correo}}</td>
    <td>
      <span [class]="row.status === 'activo'
        ? 'inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700'
        : 'inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600'">
        {{row.status}}
      </span>
    </td>

    <td>
      <button (click)="seguimientos.emit(row)"   title="Ver seguimientos">📄</button>
      <button (click)="observacion.emit(row)"    title="Observación">✏️</button>
      <button (click)="crearPractica.emit(row)"  title="Crear práctica">➕</button>
    </td>

  </tr>
  `
})
export class AprendicesRowComponent {

  @Input() row:any;

  @Output() seguimientos = new EventEmitter();
  @Output() observacion = new EventEmitter();
  @Output() crearPractica = new EventEmitter();

}
