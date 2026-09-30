import { Component, inject } from '@angular/core';
import { MaterialesTrasladosComponent } from '../administration/traslados.component';

/** Pantalla única; permisos y alcance se calculan por servicio/sitio. */
@Component({
  standalone: true,
  imports: [MaterialesTrasladosComponent],
  template: `<app-materiales-traslados />`,
})
export class TrasladosEntryComponent {}
