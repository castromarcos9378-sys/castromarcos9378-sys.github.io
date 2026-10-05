import nodemailer from "nodemailer";

const TEST_TO = "castromarcos9378@gmail.com";

function testPdf(){
  const pdf = "%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n4 0 obj<< /Length 116 >>stream\nBT /F1 18 Tf 72 720 Td (ATALIA VILLAS - ORDEN DE PEDIDO - PRUEBA DE ADJUNTO) Tj 0 -30 Td /F1 12 Tf (Prueba tecnica de envio por correo.) Tj ET\nendstream endobj\n5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\nxref\n0 6\n0000000000 65535 f \ntrailer<< /Root 1 0 R /Size 6 >>\nstartxref\n0\n%%EOF";
  return Buffer.from(pdf,"utf8");
}

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET") return res.status(405).json({ok:false});

  const host=process.env.SMTP_HOST;
  const port=Number(process.env.SMTP_PORT||587);
  const secure=String(process.env.SMTP_SECURE||"false").toLowerCase()==="true";
  const user=process.env.SMTP_USER;
  const pass=process.env.SMTP_PASS;
  const from=process.env.MAIL_FROM||user;
  if(!host||!user||!pass||!from) return res.status(503).json({ok:false,error:"smtp_not_configured"});

  try{
    const transporter=nodemailer.createTransport({host,port,secure,auth:{user,pass}});
    const info=await transporter.sendMail({
      from,
      to:TEST_TO,
      subject:"ATALÍA · prueba de Orden de Pedido adjunta",
      text:"Prueba técnica del envío de una Orden de Pedido adjunta desde el servidor de Atalía.",
      attachments:[{
        filename:"ORDEN_DE_PEDIDO_ATALIA_PRUEBA.pdf",
        content:testPdf(),
        contentType:"application/pdf"
      }]
    });
    return res.status(200).json({ok:true,messageId:info.messageId,accepted:info.accepted,rejected:info.rejected});
  }catch(err){
    console.error("TEMP_MAIL_ATTACHMENT_TEST_ERROR",err);
    return res.status(502).json({ok:false,error:"send_failed"});
  }
}
