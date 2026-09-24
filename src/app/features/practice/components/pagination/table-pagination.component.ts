import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-table-pagination',
  standalone:true,
  template:`

  <div class="flex gap-2 p-4 justify-center">

    <button (click)="prev()">‹</button>

    @for(p of pagesArray(); track p){
      <button (click)="change(p)">
        {{p}}
      </button>
    }

    <button (click)="next()">›</button>

  </div>

  `
})
export class TablePaginationComponent {

  @Input() page = 1;
  @Input() pages = 1;

  @Output() pageChange = new EventEmitter<number>();

  pagesArray(){
    return Array.from({length:this.pages},(_,i)=>i+1);
  }

  change(p:number){
    this.pageChange.emit(p);
  }

  prev(){
    if(this.page > 1){
      this.pageChange.emit(this.page - 1);
    }
  }

  next(){
    if(this.page < this.pages){
      this.pageChange.emit(this.page + 1);
    }
  }

}
