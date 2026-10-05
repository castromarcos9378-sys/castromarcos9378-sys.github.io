import nodemailer from "nodemailer";
import crypto from "node:crypto";

function splitEmails(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  return String(value).split(/[;,]/).map(v => v.trim()).filter(Boolean);
}

function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function safeAttachments(value) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/pdf"
  ]);
  return value.slice(0, 4).map(a => {
    const filename = String(a?.filename || "adjunto").replace(/[\\/]/g, "_").slice(0, 120);
    const contentType = String(a?.contentType || "");
    const base64 = String(a?.base64 || "").replace(/\s+/g, "");
    if (!filename || !allowed.has(contentType) || !/^[A-Za-z0-9+/=]+$/.test(base64)) return null;
    const content = Buffer.from(base64, "base64");
    if (!content.length || content.length > 5 * 1024 * 1024) return null;
    return { filename, contentType, content };
  }).filter(Boolean);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

async function authorize(req) {
  const authorization = String(req.headers.authorization || "");
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim() || "";
  const internal = String(req.headers["x-atalia-internal-key"] || "");
  const internalExpected = process.env.MAILER_INTERNAL_KEY || "";

  if (internalExpected && internal && safeEqual(internal, internalExpected)) {
    return { mode: "internal" };
  }

  if (!bearer) return null;

  const tabletDigest = String(process.env.TABLET_DEVICE_TOKEN_SHA256 || "").trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(tabletDigest)) {
    const actual = crypto.createHash("sha256").update(bearer).digest("hex");
    if (safeEqual(actual, tabletDigest)) {
      const origin = String(req.headers.origin || "").toLowerCase();
      const allowedLocal = origin === "null";
      const allowedWeb = origin === "https://atalia-tableta-mailer.vercel.app";
      if (allowedLocal || allowedWeb) return { mode: "tablet_device" };
      return null;
    }
  }

  const allowedAccount = String(process.env.DROPBOX_ALLOWED_ACCOUNT_ID || "").trim();
  if (!allowedAccount) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const account = await response.json();
    if (String(account?.account_id || "") !== allowedAccount) return null;
    return { mode: "dropbox", accountId: account.account_id };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function applyCors(req, res) {
  const origin = String(req.headers.origin || "").toLowerCase();
  if (origin === "null" || origin === "https://atalia-tableta-mailer.vercel.app") {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function bridgeHtml() {
  return `<!doctype html><meta charset="utf-8"><title>Atalia Mail Bridge</title><script>
  addEventListener("message", async (event) => {
    if (event.origin !== "null" && event.origin !== "https://atalia-tableta-mailer.vercel.app") return;
    const m = event.data || {};
    if (m.type !== "atalia-mail-send" || !m.requestId || !m.token || !m.payload) return;
    try {
      const response = await fetch(location.pathname, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + m.token
        },
        body: JSON.stringify(m.payload)
      });
      const out = await response.json().catch(() => ({}));
      event.source.postMessage({
        type: "atalia-mail-result",
        requestId: m.requestId,
        ok: response.ok,
        status: response.status,
        out
      }, "*");
    } catch (err) {
      event.source.postMessage({
        type: "atalia-mail-result",
        requestId: m.requestId,
        ok: false,
        status: 0,
        out: { error: "bridge_failed" }
      }, "*");
    }
  });
  <\/script>`;
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET" && String(req.query?.bridge || "") === "1") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'");
    return res.status(200).send(bridgeHtml());
  }
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"method_not_allowed" });

  const auth = await authorize(req);
  if (!auth) return res.status(401).json({ ok:false, error:"unauthorized" });

  const to = splitEmails(req.body?.to).slice(0, 10);
  const cc = splitEmails(req.body?.cc).slice(0, 10);
  const subject = String(req.body?.subject || "").trim().slice(0, 250);
  const body = String(req.body?.body || "").trim().slice(0, 50000);
  const attachments = safeAttachments(req.body?.attachmentFiles);

  if (!to.length || to.some(v => !validEmail(v))) {
    return res.status(400).json({ ok:false, error:"invalid_to" });
  }
  if (cc.some(v => !validEmail(v))) {
    return res.status(400).json({ ok:false, error:"invalid_cc" });
  }
  if (!subject) return res.status(400).json({ ok:false, error:"missing_subject" });

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || user;

  if (!host || !user || !pass || !from) {
    return res.status(503).json({ ok:false, error:"smtp_not_configured" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth:{ user, pass }
    });

    const info = await transporter.sendMail({
      from,
      to:to.join(", "),
      cc:cc.length ? cc.join(", ") : undefined,
      subject,
      text:body || "Se remite requerimiento de Atalía Villas.",
      attachments
    });

    return res.status(200).json({
      ok:true,
      messageId:info.messageId,
      accepted:info.accepted,
      rejected:info.rejected,
      attachments:attachments.map(a => a.filename),
      auth:auth.mode
    });
  } catch (err) {
    console.error("MAIL_SEND_ERROR", err);
    return res.status(502).json({ ok:false, error:"send_failed" });
  }
}
