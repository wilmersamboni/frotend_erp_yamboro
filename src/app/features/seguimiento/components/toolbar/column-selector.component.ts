import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-column-selector',
  standalone: true,
  template: `

  <div class="relative">

    <button class="border px-3 py-2 rounded">
      Columnas
    </button>

    <div class="absolute bg-white border rounded shadow p-3 mt-2">

      @for(col of columns; track col.key){

        <label class="flex items-center gap-2">

          <input
            type="checkbox"
            [checked]="col.visible"
            (change)="toggleColumn(col.key)"
          >

          {{col.name}}

        </label>

      }

    </div>

  </div>

  `
})
export class ColumnSelectorComponent {

  @Input() columns:any[] = [];

  @Output() columnsChange = new EventEmitter<any[]>();

  toggleColumn(key:string){

    const updated = this.columns.map(col => {

      if(col.key === key){
        return {
          ...col,
          visible: !col.visible
        };
      }

      return col;

    });

    this.columnsChange.emit(updated);

  }

}
