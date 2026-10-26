/**
 * Cliente HTTP de geoAlerts: centraliza las llamadas a la API REST y
 * traduce los códigos de estado HTTP a errores legibles para la interfaz.
 */
const BASE = import.meta.env.VITE_API_URL || '/api';

export class ErrorApi extends Error {
  /** @param {string} mensaje @param {number} estado */
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

async function solicitud(ruta, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${ruta}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ErrorApi('No hay conexión con el servidor', 0);
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = datos.detalles ? `: ${datos.detalles.join('; ')}` : '';
    throw new ErrorApi((datos.error || `Error ${res.status}`) + detalle, res.status);
  }
  return datos;
}

export const api = {
  listarAlertas: (filtros = {}) => {
    const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
    return solicitud(`/alertas${qs ? `?${qs}` : ''}`);
  },
  listarOrigenes: () => solicitud('/origenes'),
  login: (username, password) => solicitud('/login', { method: 'POST', body: { username, password } }),
  crearAlerta: (alerta, token) => solicitud('/alertas', { method: 'POST', body: alerta, token }),
  cambiarEstado: (id, estado, token) =>
    solicitud(`/alertas/${id}/estado`, { method: 'PATCH', body: { estado }, token }),
  /** Abre la suscripción a eventos en tiempo real (Server-Sent Events). */
  suscribirEventos: () => new EventSource(`${BASE}/eventos`),
};
