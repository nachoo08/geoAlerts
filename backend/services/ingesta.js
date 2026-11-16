import cron from 'node-cron';
import { bus } from '../eventos.js';
import { EVENTOS } from '@geoalerts/compartido';

const LATITUD = -34.6037;
const LONGITUD = -58.3816;
/** @typedef {{temperature_2m:number, weather_code:number, wind_speed_10m:number, time?:string,
 *             ubicacion:string, consultado_en:string}} CondicionesActuales */
/** @type {CondicionesActuales|null} */
let condicionesActuales = null;

export async function sincronizarOpenMeteo() {
  try {
    console.log('Consultando Open-Meteo...');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LATITUD}&longitude=${LONGITUD}&current=temperature_2m,weather_code,wind_speed_10m&timezone=America%2FArgentina%2FBuenos_Aires`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo respondió HTTP ${res.status}`);
    }
    const data = await res.json();

    const current = data.current;
    if (!current || typeof current.temperature_2m !== 'number'
      || typeof current.weather_code !== 'number' || typeof current.wind_speed_10m !== 'number') {
      throw new Error('La respuesta de Open-Meteo no contiene condiciones actuales válidas');
    }

    condicionesActuales = {
      ...current,
      ubicacion: 'Ciudad de Buenos Aires',
      consultado_en: new Date().toISOString(),
    };
    bus.emit(EVENTOS.CONDICIONES_ACTUALIZADAS, condicionesActuales);
    console.log('Condiciones actuales de Open-Meteo actualizadas.');

    return { success: true, datos: condicionesActuales };
  } catch (error) {
    console.error("Error en ingesta automática:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** @returns {CondicionesActuales|null} */
export function obtenerCondicionesActuales() {
  return condicionesActuales;
}

export function iniciarIngestaAutomatica() {
  return cron.schedule('*/15 * * * *', () => {
    void sincronizarOpenMeteo();
  });
}