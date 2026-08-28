/**
 * Barrel de servicios — importa desde aquí en lugar de rutas individuales.
 *
 * Uso:
 *   import { AreaService, CursoService } from '@services';
 *   // o bien con ruta relativa:
 *   import { AreaService } from '../services';
 */

export { AreaService }        from './area.service';
export { CursoService }       from './curso.service';
export { FormatoService }     from './formato.service';
export { PersonaService }     from './persona.service';
export { MatriculaService }   from './matricula.service';
export { PracticaService }    from './practica.service';
export { SeguimientoService } from './seguimiento.service';
export { NotificacionService } from './notificacion.service';
