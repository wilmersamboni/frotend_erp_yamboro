import { Injectable } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { ListaMateriales, puedeListarMateriales } from '../materiales-acceso';

/**
 * Fuente única de capacidades de las pantallas que antes se copiaban por rol.
 * No sustituye la autorización del backend: solo evita que cada template tome
 * decisiones distintas sobre qué acción puede ofrecer al usuario.
 */
@Injectable({ providedIn: 'root' })
export class MaterialesScreenPolicy {
  constructor(private readonly auth: AuthService) {}

  /** ¿El backend le dejaría leer esa lista? Si no, la pantalla ni la pide (ver `LECTURA_LISTA`). */
  puedeListar(lista: ListaMateriales): boolean {
    return puedeListarMateriales(lista, (nombre) => this.auth.tieneServicio(nombre));
  }

  puedeCrearSolicitud(): boolean {
    return this.auth.tieneServicio('materiales.solicitudes.crear');
  }

  puedeAprobarSolicitud(): boolean {
    return this.auth.tieneServicio('materiales.solicitudes.aprobar');
  }

  puedeRechazarSolicitud(): boolean {
    return this.auth.tieneServicio('materiales.solicitudes.rechazar');
  }

  puedeEntregarSolicitud(): boolean {
    return this.auth.tieneServicio('materiales.solicitudes.entregar');
  }

  puedeConfirmarSolicitud(): boolean {
    return this.auth.tieneServicio('materiales.solicitudes.confirmar');
  }

  puedeRegistrarDevolucion(): boolean {
    return this.auth.tieneServicio('materiales.devoluciones.crear');
  }
}
