require('dotenv').config();
const db = require('./db');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Birthday Studio <onboarding@resend.dev>';
const OWNER_EMAIL = process.env.RECIPIENT_EMAIL || process.env.OWNER_EMAIL || 'tamilarasuv423@gmail.com';
const SUPABASE_EDGE_FUNCTION_URL = process.env.SUPABASE_EDGE_FUNCTION_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
const SITE_URL = process.env.SITE_URL || (process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:3000');

// Format date into Indian Standard Time (IST, GMT+5:30)
function formatIST(date) {
  const d = date ? (date instanceof Date ? date : new Date(date)) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }) + ' IST';
}

// Format duration
function formatDuration(seconds, isInterrupted) {
  const sec = parseInt(seconds, 10) || 0;
  if (sec <= 0) return isInterrupted ? 'Partial (few seconds)' : 'Under 5 seconds';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const timeStr = m > 0 ? `${m}m ${s}s` : `${s} seconds`;
  return isInterrupted ? `Partial (~${timeStr})` : timeStr;
}

// Format file size
function formatFileSize(bytes) {
  const b = parseInt(bytes, 10) || 0;
  if (b === 0) return 'Unknown size';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

// Build beautiful HTML and plain text email
function buildRecordingEmail({ recording, streamUrl, signedUrl, isInterrupted, hasAttachment }) {
  const recordingId = recording.id || recording.sessionId || 'Unknown ID';
  const istTime = formatIST(recording.completedAt || recording.createdAt || new Date());
  const duration = formatDuration(recording.durationSeconds, isInterrupted);
  const fileSizeStr = formatFileSize(recording.fileSize);
  const statusLabel = isInterrupted ? 'INTERRUPTED / INCOMPLETE' : 'COMPLETED SUCCESSFULLY';
  const statusColor = isInterrupted ? '#d97706' : '#059669';
  const statusBg = isInterrupted ? '#fef3c7' : '#d1fae5';

  const playbackLink = signedUrl || streamUrl || `${SITE_URL}/api/recordings/stream/${recordingId}`;

  const subject = isInterrupted 
    ? `[Interrupted] Birthday Website Video Recording — ID: ${recordingId.slice(0, 8)}`
    : `New Birthday Website Video Recording — ID: ${recordingId.slice(0, 8)}`;

  const attachmentNoteHtml = hasAttachment
    ? `<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; margin-top: 20px; font-size: 13px; color: #166534;">
         <strong>📎 Video Attached:</strong> The video file is attached directly to this email for instant viewing.
       </div>`
    : `<div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; margin-top: 20px; font-size: 13px; color: #1e40af;">
         <strong>ℹ️ Cloud Stream/Download Link:</strong> The video is available on your secure cloud storage. Use the link below to watch or download.
       </div>`;

  const interruptedAlertHtml = isInterrupted
    ? `<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; margin-bottom: 24px; font-size: 13px; color: #92400e;">
         <strong>⚠️ Notice:</strong> The visitor unexpectedly closed the website or lost connection while recording. Available chunks were automatically preserved and recovered into a partial video.
       </div>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
    <!-- Header -->
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

    <!-- Body -->
    <tr>
      <td style="padding: 32px 28px;">
        ${interruptedAlertHtml}

        <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
          Hello Tamilarasu,
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #334155;">
          ${isInterrupted 
            ? 'A visitor started recording a video message on your birthday website, but the session was interrupted. Here are the recovered details:' 
            : 'A visitor has recorded and submitted a new video message on your birthday website! Here are the full recording details:'}
        </p>

        <!-- Details Table -->
        <table width="100%" border="0" cellspacing="0" cellpadding="8" style="background: #f8fafc; border-radius: 10px; margin: 20px 0; border: 1px solid #edf2f7; font-size: 14px;">
          <tr>
            <td style="color: #64748b; width: 140px; font-weight: 500;">Recording ID:</td>
            <td style="font-family: monospace; font-weight: 600; color: #0f172a;">${recordingId}</td>
          </tr>
          <tr>
            <td style="color: #64748b; font-weight: 500;">Status:</td>
            <td>
              <span style="background: ${statusBg}; color: ${statusColor}; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; letter-spacing: 0.05em;">
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
            <td style="color: #0f172a;">${duration}</td>
          </tr>
          <tr>
            <td style="color: #64748b; font-weight: 500;">File Size:</td>
            <td style="color: #0f172a;">${fileSizeStr}</td>
          </tr>
        </table>

        <!-- Action Button -->
        <div style="text-align: center; margin: 28px 0 20px;">
          <a href="${playbackLink}" style="background: #4A1222; color: #FDF9F2; text-decoration: none; padding: 14px 28px; border-radius: 30px; font-weight: 600; font-size: 14px; display: inline-block; letter-spacing: 0.05em; border: 1px solid #E8A5AF;">
            ▶️ Watch & Download Video
          </a>
        </div>
        <p style="text-align: center; font-size: 12px; color: #94a3b8; margin: 0;">
          Direct URL: <a href="${playbackLink}" style="color: #7E203E;">${playbackLink}</a>
        </p>

        ${attachmentNoteHtml}
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background: #f1f5f9; padding: 18px 28px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
        Skyward Ambition · Automated Supabase Video Notification System<br>
        Configured for <strong>${OWNER_EMAIL}</strong>
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
- Duration: ${duration}
- File Size: ${fileSizeStr}

Secure Playback & Download Link:
${playbackLink}

${hasAttachment ? '(The video file is attached directly to this email.)' : '(Video is accessible via the secure cloud link above.)'}

------------------------------------------------------------
Skyward Ambition · Automatic Delivery System
  `.trim();

  return { subject, html, text };
}

// Send email via Resend API
async function sendViaResend({ subject, html, text, attachments = [] }) {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const payload = {
    from: RESEND_FROM_EMAIL,
    to: [OWNER_EMAIL],
    subject,
    html,
    text
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Resend API error (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

// Send email via Supabase Edge Function
async function sendViaSupabaseEdgeFunction(recordingData) {
  if (!SUPABASE_EDGE_FUNCTION_URL) {
    throw new Error('SUPABASE_EDGE_FUNCTION_URL is not configured.');
  }

  const res = await fetch(SUPABASE_EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify(recordingData)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Supabase Edge Function error (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

// Main Dispatch Function with Deduplication
async function dispatchRecordingEmail({ recording, isInterrupted = false, videoBuffer = null }) {
  if (!recording || !recording.id) {
    console.warn('[EMAIL DISPATCH] Invalid recording object provided.');
    return { success: false, reason: 'Invalid recording object' };
  }

  const recordingId = recording.id;

  // 1. Atomic claim in Supabase PostgreSQL to prevent duplicate emails
  if (db && db.isDbConnected()) {
    try {
      const claimed = await db.claimRecordingForEmail(recordingId);
      if (!claimed) {
        console.log(`[EMAIL DISPATCH] Recording ${recordingId} already processed or currently sending. Skipping duplicate.`);
        return { success: true, duplicateSkipped: true };
      }
    } catch (e) {
      console.warn('[EMAIL DISPATCH] Claim check warning:', e.message);
    }
  }

  // 2. Prepare Signed or Stream URL
  let signedUrl = null;
  if (db && recording.storagePath) {
    try {
      // Create 7-day signed URL (604,800 seconds)
      signedUrl = await db.createSupabaseSignedUrl('birthday-recordings', recording.storagePath, 604800);
    } catch (e) {}
  }
  const streamUrl = `${SITE_URL}/api/recordings/stream/${recordingId}`;

  // 3. Attachment logic (limit: 20 MB for safe email delivery)
  const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20 MB
  let attachments = [];
  let hasAttachment = false;

  const fileSize = parseInt(recording.fileSize, 10) || (videoBuffer ? videoBuffer.length : 0);

  if (fileSize > 0 && fileSize <= MAX_ATTACHMENT_SIZE) {
    let bufferToAttach = videoBuffer;

    // If buffer was not passed directly, try reading from local storage
    if (!bufferToAttach && recording.storagePath) {
      try {
        const fs = require('fs');
        const path = require('path');
        const localPath = path.join(__dirname, 'private_uploads', recording.storagePath);
        if (fs.existsSync(localPath)) {
          bufferToAttach = fs.readFileSync(localPath);
        }
      } catch (e) {}
    }

    if (bufferToAttach && bufferToAttach.length > 0) {
      const ext = (recording.mimeType && recording.mimeType.includes('mp4')) ? 'mp4' : 'webm';
      attachments.push({
        filename: `${isInterrupted ? 'interrupted' : 'recording'}_${recordingId.slice(0, 8)}.${ext}`,
        content: bufferToAttach.toString('base64')
      });
      hasAttachment = true;
    }
  }

  // 4. Build email content
  const emailData = buildRecordingEmail({
    recording,
    streamUrl,
    signedUrl,
    isInterrupted,
    hasAttachment
  });

  let dispatched = false;
  let deliveryMethod = 'none';
  let deliveryResult = null;
  let lastError = null;

  // 5. Delivery Attempt 1: Resend API directly
  if (RESEND_API_KEY) {
    try {
      deliveryResult = await sendViaResend({
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        attachments
      });
      dispatched = true;
      deliveryMethod = 'resend';
      console.log(`✓ [EMAIL DISPATCH] Email successfully dispatched via Resend to ${OWNER_EMAIL}! Email ID: ${deliveryResult.id}`);
    } catch (err) {
      console.warn('[EMAIL DISPATCH] Resend API attempt warning:', err.message);
      lastError = err;
    }
  }

  // 6. Delivery Attempt 2: Supabase Edge Function
  if (!dispatched && SUPABASE_EDGE_FUNCTION_URL) {
    try {
      deliveryResult = await sendViaSupabaseEdgeFunction({
        record: {
          ...recording,
          isInterrupted,
          signedUrl,
          streamUrl
        }
      });
      dispatched = true;
      deliveryMethod = 'supabase_edge_function';
      console.log(`✓ [EMAIL DISPATCH] Email successfully dispatched via Supabase Edge Function to ${OWNER_EMAIL}!`);
    } catch (err) {
      console.warn('[EMAIL DISPATCH] Supabase Edge Function attempt warning:', err.message);
      lastError = err;
    }
  }

  // 7. Delivery Attempt 3: Local Nodemailer (if SMTP credentials exist in env)
  if (!dispatched && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        secure: (process.env.SMTP_PORT || '465') === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      const mailOptions = {
        from: process.env.SMTP_FROM || `Birthday Studio <${process.env.SMTP_USER}>`,
        to: OWNER_EMAIL,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html
      };

      if (attachments.length > 0) {
        mailOptions.attachments = attachments.map(a => ({
          filename: a.filename,
          content: Buffer.from(a.content, 'base64')
        }));
      }

      deliveryResult = await transporter.sendMail(mailOptions);
      dispatched = true;
      deliveryMethod = 'smtp';
      console.log(`✓ [EMAIL DISPATCH] Email successfully dispatched via SMTP to ${OWNER_EMAIL}! MessageId: ${deliveryResult.messageId}`);
    } catch (err) {
      console.warn('[EMAIL DISPATCH] SMTP attempt warning:', err.message);
      lastError = err;
    }
  }

  // 8. Update database record status
  if (db && db.isDbConnected()) {
    try {
      if (dispatched) {
        await db.markRecordingEmailSent(recordingId, 'sent', `Dispatched via ${deliveryMethod}`);
      } else {
        await db.markRecordingEmailSent(recordingId, 'failed', lastError ? lastError.message : 'No email credentials configured');
      }
    } catch (e) {}
  }

  if (!dispatched) {
    console.log(`[EMAIL DISPATCH] Email not sent (Credentials pending). Notification queued for ${recordingId}. Set RESEND_API_KEY in .env to deliver.`);
  }

  return {
    success: dispatched,
    method: deliveryMethod,
    recipient: OWNER_EMAIL,
    result: deliveryResult,
    error: lastError ? lastError.message : null
  };
}

module.exports = {
  formatIST,
  formatDuration,
  formatFileSize,
  buildRecordingEmail,
  dispatchRecordingEmail
};
