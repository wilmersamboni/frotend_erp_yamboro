import { Component, Input, Output, EventEmitter, signal } from '@angular/core';

@Component({
  selector: 'app-estado-filter',
  standalone: true,
  template: `
  <div class="relative">

    <button
      (click)="toggle()"
      class="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm">

      Estado

      @if(selected.length){
        <span class="bg-green-600 text-white text-xs px-2 rounded-full">
          {{selected.length}}
        </span>
      }

    </button>

    @if(show()){

      <div
        class="absolute left-0 top-10 bg-white border rounded-xl shadow p-3 w-[200px]">

        <p class="text-xs text-gray-400 mb-2">Filtrar por estado</p>

        @for(status of options; track status.uid){

          <label class="flex items-center gap-2 py-1">

            <input
              type="checkbox"
              [checked]="selected.includes(status.uid)"
              (change)="toggleStatus(status.uid)"
            />

            {{status.name}}

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
export class EstadoFilterComponent {

  @Input() options:any[] = [];
  @Input() selected:string[] = [];

  @Output() change = new EventEmitter<string[]>();

  show = signal(false);

  toggle(){
    this.show.update(v => !v);
  }

 toggleStatus(uid:string){

  let next = [...this.selected];

  if(next.includes(uid)){
    next = next.filter(s => s !== uid);
  } else {
    next.push(uid);
  }

  this.change.emit(next);

}

  clear(){
    this.change.emit([]);
  }

}
