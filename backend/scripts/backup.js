// @ts-check
/**
 * Copia de seguridad en caliente de la base SQLite (no requiere detener el servidor).
 * Uso: npm run backup -w backend            → backups/geoalerts-AAAAMMDD-HHMMSS.db
 * Se ejecuta antes de cada despliegue (ver docs/04-release-mantenimiento.md, Plan de Reversión).
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, DB_PATH } from '../db.js';

const destinoDir = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');
fs.mkdirSync(destinoDir, { recursive: true });
const sello = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const destino = path.join(destinoDir, `geoalerts-${sello}.db`);

await db.backup(destino);
console.log(`[backup] Copia creada en ${destino}`);
db.close();
