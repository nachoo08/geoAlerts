// @ts-check
/**
 * geoAlerts — Bus de eventos de dominio
 * -------------------------------------
 * Núcleo de la Programación Orientada a Eventos del backend. Los controladores
 * NO conocen a quién le interesa un cambio: solo EMITEN el evento. Los
 * suscriptores (el canal SSE hacia los navegadores, la auditoría en consola y,
 * en el futuro, notificaciones por correo o push) reaccionan de forma desacoplada.
 *
 *   POST /api/alertas ──emit('alerta:creada')──▶ bus ──▶ SSE  → navegadores
 *                                                    └──▶ auditoría (log)
 */
import { EventEmitter } from 'node:events';
import { EVENTOS } from '@geoalerts/compartido';

export const bus = new EventEmitter();
// Cada navegador conectado por SSE agrega un suscriptor: sin límite artificial.
bus.setMaxListeners(0);

/** Suscriptor de auditoría: deja constancia de cada cambio en el log del servidor. */
if (process.env.NODE_ENV !== 'test') {
  bus.on(EVENTOS.ALERTA_CREADA, (/** @type {{id:number,titulo:string}} */ a) =>
    console.log(`[evento] ${EVENTOS.ALERTA_CREADA} #${a.id} "${a.titulo}"`));
  bus.on(EVENTOS.ALERTA_ACTUALIZADA, (/** @type {{id:number,estado:string}} */ a) =>
    console.log(`[evento] ${EVENTOS.ALERTA_ACTUALIZADA} #${a.id} → ${a.estado}`));
}
