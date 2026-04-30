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
 *   firebase functions:secrets:set GROQ_API_KEY
 *
 * Deploy:
 *   cd functions && npm install
 *   firebase deploy --only functions
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall }             = require("firebase-functions/v2/https");
const { defineSecret }       = require("firebase-functions/params");
const { initializeApp }      = require("firebase-admin/app");
const { getFirestore }       = require("firebase-admin/firestore");
const nodemailer             = require("nodemailer");
const { Groq }               = require("groq-sdk");

initializeApp();

const SMTP_USER     = defineSecret("SMTP_USER");
const SMTP_PASS     = defineSecret("SMTP_PASS");
const GROQ_API_KEY   = defineSecret("GROQ_API_KEY");

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
    secrets: [GROQ_API_KEY],
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

    // ── Injury protocol ──────────────────────────────────────────────────────
    const injurySection = notes && notes.trim() && notes.trim().toLowerCase() !== "none"
      ? `
INJURY & LIMITATION PROTOCOL — CRITICAL, DO NOT IGNORE
Client has the following injuries/limitations: "${notes}"

You MUST follow ALL of these rules:
1. AVOID any exercise that directly loads or stresses the injured area.
2. SUBSTITUTE with safe alternatives that train the same movement pattern without aggravating the injury.
   - Knee injury → replace Squat/Lunge with Leg Press, Leg Curl, Seated Leg Extension, Box Step-up (low box)
   - Lower back → replace Deadlift/Good Morning with Hip Thrust, Trap Bar Deadlift, Cable Pull-Through, Bird Dog
   - Shoulder → replace Overhead Press/Upright Row with Landmine Press, Cable Lateral Raise, Neutral-grip Press
   - Wrist → replace Barbell movements with Dumbbell or Cable alternatives, avoid push-up on wrists
   - Hip flexor → replace heavy squats and hip-flexion movements with glute-focused alternatives
3. INCLUDE 1-2 REHAB exercises in the warm-up phase targeting the injured area (mobility, activation, low load).
4. ADD a note in the "cue" field of every exercise near the injury: "⚠️ Modify or skip if pain >3/10."
5. REDUCE total session intensity by 10-15% — prioritise movement quality over load.
6. If the injury affects an entire movement category (e.g. all pressing for shoulder), restructure the session split to compensate with more pulling/lower body volume.`
      : `
INJURIES / LIMITATIONS: None reported. Train normally.`;

    // ── Prompt ───────────────────────────────────────────────────────────────
    const prompt = `You are an elite personal trainer and sports rehab specialist. Create a 4-week progressive training program.

CLIENT
- Name: ${name}
- Level: ${level}
- Goal: ${goal}
- Sessions/week: ${sessionsPerWeek} days (${days.join(", ")})
- Rest days: ${restDays.join(", ")}
${injurySection}

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
- Warm-up: 3-4 exercises (5-10 min total). If client has injury, include rehab/activation exercises here.
- Main Lifts: 3-5 compound exercises
- Accessories: 3-5 isolation / support exercises
- Embed 4-week progression inside the "cue" field (load, sets, or intensity)
- Total session: 45-75 min
- Vary session focus logically across days (e.g. Push / Pull / Legs, or Upper / Lower)
- INJURY RULES OVERRIDE ALL OTHER RULES — never recommend contraindicated exercises
- Do NOT add any text outside the JSON`;

    // ── Call Groq ────────────────────────────────────────────────────────────
    const groq = new Groq({ apiKey: GROQ_API_KEY.value() });

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4096,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    });

    let raw = completion.choices[0].message.content.trim();
    // Strip markdown fences if model wraps output
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    const program = JSON.parse(raw);
    console.log(`[generateProgram] Groq program generated for ${name} (${level}, ${goal})`);
    return { program };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// pulseGenerate — Pulse AI, HTTPS Callable
// Reads client's full Firestore history + all existing programs for style context
// Returns { program, steps } where steps[] is the Pulse analysis log
// ─────────────────────────────────────────────────────────────────────────────
exports.pulseGenerate = onCall(
  {
    secrets: [GROQ_API_KEY],
    region: "asia-southeast1",
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    const { clientId } = request.data;
    if (!clientId) throw new Error("clientId is required");

    const db = getFirestore();
    const steps = [];

    // ── Step 1: Read target client profile ───────────────────────────────────
    steps.push({ icon: "📖", text: "Đọc hồ sơ khách hàng..." });
    const clientDoc = await db.collection("clients").doc(clientId).get();
    if (!clientDoc.exists) throw new Error("Client not found: " + clientId);
    const client = clientDoc.data();
    const { name, level, goal, sessionsPerWeek } = client;

    // ── Step 2: Read assessment ───────────────────────────────────────────────
    steps.push({ icon: "📋", text: "Phân tích baseline assessment..." });
    const assessDoc = await db
      .collection("clients").doc(clientId)
      .collection("assessment").doc("baseline").get();
    const assessment = assessDoc.exists ? assessDoc.data() : null;

    // ── Step 3: Read checkpoints ──────────────────────────────────────────────
    steps.push({ icon: "📊", text: "Xem checkpoint & tiến độ..." });
    const cpSnap = await db
      .collection("clients").doc(clientId)
      .collection("checkpoints")
      .orderBy("date", "desc").limit(4).get();
    const checkpoints = cpSnap.docs.map((d) => d.data());

    // ── Step 4: Read workout history ──────────────────────────────────────────
    steps.push({ icon: "🏋️", text: "Phân tích lịch sử tập luyện..." });
    const histSnap = await db
      .collection("clients").doc(clientId)
      .collection("workoutHistory")
      .orderBy("date", "desc").limit(20).get();
    const workoutHistory = histSnap.docs.map((d) => d.data());

    // ── Step 5: Read existing programs for coaching style ─────────────────────
    steps.push({ icon: "🎨", text: "Học phong cách coaching từ các chương trình hiện có..." });
    const allClientsSnap = await db.collection("clients").get();
    const styleExamples = [];
    for (const doc of allClientsSnap.docs) {
      if (doc.id === clientId) continue;
      const data = doc.data();
      if (!data.program) continue;
      // Extract one day as style example (avoid token overload)
      const days = Object.keys(data.program);
      if (days.length === 0) continue;
      const sampleDay = data.program[days[0]];
      styleExamples.push({
        clientLevel: data.level,
        clientGoal: data.goal,
        sampleSession: sampleDay,
      });
    }

    // ── Step 6: Build prompt ─────────────────────────────────────────────────
    steps.push({ icon: "⚡", text: "Pulse đang tạo chương trình..." });

    const dayMaps = {
      3: ["Mon", "Wed", "Fri"],
      4: ["Mon", "Tue", "Thu", "Fri"],
      5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      7: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    };
    const days = dayMaps[sessionsPerWeek] || dayMaps[3];

    // Assessment context
    let assessContext = "";
    if (assessment) {
      assessContext = `
BASELINE ASSESSMENT:
- Weight: ${assessment.weight || "?"}kg, Height: ${assessment.height || "?"}cm
- Age: ${assessment.age || "?"}, Gender: ${assessment.gender || "?"}
- PBF: ${assessment.pbf || "?"}%, SMM: ${assessment.smm || "?"}kg
- Measurements: Waist ${assessment.waist || "?"}cm, Hip ${assessment.hip || "?"}cm`;
    }

    // Checkpoint trend
    let progressContext = "";
    if (checkpoints.length > 0) {
      const latest = checkpoints[0];
      const oldest = checkpoints[checkpoints.length - 1];
      progressContext = `
PROGRESS TREND (${checkpoints.length} checkpoints):
- Latest: Weight ${latest.weight || "?"}kg, PBF ${latest.pbf || "?"}%, SMM ${latest.smm || "?"}kg
- Change: Weight ${((latest.weight || 0) - (oldest.weight || 0)).toFixed(1)}kg, PBF ${((latest.pbf || 0) - (oldest.pbf || 0)).toFixed(1)}%
- Assessment: ${workoutHistory.length} sessions logged total`;
    }

    // Volume trend
    let volumeContext = "";
    if (workoutHistory.length > 0) {
      const avgVol = workoutHistory.reduce((s, w) => s + (w.volume || 0), 0) / workoutHistory.length;
      const avgDone = workoutHistory.reduce((s, w) => s + (w.done || 0), 0) / workoutHistory.length;
      volumeContext = `
WORKOUT HISTORY:
- Avg session volume: ${Math.round(avgVol)}kg
- Avg exercises completed: ${Math.round(avgDone)}
- Adherence trend: ${workoutHistory.slice(0, 5).map((w) => Math.round((w.done / (w.total || 1)) * 100) + "%").join(", ")}`;
    }

    // Coach style examples
    let styleContext = "";
    if (styleExamples.length > 0) {
      styleContext = `
COACH'S TRAINING STYLE (learned from ${styleExamples.length} existing programs):
${styleExamples.slice(0, 2).map((ex, i) => `
Example ${i + 1} — ${ex.clientLevel} client, goal: ${ex.clientGoal}:
${JSON.stringify(ex.sampleSession, null, 2).substring(0, 800)}
`).join("")}
IMPORTANT: Mirror this coaching style — same phase structure, similar exercise selection philosophy, same cue/note format.`;
    }

    const daySkeletonLines = days
      .map((d, i) => `  "${d}": { "label": "Session ${String.fromCharCode(65 + i)} — [focus]", "phases": [...] }`)
      .join(",\n");

    const prompt = `You are Pulse, an elite AI personal trainer. Create a personalized next training cycle for this client.

CLIENT PROFILE:
- Name: ${name}
- Level: ${level}
- Goal: ${goal}
- Sessions/week: ${sessionsPerWeek} (${days.join(", ")})
${assessContext}
${progressContext}
${volumeContext}
${styleContext}

TASK: Generate a 4-week progressive training program that:
1. Continues naturally from where this client left off
2. Matches exactly the coaching style shown in the examples above
3. Progresses load/volume intelligently based on their history
4. Addresses any weak points shown in their progress data

OUTPUT FORMAT — Return ONLY raw JSON, no markdown:
{
${daySkeletonLines}
}

Each day structure:
{
  "label": "Session A — Push",
  "phases": [
    {
      "tag": "warmup",
      "name": "🔥 Warm-up",
      "exercises": [{ "name": "...", "setsReps": "1 x 5 min", "tempo": "", "cue": "..." }]
    },
    {
      "tag": "strength",
      "name": "💪 Main Lifts",
      "exercises": [{ "name": "...", "setsReps": "4 x 6", "tempo": "3-1-2", "cue": "Week 1-2: 75% 1RM. Week 3-4: 80% 1RM." }]
    },
    {
      "tag": "accessories",
      "name": "⚡ Accessories",
      "exercises": [{ "name": "...", "setsReps": "3 x 12", "tempo": "2-0-2", "cue": "..." }]
    }
  ]
}

RULES:
- Warm-up: 3-4 exercises
- Main Lifts: 3-5 compound exercises
- Accessories: 3-5 isolation exercises
- Embed 4-week progression in "cue" field
- Vary session focus logically across days
- Do NOT add any text outside the JSON`;

    // ── Call Groq ─────────────────────────────────────────────────────────────
    const groq = new Groq({ apiKey: GROQ_API_KEY.value() });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 6000,
      temperature: 0.35,
      messages: [{ role: "user", content: prompt }],
    });

    let raw = completion.choices[0].message.content.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    const program = JSON.parse(raw);
    steps.push({ icon: "✅", text: "Hoàn thành!" });

    console.log(`[pulseGenerate] ⚡ Pulse generated program for ${name} (${level}, ${goal}), ${styleExamples.length} style refs`);
    return { program, steps, clientName: name };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// pulseGenerateFree — Public Pulse AI, no auth required
// Generates a FREE 1-week program for landing page visitors
// Saves visitor info as a lead in Firestore automatically
// ─────────────────────────────────────────────────────────────────────────────
exports.pulseGenerateFree = onCall(
  {
    secrets: [GROQ_API_KEY],
    region: "asia-southeast1",
    timeoutSeconds: 120,
    memory: "512MiB",
    cors: true,
  },
  async (request) => {
    const { name, email, goal, level, sessionsPerWeek, gender, weight } = request.data || {};

    // Validate required fields
    if (!name || !email || !goal || !level || !sessionsPerWeek) {
      throw new Error("Thiếu thông tin: name, email, goal, level, sessionsPerWeek là bắt buộc.");
    }

    const db = getFirestore();
    const steps = [];

    // ── Step 1: Save as lead ─────────────────────────────────────────────────
    steps.push({ icon: "📝", text: "Lưu thông tin..." });
    try {
      const leadRef = db.collection("leads").doc();
      await leadRef.set({
        name,
        email,
        goal,
        source: "free_program",
        status: "new",
        note: `Level: ${level} | Sessions/week: ${sessionsPerWeek}${gender ? ` | Gender: ${gender}` : ""}${weight ? ` | Weight: ${weight}kg` : ""}`,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("[pulseGenerateFree] Could not save lead:", e.message);
    }

    // ── Step 2: Build context ─────────────────────────────────────────────────
    steps.push({ icon: "🎯", text: "Phân tích mục tiêu của bạn..." });

    const sessions = parseInt(sessionsPerWeek) || 3;
    const dayMaps = {
      3: ["Mon", "Wed", "Fri"],
      4: ["Mon", "Tue", "Thu", "Fri"],
      5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      7: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    };
    const days = dayMaps[sessions] || dayMaps[3];

    // ── Step 3: Read coach style samples ────────────────────────────────────
    steps.push({ icon: "🎨", text: "Học phong cách coaching..." });
    let styleContext = "";
    try {
      const allClientsSnap = await db.collection("clients").get();
      const styleExamples = [];
      for (const doc of allClientsSnap.docs) {
        const data = doc.data();
        if (!data.program) continue;
        const dayKeys = Object.keys(data.program);
        if (dayKeys.length === 0) continue;
        const sampleDay = data.program[dayKeys[0]];
        styleExamples.push({ clientLevel: data.level, clientGoal: data.goal, sampleSession: sampleDay });
      }
      if (styleExamples.length > 0) {
        styleContext = `
COACH'S TRAINING STYLE (learned from ${styleExamples.length} real programs):
${styleExamples.slice(0, 2).map((ex, i) => `
Example ${i + 1} — ${ex.clientLevel} client, goal: ${ex.clientGoal}:
${JSON.stringify(ex.sampleSession, null, 2).substring(0, 600)}
`).join("")}
IMPORTANT: Mirror this coaching style — same phase structure, similar exercise selection, same cue/note format.`;
      }
    } catch (e) {
      console.warn("[pulseGenerateFree] Could not load style examples:", e.message);
    }

    // ── Step 4: Build prompt ─────────────────────────────────────────────────
    steps.push({ icon: "⚡", text: "Pulse đang tạo chương trình 1 tuần..." });

    const physicalContext = (gender || weight)
      ? `\nPHYSICAL INFO:${gender ? `\n- Gender: ${gender}` : ""}${weight ? `\n- Weight: ${weight}kg` : ""}`
      : "";

    const daySkeletonLines = days
      .map((d, i) => `  "${d}": { "label": "Session ${String.fromCharCode(65 + i)} — [focus]", "phases": [...] }`)
      .join(",\n");

    const prompt = `You are Pulse, an elite AI personal trainer. Create a FREE 1-week personalized training program for this person.

CLIENT INFO:
- Name: ${name}
- Level: ${level}
- Goal: ${goal}
- Sessions/week: ${sessions} (${days.join(", ")})${physicalContext}
${styleContext}

TASK: Generate a complete 1-week training program that:
1. Is appropriate for their level and goal
2. Matches the coaching style shown above
3. Includes proper warm-up, main work, and accessories
4. Has progression cues embedded in exercise notes
5. Is immediately actionable — no fluff

OUTPUT FORMAT — Return ONLY raw JSON, no markdown:
{
${daySkeletonLines}
}

Each day structure:
{
  "label": "Session A — Push",
  "phases": [
    {
      "tag": "warmup",
      "name": "🔥 Warm-up",
      "exercises": [{ "name": "...", "setsReps": "1 x 5 min", "tempo": "", "cue": "..." }]
    },
    {
      "tag": "strength",
      "name": "💪 Main Lifts",
      "exercises": [{ "name": "...", "setsReps": "4 x 6", "tempo": "3-1-2", "cue": "Start at 70% effort. Add 2.5kg if all reps clean." }]
    },
    {
      "tag": "accessories",
      "name": "⚡ Accessories",
      "exercises": [{ "name": "...", "setsReps": "3 x 12", "tempo": "2-0-2", "cue": "..." }]
    }
  ]
}

RULES:
- Warm-up: 3-4 exercises
- Main Lifts: 3-5 compound exercises
- Accessories: 3-5 isolation exercises
- Do NOT add any text outside the JSON`;

    // ── Step 5: Call Groq ─────────────────────────────────────────────────────
    const groq = new Groq({ apiKey: GROQ_API_KEY.value() });
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4000,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    });

    let raw = completion.choices[0].message.content.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

    const program = JSON.parse(raw);
    steps.push({ icon: "✅", text: "Chương trình của bạn đã sẵn sàng!" });

    console.log(`[pulseGenerateFree] ⚡ Free program generated for ${name} (${level}, ${goal}, ${sessions} days/week)`);
    return { program, steps, clientName: name };
  }
);
