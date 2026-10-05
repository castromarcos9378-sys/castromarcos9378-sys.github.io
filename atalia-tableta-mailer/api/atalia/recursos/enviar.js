import nodemailer from "nodemailer";

function splitEmails(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  return String(value).split(/[;,]/).map(v => v.trim()).filter(Boolean);
}

function validEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"method_not_allowed" });

  const to = splitEmails(req.body?.to);
  const cc = splitEmails(req.body?.cc);
  const subject = String(req.body?.subject || "").trim();
  const body = String(req.body?.body || "").trim();

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
      text:body || "Se remite requerimiento de Atalía Villas."
    });

    return res.status(200).json({
      ok:true,
      messageId:info.messageId,
      accepted:info.accepted,
      rejected:info.rejected
    });
  } catch (err) {
    console.error("MAIL_SEND_ERROR", err);
    return res.status(502).json({ ok:false, error:"send_failed", detail:err?.message || "Unknown error" });
  }
}
