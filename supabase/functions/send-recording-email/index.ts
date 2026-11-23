// Supabase Edge Function: send-recording-email
// Triggered automatically on completed or interrupted video recordings
// Delivers notification and video attachment/link to the owner via Resend

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "Birthday Studio <onboarding@resend.dev>";
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || Deno.env.get("RECIPIENT_EMAIL") || "tamilarasuv423@gmail.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE_URL = Deno.env.get("SITE_URL") || "https://skyward-ambition.onrender.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Format date into Indian Standard Time (IST, UTC+5:30)
function formatIST(dateString?: string): string {
  const d = dateString ? new Date(dateString) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }) + " IST";
}

function formatDuration(seconds?: number, isInterrupted?: boolean): string {
  const sec = seconds || 0;
  if (sec <= 0) return isInterrupted ? "Partial (under 5s)" : "Under 5 seconds";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const timeStr = m > 0 ? `${m}m ${s}s` : `${s} seconds`;
  return isInterrupted ? `Partial (~${timeStr})` : timeStr;
}

function formatFileSize(bytes?: number): string {
  const b = bytes || 0;
  if (b === 0) return "Unknown size";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Edge function received payload:", JSON.stringify(payload).slice(0, 300));

    // Support both Supabase Database Webhooks ({ record: ... }) and direct invocations
    const record = payload.record || payload;
    const recordingId = record.id || record.sessionId;

    if (!recordingId) {
      return new Response(JSON.stringify({ error: "Missing recording ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase admin client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Deduplication check: verify if email has already been sent
    const { data: currentRec, error: fetchErr } = await supabase
      .from("birthday_recordings")
      .select("id, email_sent, status, is_interrupted, file_size, duration_seconds, storage_path, created_at, completed_at")
      .eq("id", recordingId)
      .single();

    if (currentRec && currentRec.email_sent) {
      console.log(`Email already dispatched for ${recordingId}. Skipping duplicate.`);
      return new Response(JSON.stringify({ message: "Duplicate email prevented", recordingId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isInterrupted = Boolean(record.is_interrupted || record.isInterrupted || record.status === "interrupted");
    const storagePath = record.storage_path || record.storagePath || currentRec?.storage_path;
    const durationSeconds = record.duration_seconds || record.durationSeconds || currentRec?.duration_seconds || 0;
    const fileSize = record.file_size || record.fileSize || currentRec?.file_size || 0;
    const createdAt = record.completed_at || record.created_at || currentRec?.created_at;

    // Create 7-day signed URL from Supabase Storage
    let signedUrl = record.signedUrl || record.streamUrl;
    if (!signedUrl && storagePath) {
      const { data: signData } = await supabase.storage
        .from("birthday-recordings")
        .createSignedUrl(storagePath, 604800); // 7 days
      signedUrl = signData?.signedUrl;
    }

    const playbackLink = signedUrl || `${SITE_URL}/api/recordings/stream/${recordingId}`;
    const istTime = formatIST(createdAt);
    const durationStr = formatDuration(durationSeconds, isInterrupted);
    const sizeStr = formatFileSize(fileSize);
    const statusLabel = isInterrupted ? "INTERRUPTED / INCOMPLETE" : "COMPLETED SUCCESSFULLY";
    const statusColor = isInterrupted ? "#d97706" : "#059669";
    const statusBg = isInterrupted ? "#fef3c7" : "#d1fae5";

    // Attachment logic: Resend limit is ~20 MB
    const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB
    const attachments: Array<{ filename: string; content: string }> = [];
    let hasAttachment = false;

    if (fileSize > 0 && fileSize <= MAX_ATTACHMENT_BYTES && storagePath) {
      try {
        console.log(`Downloading video for attachment (${fileSize} bytes)...`);
        const { data: fileData, error: dlError } = await supabase.storage
          .from("birthday-recordings")
          .download(storagePath);

        if (fileData && !dlError) {
          const arrayBuffer = await fileData.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < uint8.byteLength; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          const base64Content = btoa(binary);

          attachments.push({
            filename: `${isInterrupted ? "interrupted" : "recording"}_${recordingId.slice(0, 8)}.webm`,
            content: base64Content,
          });
          hasAttachment = true;
          console.log("✓ Video successfully encoded as base64 email attachment.");
        }
      } catch (attErr) {
        console.warn("Attachment download warning:", attErr);
      }
    }

    const subject = isInterrupted
      ? `[Interrupted] Birthday Website Video Recording — ID: ${recordingId.slice(0, 8)}`
      : `New Birthday Website Video Recording — ID: ${recordingId.slice(0, 8)}`;

    const attachmentNoteHtml = hasAttachment
      ? `<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; margin-top: 20px; font-size: 13px; color: #166534;">
           <strong>📎 Video Attached:</strong> The recording is attached directly to this email.
         </div>`
      : `<div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; margin-top: 20px; font-size: 13px; color: #1e40af;">
           <strong>ℹ️ Secure Cloud Playback:</strong> The video (${sizeStr}) is securely hosted in your private Supabase Storage bucket. Use the button below to watch or download.
         </div>`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
    <tr>
      <td style="background: linear-gradient(135deg, #4A1222 0%, #15161A 100%); padding: 32px 28px; text-align: center;">
        <div style="color: #E8A5AF; font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 8px;">
          ✈️ SKYWARD AMBITION · AUTOMATIC VIDEO DISPATCH
        </div>
        <h1 style="color: #FDF9F2; font-size: 22px; margin: 0; font-weight: 600;">
          ${isInterrupted ? 'Interrupted Recording Notification' : 'New Birthday Video Recording'}
        </h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px 28px;">
        ${isInterrupted ? `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; margin-bottom: 24px; font-size: 13px; color: #92400e;">
          <strong>⚠️ Notice:</strong> The visitor unexpectedly closed the website while recording. All uploaded chunks were safely preserved and reconstructed.
        </div>` : ''}

        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
          Hello Tamilarasu,
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #334155;">
          ${isInterrupted
            ? 'A visitor began recording on your birthday website, but the session was interrupted. Here are the recovered details:'
            : 'A new visitor has recorded and submitted a video message on your birthday website! Here are the details:'}
        </p>

        <table width="100%" border="0" cellspacing="0" cellpadding="8" style="background: #f8fafc; border-radius: 10px; margin: 20px 0; border: 1px solid #edf2f7; font-size: 14px;">
          <tr>
            <td style="color: #64748b; width: 140px; font-weight: 500;">Recording ID:</td>
            <td style="font-family: monospace; font-weight: 600; color: #0f172a;">${recordingId}</td>
          </tr>
          <tr>
            <td style="color: #64748b; font-weight: 500;">Status:</td>
            <td>
              <span style="background: ${statusBg}; color: ${statusColor}; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">
                ${statusLabel}
              </span>
            </td>
          </tr>
          <tr>
            <td style="color: #64748b; font-weight: 500;">Date & Time (IST):</td>
            <td style="color: #0f172a; font-weight: 600;">${istTime}</td>
          </tr>
          <tr>
            <td style="color: #64748b; font-weight: 500;">Duration:</td>
            <td style="color: #0f172a;">${durationStr}</td>
          </tr>
          <tr>
            <td style="color: #64748b; font-weight: 500;">File Size:</td>
            <td style="color: #0f172a;">${sizeStr}</td>
          </tr>
        </table>

        <div style="text-align: center; margin: 28px 0 20px;">
          <a href="${playbackLink}" style="background: #4A1222; color: #FDF9F2; text-decoration: none; padding: 14px 28px; border-radius: 30px; font-weight: 600; font-size: 14px; display: inline-block; border: 1px solid #E8A5AF;">
            ▶️ Watch & Download Video
          </a>
        </div>
        <p style="text-align: center; font-size: 12px; color: #94a3b8; margin: 0;">
          Direct Link: <a href="${playbackLink}" style="color: #7E203E;">${playbackLink}</a>
        </p>

        ${attachmentNoteHtml}
      </td>
    </tr>
    <tr>
      <td style="background: #f1f5f9; padding: 18px 28px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
        Skyward Ambition · Supabase Edge Function Video Delivery<br>
        Dispatched to <strong>${OWNER_EMAIL}</strong>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const text = `
${isInterrupted ? '[INTERRUPTED]' : '[NEW]'} BIRTHDAY WEBSITE VIDEO RECORDING
============================================================
Hello Tamilarasu,

${isInterrupted
  ? 'A visitor started recording a video on your birthday website, but the session was interrupted. Available chunks have been preserved.'
  : 'A new visitor has recorded a video on your birthday website.'}

Recording Details:
- Recording ID: ${recordingId}
- Status: ${statusLabel}
- Date & Time: ${istTime}
- Duration: ${durationStr}
- File Size: ${sizeStr}

Secure Playback & Download Link:
${playbackLink}

${hasAttachment ? '(The video file is attached directly to this email.)' : '(Video is accessible via the cloud link above.)'}
------------------------------------------------------------
Skyward Ambition · Supabase Automated Delivery
    `.trim();

    // Send via Resend
    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY is not set in Edge Function secrets.");
      return new Response(JSON.stringify({ 
        warning: "RESEND_API_KEY not configured. Set secret using 'supabase secrets set RESEND_API_KEY=re_...'", 
        recordingId 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailPayload: Record<string, unknown> = {
      from: RESEND_FROM,
      to: [OWNER_EMAIL],
      subject,
      html,
      text,
    };

    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      throw new Error(`Resend API error (${resendRes.status}): ${JSON.stringify(resendData)}`);
    }

    console.log(`✓ Email sent successfully via Resend to ${OWNER_EMAIL}. Resend ID:`, resendData.id);

    // Update database record to prevent duplicate emails
    await supabase
      .from("birthday_recordings")
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
        email_status: "sent",
        notes: `Dispatched via Supabase Edge Function (Resend ID: ${resendData.id})`,
      })
      .eq("id", recordingId);

    return new Response(JSON.stringify({ success: true, emailId: resendData.id, recordingId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Edge function error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
