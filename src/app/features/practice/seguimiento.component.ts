import { Component } from '@angular/core';
import { TableInfoComponent } from './components/./table-info/table-info.component';

/**
 * Equivalente a AboutPage.tsx de React.
 * Renderiza directamente TableInfo (Table.tsx), sin cards de áreas.
 */
@Component({
  selector: 'app-seguimiento',
  standalone: true,
  imports: [TableInfoComponent],
  template: `<app-table-info />`,
})
export class SeguimientoComponent {}
