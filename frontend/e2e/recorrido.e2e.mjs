/**
 * Prueba E2E (extremo a extremo) en un navegador real — E2E-01.
 * Recorre: mapa público → filtro → login de un Administrador → validación de región
 * → alta de alerta → recepción en VIVO (SSE) en un segundo navegador sin recargar.
 *
 * Requisitos (no forman parte de las dependencias del proyecto, por su peso):
 *   npm i -D playwright@1.56.0 -w @geoalerts/frontend && npx playwright install chromium
 * Ejecución (con el backend sirviendo el frontend compilado, base de datos NUEVA):
 *   npm run build && PORT=4010 DB_PATH=/tmp/e2e.db npm start
 *   E2E_URL=http://localhost:4010/ node frontend/e2e/recorrido.e2e.mjs
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const URL = process.env.E2E_URL || 'http://localhost:4010/';
const navegador = await chromium.launch();
const admin = await navegador.newPage({ viewport: { width: 1280, height: 800 } });
const errores = [];
admin.on('pageerror', (e) => errores.push(e.message));

// 1. Mapa público con las alertas activas iniciales
await admin.goto(URL);
await admin.waitForSelector('.estado-vivo.on');
assert.match(await admin.locator('.contador').textContent(), /^8 /);

// 2. Filtro por gravedad ROJO
await admin.getByLabel('Gravedad').first().selectOption('ROJO');
await admin.waitForFunction(() => document.querySelector('.contador').textContent.startsWith('1 '));
await admin.getByLabel('Gravedad').first().selectOption('');

// 3. Un Usuario público en otro navegador, suscripto a eventos
const publico = await navegador.newPage();
await publico.goto(URL);
await publico.waitForSelector('.estado-vivo.on');
const antes = await publico.locator('.contador').textContent();

// 4. Login del Administrador del organismo "Tigre"
await admin.getByLabel('Usuario').fill('tigre');
await admin.getByLabel('Contraseña').fill('demo123');
await admin.getByRole('button', { name: 'Ingresar' }).click();
await admin.waitForSelector('text=Nueva alerta');

// 5. Clic fuera de la región → aviso de validación
const caja = await admin.locator('.leaflet-container').boundingBox();
await admin.mouse.click(caja.x + caja.width - 15, caja.y + 60);
assert.match(await admin.locator('.aviso-error').textContent(), /fuera|dentro de la región/);

// 6. Alta válida en el centro de la región
await admin.getByLabel('Título', { exact: true }).fill('Prueba E2E');
await admin.getByLabel('Tipo', { exact: true }).selectOption('SUDESTADA');
await admin.mouse.click(caja.x + caja.width / 2, caja.y + caja.height / 2);
await admin.getByRole('button', { name: 'Publicar alerta' }).click();
await admin.waitForSelector('.aviso-ok');

// 7. El Usuario público recibe la alerta SIN recargar (evento SSE)
await publico.waitForFunction((a) => document.querySelector('.contador').textContent !== a, antes, { timeout: 5000 });

assert.deepEqual(errores, [], 'sin errores de JavaScript');
console.log('E2E-01 OK:', antes.trim(), '→', (await publico.locator('.contador').textContent()).trim());
await navegador.close();
