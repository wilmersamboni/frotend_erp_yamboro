import { Component, inject } from '@angular/core';
import { MaterialesDevolucionesComponent } from '../administration/devoluciones.component';

/** Entrada canónica de Devoluciones durante la extracción gradual del flujo. */
@Component({
  standalone: true,
  imports: [MaterialesDevolucionesComponent],
  template: `<app-materiales-devoluciones />`,
})
export class DevolucionesEntryComponent {}
