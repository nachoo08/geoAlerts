// @ts-check
/**
 * PRUEBAS DE CAJA BLANCA
 * Se conocen las estructuras internas y se recorren sus CAMINOS LÓGICOS:
 *  - CB-01..05 Middleware requiereAuth: cada rama del if/try/catch.
 *  - CB-06..09 Aislamiento por organismo: ramas de puedeGestionar() y del POST.
 *  - CB-10     Transacción SQL: un fallo dentro de la transacción revierte todo.
 *  - CB-11..12 Suscripciones a eventos (SSE): alta, entrega y baja del suscriptor.
 *  - CB-13     Validación compartida: cobertura de ramas de validarAlerta().
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { iniciarServidor, pedir, login, ALERTA_VALIDA } from './ayudas.js';
import { EVENTOS, validarAlerta, puedeGestionar } from '@geoalerts/compartido';
import { bus } from '../eventos.js';
import { db, crearAlerta } from '../db.js';

/** @type {import('./ayudas.js').Servidor} */
let srv;
/** @type {Record<string, string>} */
const tokens = {};

before(async () => {
  srv = await iniciarServidor();
  tokens.admin = await login(srv.base, 'admin', 'admin123');            // SUPERADMIN
  tokens.caba = await login(srv.base, 'defensacivil', 'demo123');       // organismo 1
  tokens.tigre = await login(srv.base, 'tigre', 'demo123');             // organismo 2
});
after(() => srv.cerrar());

/** @param {Record<string,string>} [cabeceras] */
async function postConCabeceras(cabeceras = {}) {
  const res = await fetch(`${srv.base}/alertas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify(ALERTA_VALIDA),
  });
  return res.status;
}

describe('Middleware requiereAuth — caminos lógicos', () => {
  test('CB-01 sin cabecera Authorization → rama "falta token" → 401', async () => {
    assert.equal(await postConCabeceras(), 401);
  });
  test('CB-02 esquema distinto de Bearer → rama "falta token" → 401', async () => {
    assert.equal(await postConCabeceras({ Authorization: `Basic ${tokens.admin}` }), 401);
  });
  test('CB-03 token firmado con otra clave → rama catch → 401', async () => {
    const falso = jwt.sign({ id: 1, username: 'admin', rol: 'SUPERADMIN', id_origen: null }, 'otra-clave');
    assert.equal(await postConCabeceras({ Authorization: `Bearer ${falso}` }), 401);
  });
  test('CB-04 token vencido → rama catch → 401', async () => {
    const vencido = jwt.sign(
      { id: 1, username: 'admin', rol: 'SUPERADMIN', id_origen: null, exp: Math.floor(Date.now() / 1000) - 60 },
      'secreto-de-prueba');
    assert.equal(await postConCabeceras({ Authorization: `Bearer ${vencido}` }), 401);
  });
  test('CB-05 token válido → rama next() → 201', async () => {
    assert.equal(await postConCabeceras({ Authorization: `Bearer ${tokens.admin}` }), 201);
  });
});

describe('Aislamiento por organismo (multiempresa)', () => {
  test('CB-06 SUPERADMIN cambia una alerta de cualquier organismo → 200', async () => {
    const r = await pedir(`${srv.base}/alertas/2/estado`, { method: 'PATCH', token: tokens.admin, body: { estado: 'FINALIZADA' } });
    assert.equal(r.estado, 200);
  });
  test('CB-07 ADMINISTRADOR cambia una alerta de SU organismo → 200', async () => {
    // Alerta 3 = "Anegamientos en Palermo", organismo 1 (Defensa Civil CABA)
    const r = await pedir(`${srv.base}/alertas/3/estado`, { method: 'PATCH', token: tokens.caba, body: { estado: 'FINALIZADA' } });
    assert.equal(r.estado, 200);
  });
  test('CB-08 ADMINISTRADOR intenta cambiar alerta de OTRO organismo → 403 y sin cambios', async () => {
    const antes = (await pedir(`${srv.base}/alertas/4`)).datos.estado;
    const r = await pedir(`${srv.base}/alertas/4/estado`, { method: 'PATCH', token: tokens.tigre, body: { estado: 'FINALIZADA' } });
    assert.equal(r.estado, 403);
    assert.equal((await pedir(`${srv.base}/alertas/4`)).datos.estado, antes);
  });
  test('CB-08b ADMINISTRADOR no puede modificar alertas de fuentes API externas → 403', async () => {
    const r = await pedir(`${srv.base}/alertas/1/estado`, { method: 'PATCH', token: tokens.caba, body: { estado: 'FINALIZADA' } });
    assert.equal(r.estado, 403);
  });
  test('CB-09 ADMINISTRADOR publica: el origen se fuerza a su organismo; si pide otro → 403', async () => {
    const propia = await pedir(`${srv.base}/alertas`, { method: 'POST', token: tokens.tigre, body: ALERTA_VALIDA });
    assert.equal(propia.estado, 201);
    assert.equal(propia.datos.id_origen, 2);
    const ajena = await pedir(`${srv.base}/alertas`, { method: 'POST', token: tokens.tigre, body: { ...ALERTA_VALIDA, id_origen: 1 } });
    assert.equal(ajena.estado, 403);
  });
  test('CB-09b SUPERADMIN: origen API externa → 400; origen manual explícito → 201', async () => {
    const api = await pedir(`${srv.base}/alertas`, { method: 'POST', token: tokens.admin, body: { ...ALERTA_VALIDA, id_origen: 3 } });
    assert.equal(api.estado, 400);
    const manual = await pedir(`${srv.base}/alertas`, { method: 'POST', token: tokens.admin, body: { ...ALERTA_VALIDA, id_origen: 2 } });
    assert.equal(manual.estado, 201);
    assert.equal(manual.datos.id_origen, 2);
  });
  test('CB-09c puedeGestionar(): tabla de decisión completa', () => {
    assert.equal(puedeGestionar(null, { id_origen: 1 }), false);
    assert.equal(puedeGestionar({ rol: 'SUPERADMIN', id_origen: null }, { id_origen: 1 }), true);
    assert.equal(puedeGestionar({ rol: 'ADMINISTRADOR', id_origen: 1 }, { id_origen: 1 }), true);
    assert.equal(puedeGestionar({ rol: 'ADMINISTRADOR', id_origen: 1 }, { id_origen: 2 }), false);
    assert.equal(puedeGestionar({ rol: 'ADMINISTRADOR', id_origen: null }, { id_origen: 1 }), false);
  });
});

describe('Transacciones SQL', () => {
  test('CB-10 una violación de clave foránea dentro de la transacción revierte (ROLLBACK)', () => {
    const contar = () => /** @type {{n:number}} */ (db.prepare('SELECT COUNT(*) AS n FROM ALERTA').get()).n;
    const antes = contar();
    assert.throws(() => crearAlerta({
      titulo: 'Origen inexistente', tipo: 'VIENTO', nivel_gravedad: 'AMARILLO',
      descripcion: null, latitud: -34.6, longitud: -58.4, id_origen: 999,
    }), /FOREIGN KEY/);
    assert.equal(contar(), antes, 'no debe quedar ninguna fila a medias');
  });
  test('CB-10b el CHECK de región en la base rechaza coordenadas aunque se saltee la API', () => {
    assert.throws(() => crearAlerta({
      titulo: 'Fuera de región', tipo: 'VIENTO', nivel_gravedad: 'AMARILLO',
      descripcion: null, latitud: -27.37, longitud: -55.9, id_origen: 1,
    }), /CHECK/);
  });
  test('CB-10c una entrada con SQL malicioso se guarda como texto literal (consultas parametrizadas)', async () => {
    const titulo = "x'); DROP TABLE ALERTA; --";
    const r = await pedir(`${srv.base}/alertas`, { method: 'POST', token: tokens.admin, body: { ...ALERTA_VALIDA, titulo } });
    assert.equal(r.estado, 201);
    assert.equal(r.datos.titulo, titulo);
    assert.equal((await pedir(`${srv.base}/alertas`)).estado, 200, 'la tabla sigue existiendo');
  });
});

describe('Suscripciones a eventos (Programación Orientada a Eventos)', () => {
  test('CB-11 un alta emite "alerta:creada" en el bus con la alerta persistida', async () => {
    const recibido = new Promise((resolver) => bus.once(EVENTOS.ALERTA_CREADA, resolver));
    const r = await pedir(`${srv.base}/alertas`, { method: 'POST', token: tokens.admin, body: { ...ALERTA_VALIDA, titulo: 'Evento bus' } });
    const evento = /** @type {{id:number}} */ (await recibido);
    assert.equal(evento.id, r.datos.id);
  });

  test('CB-12 un suscriptor SSE recibe el evento y, al desconectarse, se da de baja (sin fugas)', async () => {
    const base = bus.listenerCount(EVENTOS.ALERTA_CREADA);
    const corte = new AbortController();
    const res = await fetch(`${srv.base}/eventos`, { signal: corte.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /text\/event-stream/);
    assert.equal(bus.listenerCount(EVENTOS.ALERTA_CREADA), base + 1, 'suscripción registrada');

    const lector = /** @type {ReadableStream<Uint8Array>} */ (res.body).getReader();
    const decodificador = new TextDecoder();
    await pedir(`${srv.base}/alertas`, { method: 'POST', token: tokens.admin, body: { ...ALERTA_VALIDA, titulo: 'Evento SSE' } });

    let texto = '';
    while (!texto.includes('Evento SSE')) {
      const { value, done } = await lector.read();
      if (done) break;
      texto += decodificador.decode(value);
    }
    assert.match(texto, /event: alerta:creada/);
    assert.match(texto, /"titulo":"Evento SSE"/);

    corte.abort();
    for (let i = 0; i < 50 && bus.listenerCount(EVENTOS.ALERTA_CREADA) !== base; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(bus.listenerCount(EVENTOS.ALERTA_CREADA), base, 'suscripción eliminada');
  });

  test('CB-12b una operación rechazada (403) NO emite eventos', async () => {
    let emitido = false;
    const espia = () => { emitido = true; };
    bus.on(EVENTOS.ALERTA_ACTUALIZADA, espia);
    await pedir(`${srv.base}/alertas/1/estado`, { method: 'PATCH', token: tokens.tigre, body: { estado: 'FINALIZADA' } });
    bus.off(EVENTOS.ALERTA_ACTUALIZADA, espia);
    assert.equal(emitido, false);
  });
});

describe('Validación compartida (compartido/dominio.js)', () => {
  test('CB-13 cada rama de validarAlerta() produce su mensaje', () => {
    assert.deepEqual(validarAlerta(ALERTA_VALIDA), []);
    assert.equal(validarAlerta({}).length, 4); // título, tipo, gravedad, coordenadas
    assert.match(validarAlerta({ ...ALERTA_VALIDA, descripcion: 5 }).join(), /debe ser texto/);
    assert.match(validarAlerta({ ...ALERTA_VALIDA, latitud: true }).join(), /numéricas/);
    assert.deepEqual(validarAlerta({ ...ALERTA_VALIDA, descripcion: null }), []);
  });
});
