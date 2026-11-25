// Supabase Edge Function: check-launch-status
// Authoritative Server Time Launch Verification Gate
// Scheduled Launch: 26 November 2026, 12:00:00 AM IST (UTC: 2026-11-25T18:30:00.000Z)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const LAUNCH_TIMESTAMP_UTC = "2026-11-25T18:30:00.000Z";
const LAUNCH_TIMESTAMP_MS = new Date(LAUNCH_TIMESTAMP_UTC).getTime();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cache-control, pragma",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0"
};

serve(async (req: Request) => {
  // Handle CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const nowMs = Date.now();
    const isLaunched = nowMs >= LAUNCH_TIMESTAMP_MS;
    const remainingMs = Math.max(0, LAUNCH_TIMESTAMP_MS - nowMs);
    const remainingSeconds = Math.floor(remainingMs / 1000);

    const nowIso = new Date(nowMs).toISOString();
    const serverTimeIST = new Date(nowMs).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }) + " IST";

    const responsePayload = {
      isLaunched,
      status: isLaunched ? "LAUNCHED" : "PRE_LAUNCH_LOCKED",
      code: isLaunched ? "ACCESS_GRANTED" : "LAUNCH_PENDING",
      launchTimeUtc: LAUNCH_TIMESTAMP_UTC,
      launchTimeIst: "26 November 2026, 12:00:00 AM IST",
      serverTimeUtc: nowIso,
      serverTimeIst,
      remainingMs,
      remainingSeconds,
      countdown: {
        days: Math.floor(remainingSeconds / 86400),
        hours: Math.floor((remainingSeconds % 86400) / 3600),
        minutes: Math.floor((remainingSeconds % 3600) / 60),
        seconds: remainingSeconds % 60
      },
      message: isLaunched
        ? "Classified mission launch sequence completed. Website unlocked."
        : "Website access is scheduled for 26 November 2026 at 12:00 AM IST. All protected assets remain encrypted and locked."
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        isLaunched: false,
        error: error instanceof Error ? error.message : "Internal Server Time Error",
        code: "SERVER_ERROR"
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
});
