// @ts-check
/**
 * geoAlerts — Capa de Lógica de Negocio (API REST + eventos)
 * ==========================================================
 * Modelo orientado a eventos:
 *   1. Cada petición HTTP es un EVENTO que Express despacha a una cadena de
 *      manejadores (middleware → validación → repositorio).
 *   2. Toda modificación exitosa EMITE un evento de dominio en el bus
 *      (alerta:creada / alerta:actualizada).
 *   3. Los navegadores SUSCRIPTOS a GET /api/eventos (Server-Sent Events)
 *      reciben ese evento al instante, sin recargar ni consultar en bucle.
 *
 * Endpoints y códigos HTTP
 *   GET   /api/salud                 200
 *   POST  /api/login                 200 · 400 · 401
 *   GET   /api/alertas               200 · 400 (filtro inválido)
 *   GET   /api/alertas/:id           200 · 400 (id inválido) · 404
 *   GET   /api/origenes              200
 *   GET   /api/eventos  (SSE)        200 (flujo text/event-stream)
 *   POST  /api/alertas               201 · 400 · 401 · 403 · 500
 *   PATCH /api/alertas/:id/estado    200 · 400 · 401 · 403 · 404
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import cors from 'cors';
import {
  TIPOS_ALERTA, NIVELES_GRAVEDAD, ESTADOS_ALERTA, EVENTOS,
  esValorDe, aNumero, validarAlerta, puedeGestionar,
} from '@geoalerts/compartido';
import * as repo from './db.js';
import { bus } from './eventos.js';
import { requiereAuth, verificarCredenciales, firmarToken } from './auth.js';

/** @typedef {import('@geoalerts/compartido').UsuarioSesion} UsuarioSesion */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const DIST_FRONTEND = path.join(__dirname, '..', 'frontend', 'dist');
const LATIDO_SSE_MS = 25_000;

/**
 * Convierte un parámetro de ruta en id entero positivo (o null si es inválido).
 * @param {string} valor
 */
function parsearId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Crea y configura la aplicación Express (exportada para las pruebas). */
export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
  app.use(express.json({ limit: '20kb' }));

  // -------------------------------------------------------------------
  // Salud (usado por el orquestador cloud para saber si la instancia vive)
  // -------------------------------------------------------------------
  app.get('/api/salud', (_req, res) => {
    res.status(200).json({ estado: 'ok', version: '1.0.0' });
  });

  // -------------------------------------------------------------------
  // Autenticación
  // -------------------------------------------------------------------
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
      return;
    }
    const usuario = verificarCredenciales(username, password);
    if (!usuario) {
      // Mismo mensaje para usuario inexistente y contraseña errónea
      res.status(401).json({ error: 'Credenciales incorrectas' });
      return;
    }
    res.status(200).json({ token: firmarToken(usuario), usuario });
  });

  // -------------------------------------------------------------------
  // Lectura pública
  // -------------------------------------------------------------------
  app.get('/api/alertas', (req, res) => {
    const { tipo, gravedad, estado } = req.query;
    const errores = [];
    if (tipo !== undefined && !esValorDe(TIPOS_ALERTA, tipo)) errores.push('Filtro "tipo" inválido');
    if (gravedad !== undefined && !esValorDe(NIVELES_GRAVEDAD, gravedad)) errores.push('Filtro "gravedad" inválido');
    if (estado !== undefined && !esValorDe(ESTADOS_ALERTA, estado)) errores.push('Filtro "estado" inválido');
    if (errores.length) {
      res.status(400).json({ error: 'Parámetros de consulta inválidos', detalles: errores });
      return;
    }
    res.status(200).json(repo.listarAlertas({
      tipo: /** @type {string|undefined} */ (tipo),
      gravedad: /** @type {string|undefined} */ (gravedad),
      estado: /** @type {string|undefined} */ (estado),
    }));
  });

  app.get('/api/alertas/:id', (req, res) => {
    const id = parsearId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: 'El id debe ser un entero positivo' });
      return;
    }
    const alerta = repo.obtenerAlerta(id);
    if (!alerta) {
      res.status(404).json({ error: 'Alerta no encontrada' });
      return;
    }
    res.status(200).json(alerta);
  });

  app.get('/api/origenes', (_req, res) => {
    res.status(200).json(repo.listarOrigenes());
  });

  // -------------------------------------------------------------------
  // Canal de eventos en tiempo real (Server-Sent Events)
  // -------------------------------------------------------------------
  app.get('/api/eventos', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // evita que un proxy Nginx retenga el flujo
    });
    res.write('retry: 5000\n\n'); // el navegador reintenta a los 5 s si se corta

    /** @param {string} nombre */
    const reenviar = (nombre) => (/** @type {unknown} */ datos) => {
      res.write(`event: ${nombre}\ndata: ${JSON.stringify(datos)}\n\n`);
    };
    const alCrear = reenviar(EVENTOS.ALERTA_CREADA);
    const alActualizar = reenviar(EVENTOS.ALERTA_ACTUALIZADA);
    bus.on(EVENTOS.ALERTA_CREADA, alCrear);
    bus.on(EVENTOS.ALERTA_ACTUALIZADA, alActualizar);

    // Comentario SSE periódico: mantiene viva la conexión a través de proxies
    const latido = setInterval(() => res.write(': latido\n\n'), LATIDO_SSE_MS);

    // Evento "close": el navegador se fue → se cancela la suscripción (sin fugas)
    req.on('close', () => {
      clearInterval(latido);
      bus.off(EVENTOS.ALERTA_CREADA, alCrear);
      bus.off(EVENTOS.ALERTA_ACTUALIZADA, alActualizar);
    });
  });

  // -------------------------------------------------------------------
  // Escritura (requiere token). Aislamiento por organismo.
  // -------------------------------------------------------------------
  app.post('/api/alertas', requiereAuth, (req, res) => {
    /** @type {UsuarioSesion} */
    const usuario = res.locals.usuario;
    const cuerpo = req.body || {};

    const errores = validarAlerta(cuerpo);
    if (errores.length) {
      res.status(400).json({ error: 'Datos inválidos', detalles: errores });
      return;
    }

    // Resolución del organismo de origen
    let idOrigen;
    if (usuario.rol === 'SUPERADMIN') {
      if (cuerpo.id_origen === undefined || cuerpo.id_origen === null || cuerpo.id_origen === '') {
        idOrigen = repo.origenManualPorDefecto()?.id;
      } else {
        const origen = repo.obtenerOrigen(aNumero(cuerpo.id_origen));
        if (!origen || origen.tipo_fuente !== 'CARGA_MANUAL') {
          res.status(400).json({ error: 'Datos inválidos', detalles: ['El origen debe ser un organismo de carga manual existente'] });
          return;
        }
        idOrigen = origen.id;
      }
    } else {
      // Un ADMINISTRADOR siempre publica a nombre de SU organismo
      if (cuerpo.id_origen !== undefined && aNumero(cuerpo.id_origen) !== usuario.id_origen) {
        res.status(403).json({ error: 'No puede publicar alertas a nombre de otro organismo' });
        return;
      }
      idOrigen = usuario.id_origen;
    }
    if (idOrigen === undefined || idOrigen === null) {
      res.status(500).json({ error: 'No hay un organismo de carga manual configurado' });
      return;
    }

    try {
      const alerta = repo.crearAlerta({
        titulo: String(cuerpo.titulo).trim(),
        tipo: cuerpo.tipo,
        nivel_gravedad: cuerpo.nivel_gravedad,
        descripcion: typeof cuerpo.descripcion === 'string' && cuerpo.descripcion.trim() ? cuerpo.descripcion.trim() : null,
        latitud: aNumero(cuerpo.latitud),
        longitud: aNumero(cuerpo.longitud),
        id_origen: idOrigen,
      });
      res.status(201).location(`/api/alertas/${alerta.id}`).json(alerta);
      bus.emit(EVENTOS.ALERTA_CREADA, alerta); // ← evento de dominio
    } catch (err) {
      console.error('[POST /api/alertas]', err);
      res.status(500).json({ error: 'No se pudo guardar la alerta' });
    }
  });

  app.patch('/api/alertas/:id/estado', requiereAuth, (req, res) => {
    /** @type {UsuarioSesion} */
    const usuario = res.locals.usuario;
    const id = parsearId(req.params.id);
    const { estado } = req.body || {};
    if (id === null) {
      res.status(400).json({ error: 'El id debe ser un entero positivo' });
      return;
    }
    if (!esValorDe(ESTADOS_ALERTA, estado)) {
      res.status(400).json({ error: `Estado inválido (${ESTADOS_ALERTA.join(', ')})` });
      return;
    }
    const actual = repo.obtenerAlerta(id);
    if (!actual) {
      res.status(404).json({ error: 'Alerta no encontrada' });
      return;
    }
    if (!puedeGestionar(usuario, actual)) {
      res.status(403).json({ error: 'La alerta pertenece a otro organismo' });
      return;
    }
    const idOrigenPermitido = usuario.rol === 'SUPERADMIN' ? null : usuario.id_origen;
    const alerta = repo.actualizarEstado(id, estado, idOrigenPermitido);
    if (!alerta) {
      res.status(404).json({ error: 'Alerta no encontrada' });
      return;
    }
    res.status(200).json(alerta);
    bus.emit(EVENTOS.ALERTA_ACTUALIZADA, alerta); // ← evento de dominio
  });

  // -------------------------------------------------------------------
  // Frontend compilado (producción): un solo proceso sirve API + interfaz
  // -------------------------------------------------------------------
  if (fs.existsSync(DIST_FRONTEND)) {
    app.use(express.static(DIST_FRONTEND));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(DIST_FRONTEND, 'index.html')));
  }

  // -------------------------------------------------------------------
  // Manejo de errores
  // -------------------------------------------------------------------
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Recurso inexistente' });
  });

  /** @type {import('express').ErrorRequestHandler} */
  const manejarError = (err, _req, res, _next) => {
    if (err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
      return;
    }
    if (err && err.type === 'entity.too.large') {
      res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande' });
      return;
    }
    console.error('[error no controlado]', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  };
  app.use(manejarError);

  return app;
}

// ---------------------------------------------------------------------
// Arranque (solo si se ejecuta directamente: `node server.js`)
// ---------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const servidor = crearApp().listen(PORT, () => {
    console.log(`[geoAlerts] API escuchando en http://localhost:${PORT}`);
  });

  /** Apagado ordenado ante SIGINT/SIGTERM (eventos del sistema operativo). @param {string} senal */
  const apagar = (senal) => {
    console.log(`[geoAlerts] ${senal} recibido: cerrando conexiones…`);
    servidor.close(() => {
      repo.cerrar();
      process.exit(0);
    });
    servidor.closeAllConnections(); // corta los flujos SSE abiertos
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => apagar('SIGINT'));
  process.on('SIGTERM', () => apagar('SIGTERM'));
}
