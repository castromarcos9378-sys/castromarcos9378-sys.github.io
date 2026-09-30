'use strict';
// Prototipo de acceso delegado ATALÍA. No guarda ni expone credenciales de Dropbox.
// Las claves personales de los dispositivos jamás se incluyen en GitHub.
const crypto = require('node:crypto');
const COOKIE = '__Host-atalia_device';

function parseDevices() {
  const json = process.env.DELEGATED_DEVICES_JSON;
  if (!json) return null; // Denegar el acceso si el administrador no lo configuró.
  let rows;
  try { rows = JSON.parse(json); } catch (_) { return null; }
  if (!Array.isArray(rows)) return null;
  return rows.filter(d => d && typeof d.id === 'string'
    && /^[a-z0-9_-]{3,80}$/.test(d.id)
    && d.project === 'atalia'
    && typeof d.token_sha256 === 'string'
    && /^[a-f0-9]{64}$/i.test(d.token_sha256));
}

function tokenFromRequest(req) {
  const authorization = String(req.headers.authorization || '');
  const bearer = /^Bearer ([a-f0-9]{64})$/i.exec(authorization);
  if (bearer) return bearer[1];
  const cookies = String(req.headers.cookie || '').split(';');
  for (const part of cookies) {
    const [name, value] = part.trim().split('=', 2);
    if (name === COOKIE && /^[a-f0-9]{64}$/i.test(value || '')) return value;
  }
  return '';
}

function lookupDevice(token) {
  const devices = parseDevices();
  if (!devices || !/^[a-f0-9]{64}$/i.test(token || '')) return null;
  const hash = crypto.createHash('sha256').update(token.toLowerCase()).digest();
  let found = null;
  for (const d of devices) {
    const digest = Buffer.from(d.token_sha256, 'hex');
    if (crypto.timingSafeEqual(hash, digest) && d.enabled === true) {
      found = {id:d.id, project:d.project};
    }
  }
  return found;
}

function setNoStore(res) {
  res.setHeader('Cache-Control','private, no-store, no-cache, must-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Vary','Cookie, Authorization, Origin');
  res.setHeader('X-Content-Type-Options','nosniff');
}

function checkOrigin(req) {
  // Safari/PWA usa siempre el mismo dominio. No dar acceso entre dominios.
  const origin = req.headers.origin;
  if (!origin) return true; // Navegación y algunas peticiones GET carecen de Origin.
  const host = String(req.headers.host || '').toLowerCase();
  return /^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(origin)
    && new URL(origin).host.toLowerCase() === host;
}

function deny(res,code,message){return res.status(code).json({error:message})}
module.exports={COOKIE,parseDevices,tokenFromRequest,lookupDevice,setNoStore,checkOrigin,deny};
