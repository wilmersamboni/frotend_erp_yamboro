import { Component, inject } from '@angular/core';
import { MaterialesNovedadesComponent } from '../administration/novedades.component';

/** La pantalla se autoriza por servicio y el backend recorta el alcance. */
@Component({
  standalone: true,
  imports: [MaterialesNovedadesComponent],
  template: `<app-materiales-novedades />`,
})
export class NovedadesEntryComponent {}
