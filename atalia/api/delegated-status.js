'use strict';
// Etapa 1: comprobación de identidad delegada, SIN acceso a Dropbox ni escritura.
// Los secretos y las claves de dispositivo se configuran SOLO en Vercel (variables de entorno).
const crypto = require('node:crypto');

function allowedOrigins() {
  const configured = String(process.env.DELEGATED_ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const builtin = ['https://atalia-registro-obra.vercel.app'];
  if (process.env.VERCEL_URL) builtin.push('https://' + process.env.VERCEL_URL);
  return new Set([...configured, ...builtin]);
}

function authenticate(authHeader) {
  const raw = /^Bearer ([a-fA-F0-9]{64})$/.exec(String(authHeader || ''));
  if (!raw) return null;
  const digest = crypto.createHash('sha256').update(raw[1].toLowerCase(), 'utf8').digest();
  let devices;
  try {
    devices = JSON.parse(process.env.DELEGATED_DEVICES_JSON || '[]');
    if (!Array.isArray(devices)) return null;
  } catch (_) { return null; }
  for (const d of devices) {
    if (typeof d?.token_sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(d.token_sha256)) continue;
    if (!crypto.timingSafeEqual(digest, Buffer.from(d.token_sha256, 'hex'))) continue;
    if (d.enabled !== true || !['atalia','daos'].includes(d.project)
        || typeof d.id !== 'string' || !/^[a-z0-9_-]{3,80}$/i.test(d.id)
        || typeof d.operator_id !== 'string' || !/^[a-z0-9_-]{3,80}$/i.test(d.operator_id)) return null;
    return { id: d.id, project: d.project, operator_id: d.operator_id };
  }
  return null;
}

function send(res, code, body) {
  return res.status(code).json(body);
}

module.exports = function delegatedStatus(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const origin = req.headers.origin;
  if (origin) {
    if (!allowedOrigins().has(origin)) return send(res, 403, { error: 'Origin not allowed' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  if (!process.env.DELEGATED_DEVICES_JSON) return send(res, 503, { error: 'Delegated access not configured' });
  const device = authenticate(req.headers.authorization);
  if (!device) return send(res, 401, { error: 'Device not authorized' });
  return send(res, 200, {
    active: true, device: device.id, project: device.project, operator: device.operator_id,
    syncReady: false, message: 'Identity verified. Delegated synchronization is not yet enabled.'
  });
};

// No se publicarán endpoints de lectura/escritura de Dropbox hasta comprobar
// aislamiento por proyecto, control de versiones, respaldo e idempotencia.
