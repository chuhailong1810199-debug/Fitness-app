/**
 * Firebase Cloud Functions — Fitness App
 *
 * notifyNewLead: triggers on new /leads/{leadId} document creation and sends
 *   an email notification to the coach.
 *
 * generateProgram: HTTPS Callable — takes client info, calls Claude API,
 *   returns a structured 4-week training program JSON.
 *
 * Setup secrets (run once):
 *   firebase functions:secrets:set SMTP_USER
 *   firebase functions:secrets:set SMTP_PASS
 *   firebase functions:secrets:set CLAUDE_API_KEY
 *
 * Deploy:
 *   cd functions && npm install
 *   firebase deploy --only functions
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall }             = require("firebase-functions/v2/https");
const { defineSecret }       = require("firebase-functions/params");
const { initializeApp }      = require("firebase-admin/app");
const nodemailer             = require("nodemailer");

initializeApp();

const SMTP_USER     = defineSecret("SMTP_USER");
const SMTP_PASS     = defineSecret("SMTP_PASS");
const CLAUDE_API_KEY = defineSecret("CLAUDE_API_KEY");

const COACH_EMAIL = "chuhailong1810199@gmail.com";
const APP_NAME = "Striveo";

/**
 * Sends an email notification to the coach whenever a new lead doc is created
 * in the /leads collection.
 */
exports.notifyNewLead = onDocumentCreated(
  {
    document: "leads/{leadId}",
    secrets: [SMTP_USER, SMTP_PASS],
    region: "asia-southeast1",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      console.warn("[notifyNewLead] no snapshot — skipping");
      return;
    }

    const lead = snap.data();
    const leadId = event.params.leadId;

    // Build a human-readable timestamp
    const ts = lead.createdAt
      ? lead.createdAt.toDate().toLocaleString("en-AU", {
          timeZone: "Asia/Ho_Chi_Minh",
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "just now";

    // Rows shown in the email body
    const rows = [
      ["Name", lead.name || "—"],
      ["Email", lead.email || "—"],
      ["Phone", lead.phone || "—"],
      ["Goal", lead.goal || "—"],
      ["Frequency", lead.frequency || "—"],
      ["Service", lead.service || "—"],
      ["Note", lead.note || "—"],
      ["Submitted", ts],
      ["Lead ID", leadId],
    ];

    const tableRows = rows
      .map(
        ([label, value]) => `
      <tr>
        <td style="padding:6px 12px;font-weight:600;color:#555;white-space:nowrap;
                   border-bottom:1px solid #f0f0f0;">${label}</td>
        <td style="padding:6px 12px;color:#222;border-bottom:1px solid #f0f0f0;">${value}</td>
      </tr>`
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Inter,Arial,sans-serif;background:#f6f7fb;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;
              overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#1e90ff;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">🎯 New Coaching Lead — ${APP_NAME}</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:14px;">
        A new contact form submission is waiting for your review.
      </p>
    </div>
    <div style="padding:24px 32px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tbody>${tableRows}</tbody>
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#888;">
        Log in to the
        <a href="https://fitness-app-a22c8.web.app/app" style="color:#1e90ff;">
          Striveo dashboard
        </a>
        to update the lead status (New → Contacted → Booked / Declined).
      </p>
    </div>
  </div>
</body>
</html>`;

    const text = rows.map(([l, v]) => `${l}: ${v}`).join("\n");

    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: SMTP_USER.value(),
        pass: SMTP_PASS.value(),
      },
    });

    await transport.sendMail({
      from: `"${APP_NAME} Leads" <${SMTP_USER.value()}>`,
      to: COACH_EMAIL,
      subject: `New coaching lead: ${lead.name || "Unknown"} (${lead.service || "general"})`,
      text,
      html,
    });

    console.log(`[notifyNewLead] email sent for lead ${leadId} (${lead.email})`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// generateProgram — HTTPS Callable
// Called from the app when a coach creates a new client.
// Returns a 4-week training program as a Firestore-ready JSON object.
// ─────────────────────────────────────────────────────────────────────────────
exports.generateProgram = onCall(
  {
    secrets: [CLAUDE_API_KEY],
    region: "asia-southeast1",
    timeoutSeconds: 90,
    memory: "256MiB",
  },
  async (request) => {
    const { name, level, goal, sessionsPerWeek, notes } = request.data;

    // ── Day mapping ──────────────────────────────────────────────────────────
    const dayMaps = {
      3: ["Mon", "Wed", "Fri"],
      4: ["Mon", "Tue", "Thu", "Fri"],
      5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    };
    const days = dayMaps[sessionsPerWeek] || dayMaps[3];
    const restDays = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].filter(
      (d) => !days.includes(d)
    );

    // ── Goal guidance ────────────────────────────────────────────────────────
    const goalGuidanceMap = {
      fatLoss:
        "Fat loss & body recomposition. Prioritise metabolic conditioning, " +
        "circuit-style supersets, 12-15 reps, 30-60 s rest. Include HIIT finishers. " +
        "Keep sessions intense and time-efficient.",
      muscle:
        "Muscle hypertrophy & strength. Prioritise compound lifts with " +
        "progressive overload, 6-10 reps, 2-3 min rest. Periodise load across 4 weeks " +
        "(e.g. Week 1-2 at 70%, Week 3-4 at 75-80% 1RM). Add isolation accessories.",
      endurance:
        "Cardiovascular endurance & functional fitness. Include zone-2 cardio, " +
        "functional compound movements, 15-20 reps, minimal rest / supersets. " +
        "Build aerobic base while maintaining muscle.",
    };
    const g = (goal || "").toLowerCase();
    let goalGuidance = goalGuidanceMap.muscle;
    if (/fat|lean|cut|giam|giảm|weight.?loss/i.test(g)) goalGuidance = goalGuidanceMap.fatLoss;
    else if (/endurance|sức.?bền|suc.?ben|stamina|run|cardio/i.test(g)) goalGuidance = goalGuidanceMap.endurance;

    // ── Level guidance ───────────────────────────────────────────────────────
    const levelMap = {
      Beginner:
        "Beginner: 2-3 sets per exercise, fundamental movement patterns, " +
        "emphasis on technique. Longer warm-up, more mobility work.",
      Intermediate:
        "Intermediate: 3-4 sets, compound + accessory split, moderate complexity, " +
        "introduce periodisation.",
      Advanced:
        "Advanced: 4-5 sets, complex periodisation, higher volume, " +
        "advanced techniques (tempo, pause reps, drop sets where appropriate).",
    };
    const levelGuidance = levelMap[level] || levelMap["Intermediate"];

    // ── Build the day skeleton for the prompt ────────────────────────────────
    const daySkeletonLines = days
      .map((d, i) => `  "${d}": { "label": "Session ${String.fromCharCode(65+i)} — [focus]", "phases": [...] }`)
      .join(",\n");

    // ── Prompt ───────────────────────────────────────────────────────────────
    const prompt = `You are an elite personal trainer. Create a 4-week progressive training program.

CLIENT
- Name: ${name}
- Level: ${level}
- Goal: ${goal}
- Sessions/week: ${sessionsPerWeek} days (${days.join(", ")})
- Rest days: ${restDays.join(", ")}
- Notes / injuries: ${notes || "none"}

GOAL APPROACH
${goalGuidance}

VOLUME & INTENSITY
${levelGuidance}

OUTPUT FORMAT
Return ONLY raw JSON — no markdown, no code fences, no explanation.
Root keys are the training days: ${days.join(", ")}.

{
${daySkeletonLines}
}

Each day must follow this EXACT structure:
{
  "label": "Session A — Push",
  "phases": [
    {
      "tag": "warmup",
      "name": "🔥 Warm-up",
      "exercises": [
        { "name": "Jump Rope", "setsReps": "1 x 5 min", "tempo": "", "cue": "Light pace to elevate heart rate." }
      ]
    },
    {
      "tag": "strength",
      "name": "💪 Main Lifts",
      "exercises": [
        { "name": "Barbell Back Squat", "setsReps": "4 x 8", "tempo": "3-1-2", "cue": "Week 1-2: 70% 1RM | Week 3-4: 75% 1RM. Brace core, knees track toes." }
      ]
    },
    {
      "tag": "accessories",
      "name": "⚡ Accessories",
      "exercises": [
        { "name": "Leg Press", "setsReps": "3 x 12", "tempo": "2-0-2", "cue": "Week 3-4: add 1 set. Full range of motion." }
      ]
    }
  ]
}

RULES
- Warm-up: 3-4 exercises (5-10 min total)
- Main Lifts: 3-5 compound exercises
- Accessories: 3-5 isolation / support exercises
- Embed 4-week progression inside the "cue" field (load, sets, or intensity)
- Total session: 45-75 min
- Vary session focus logically across days (e.g. Push / Pull / Legs, or Upper / Lower)
- Do NOT add any text outside the JSON`;

    // ── Call Claude ──────────────────────────────────────────────────────────
    const Anthropic = require("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey: CLAUDE_API_KEY.value() });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    let raw = message.content[0].text.trim();
    // Strip markdown fences if Claude adds them despite instructions
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    const program = JSON.parse(raw);
    console.log(`[generateProgram] program generated for ${name} (${level}, ${goal})`);
    return { program };
  }
);
