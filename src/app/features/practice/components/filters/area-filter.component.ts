import { Component, Input, Output, EventEmitter, signal } from '@angular/core';

@Component({
  selector: 'app-area-filter',
  standalone: true,
  template: `
  <div class="relative">

    <button
      (click)="toggle()"
      class="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm">

      Área

      @if(selected.length){
        <span class="bg-green-600 text-white text-xs px-2 rounded-full">
          {{selected.length}}
        </span>
      }

    </button>

    @if(show()){

      <div
        class="absolute left-0 top-10 bg-white border rounded-xl shadow p-3 w-[200px]">

        <p class="text-xs text-gray-400 mb-2">Filtrar por área</p>

        @for(area of areas; track area){

          <label class="flex items-center gap-2 py-1">

            <input
              type="checkbox"
              [checked]="selected.includes(area)"
              (change)="toggleArea(area)"
            />

            {{area}}

          </label>

        }

        <button
          (click)="clear()"
          class="text-xs text-red-500 mt-2">
          Limpiar
        </button>

      </div>

    }

  </div>
  `
})
export class AreaFilterComponent {

  @Input() areas: string[] = [];
  @Input() selected: string[] = [];

  @Output() change = new EventEmitter<string[]>();

  show = signal(false);

  toggle(){
    this.show.update(v => !v);
  }

  toggleArea(area:string){

    let next = [...this.selected];

    if(next.includes(area)){
      next = next.filter(a => a !== area);
    } else {
      next.push(area);
    }

    this.change.emit(next);

  }

  clear(){
    this.change.emit([]);
  }

}
