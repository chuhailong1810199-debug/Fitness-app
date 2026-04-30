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

// ─────────────────────────────────────────────────────────────────────────────
// SHARED GOAL GUIDANCE — used by both generateProgram and pulseGenerateFree
// ─────────────────────────────────────────────────────────────────────────────
const GOAL_GUIDANCE = {
  fatLoss:
    "Fat loss & body recomposition. Prioritise metabolic conditioning, " +
    "circuit-style supersets, 12-15 reps, 30-60s rest. Include HIIT finishers. " +
    "Keep sessions intense and time-efficient.",

  muscle:
    "Muscle hypertrophy & strength. Prioritise compound lifts with " +
    "progressive overload, 6-10 reps, 2-3 min rest. Periodise load across weeks " +
    "(e.g. Week 1-2 at 70%, Week 3-4 at 75-80% 1RM). Add isolation accessories.",

  endurance:
    "Cardiovascular endurance & functional fitness. Include zone-2 cardio, " +
    "functional compound movements, 15-20 reps, minimal rest / supersets. " +
    "Build aerobic base while maintaining muscle.",

  general:
    "General fitness & health. Balanced mix of strength and conditioning. " +
    "3-4 sets, 10-12 reps, full-body compound focus with light accessories. " +
    "Prioritise movement quality and consistency.",

  hyrox:
    `HYROX / Hybrid Performance Program.

HYROX RACE FORMAT: 8 rounds of (1km run + 1 functional station):
  Station 1: SkiErg 1000m
  Station 2: Sled Push 50m (heavy)
  Station 3: Sled Pull 50m (heavy)
  Station 4: Burpee Broad Jump 80m
  Station 5: Rowing 1000m
  Station 6: Farmer Carry 200m
  Station 7: Sandbag Lunges 100m
  Station 8: Wall Balls 75-100 reps

PROGRAM STRUCTURE — every week must include ALL of these session types:

1. ZONE 2 RUN (1-2x/week)
   - Easy pace (60-70% max HR), 30-60 min
   - Purpose: build aerobic base, fat oxidation
   - Cue: "Should be able to hold a conversation the entire run."

2. STRENGTH SESSION (2x/week) — focus on HYROX-specific movements:
   - Sled Push/Pull (or substitute: Bulgarian Split Squat, Leg Press heavy)
   - Wall Ball (or substitute: Goblet Squat + DB Thruster)
   - Sandbag Lunge (or substitute: Walking Lunge, Barbell Lunge)
   - Farmer Carry (or substitute: Dumbbell Carry, Trap Bar Carry)
   - Rowing Machine or SkiErg intervals
   - Supporting lifts: Deadlift, Hip Thrust, Pull-Up, Row, Push-Up
   - Sets/reps: 4x8-12, 90-120s rest. Emphasise endurance under load.

3. TEMPO / THRESHOLD RUN (1x/week)
   - 20-30 min at 80-85% max HR (uncomfortable but sustainable)
   - Or: 6x800m intervals with 90s rest
   - Purpose: raise lactate threshold, improve race pace

4. BRICK SESSION (1x/week, Weeks 1-2) — introduce race transitions:
   - Alternate short runs (400-800m) with 2-3 HYROX stations back-to-back
   - Example: 800m run → Wall Balls 30 reps → 800m run → Farmer Carry 50m → 800m run
   - Keep rest minimal (30s max between movements)
   - Cue: "Practice transitioning under fatigue. Focus on form, not speed yet."

5. HYROX SIMULATION (progressive % each week) — scale station volume by percentage:
   RACE STATION DISTANCES AT 100%:
   - SkiErg: 1000m | Sled Push: 50m | Sled Pull: 50m | Burpee Broad Jump: 80m
   - Rowing: 1000m | Farmer Carry: 200m | Sandbag Lunges: 100m | Wall Balls: 100 reps

   SCALE BY PERCENTAGE (apply to all station distances/reps):
   - 50% sim: SkiErg 500m, Sled Push 25m, Sled Pull 25m, Burpee BJ 40m, Row 500m, Farmer 100m, Lunge 50m, Wall Ball 50 reps
   - 60% sim: SkiErg 600m, Sled Push 30m, Sled Pull 30m, Burpee BJ 48m, Row 600m, Farmer 120m, Lunge 60m, Wall Ball 60 reps
   - 70% sim: SkiErg 700m, Sled Push 35m, Sled Pull 35m, Burpee BJ 56m, Row 700m, Farmer 140m, Lunge 70m, Wall Ball 70 reps
   - 80% sim: SkiErg 800m, Sled Push 40m, Sled Pull 40m, Burpee BJ 64m, Row 800m, Farmer 160m, Lunge 80m, Wall Ball 80 reps
   - 100% sim: Full race distances — only in Week 4 or final prep week

   FORMAT: 8 rounds of (run + station). Run distance also scales:
   - 50-60% sim: 600m run per round
   - 70-80% sim: 800m run per round
   - 100% sim: 1000m run per round

   NO rest between stations — transition immediately.
   Cue: always include target % and instruction to track total time as race progress benchmark.

   SIMULATION RULES:
   - If SkiErg unavailable → Row same distance
   - If Sled unavailable → Heavy Sled substituted with Prowler / Weighted Sled push
   - Always note equipment substitutions in the cue field

   DISTANCE-BASED EXERCISES — use meters in setsReps field, NOT reps:
   - Farmer Carry → "3 x 40m" NOT "3 x 12"
   - Sandbag Lunge → "3 x 30m" NOT "3 x 20 reps"
   - Sled Push / Sled Pull → "3 x 20m" NOT "3 x 10 reps"
   - Burpee Broad Jump → "3 x 20m" NOT "3 x 10 reps"
   - Any loaded carry or locomotion exercise → always meters

6. RECOVERY / MOBILITY (1x/week if sessions allow):
   - Hip flexor stretch, thoracic rotation, ankle mobility
   - Light row or bike 20 min zone 1

PROGRESSION ACROSS 4 WEEKS:
- Week 1: Base — Brick Session 2-3 stations only, NO simulation. Focus on movement quality and pacing.
- Week 2: Build — Brick Session 4-5 stations. Introduce 50% HYROX Simulation (4 rounds only, scaled distances).
- Week 3: Peak — 70% HYROX Simulation (all 8 rounds, 70% distances). Full strength volume.
- Week 4: Race Prep — 80-100% Full Simulation (all 8 rounds). Reduce strength volume 40%. Prioritise recovery.

EXERCISE NAMING for HYROX sessions: use real station names where possible
(SkiErg, Sled Push, Wall Ball, Farmer Carry, Sandbag Lunge, Burpee Broad Jump, Rowing).
If stations not available, name the substitute clearly in the cue field.`,
};

const HYROX_KEYWORDS = /hyrox|hybrid.?perform|hybrid.?athlet|hybrid.?train|functional.?race|race.?prep|sled.?push|wall.?ball|ski.?erg|skierg|farmer.?carry|sandbag|burpee.?broad/i;

function isHyroxGoal(goalStr, notesStr) {
  return HYROX_KEYWORDS.test(goalStr || "") || HYROX_KEYWORDS.test(notesStr || "");
}

function detectGoal(goalStr, notesStr) {
  if (isHyroxGoal(goalStr, notesStr))              return GOAL_GUIDANCE.hyrox;
  const g = (goalStr || "").toLowerCase();
  if (/fat|loss|lean|cut|recomp/i.test(g))         return GOAL_GUIDANCE.fatLoss;
  if (/muscle|strength|gain|hypertrophy/i.test(g)) return GOAL_GUIDANCE.muscle;
  if (/endurance|conditioning|cardio|run|stamina/i.test(g)) return GOAL_GUIDANCE.endurance;
  return GOAL_GUIDANCE.general;
}

function detectSplit(sessions, goalStr, notesStr) {
  if (isHyroxGoal(goalStr, notesStr)) {
    const hyroxSplits = {
      3: "HYROX 3-day: Day 1 Strength (HYROX stations) | Day 2 Zone 2 Run | Day 3 Brick (Wk1-2) / HYROX Simulation (Wk3-4)",
      4: "HYROX 4-day: Day 1 Strength | Day 2 Zone 2 Run | Day 3 Tempo Run | Day 4 Brick (Wk1-2) / HYROX Simulation (Wk3-4)",
      5: "HYROX 5-day: Day 1 Strength A | Day 2 Zone 2 Run | Day 3 Tempo Run | Day 4 Strength B | Day 5 Brick (Wk1-2) / HYROX Simulation (Wk3-4)",
      6: "HYROX 6-day: Day 1 Strength A | Day 2 Zone 2 | Day 3 Tempo | Day 4 Strength B | Day 5 Brick (Wk1-2) / HYROX Simulation (Wk3-4) | Day 6 Recovery/Mobility",
      7: "HYROX 7-day: Day 1 Strength A | Day 2 Zone 2 | Day 3 Tempo | Day 4 Strength B | Day 5 Brick (Wk1-2) / HYROX Simulation (Wk3-4) | Day 6 Zone 2 Easy | Day 7 Recovery/Mobility",
    };
    return hyroxSplits[sessions] || hyroxSplits[4];
  }
  const splits = {
    3: "Full-Body A/B/C or Push/Pull/Legs",
    4: "Upper/Lower × 2 or Push/Pull/Legs/Full-Body",
    5: "Push/Pull/Legs/Upper/Lower",
    6: "Push/Pull/Legs × 2",
    7: "PPL × 2 + 1 active recovery day",
  };
  return splits[sessions] || splits[3];
}

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

    // ── Goal & split guidance (checks goal + notes for HYROX keywords) ────────
    const goalGuidance = detectGoal(goal, notes);
    const splitGuidance = detectSplit(sessionsPerWeek, goal, notes);

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

SPLIT STRUCTURE
${splitGuidance}

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
- EXERCISE NAMES must be clean standard names ONLY — e.g. "Barbell Back Squat", "Romanian Deadlift", "Dumbbell Row". NEVER append equipment qualifiers like "with a Weighted Vest", "with Resistance Band", "with Kettlebell" to the exercise name. Equipment context belongs in the "cue" field only.
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

    // ── Goal, level & split guidance ─────────────────────────────────────────
    const clientNotes = client.notes || "";
    const goalGuidance = detectGoal(goal, clientNotes);
    const splitGuidance = detectSplit(sessionsPerWeek, goal, clientNotes);
    const levelGuidanceMap = {
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
    const levelGuidance = levelGuidanceMap[level] || levelGuidanceMap["Intermediate"];

    // ── Body composition deep analysis ───────────────────────────────────────
    let assessContext = "";
    if (assessment) {
      const w  = parseFloat(assessment.weight) || null;
      const h  = parseFloat(assessment.height) || null;
      const a  = parseInt(assessment.age)      || null;
      const g  = (assessment.gender || "").toLowerCase();
      const pbf  = parseFloat(assessment.pbf)  || null;  // % body fat
      const smm  = parseFloat(assessment.smm)  || null;  // skeletal muscle mass kg
      const waist = parseFloat(assessment.waist) || null;
      const hip   = parseFloat(assessment.hip)   || null;

      const lines = ["BODY ASSESSMENT (InBody):"];
      lines.push(`- Weight: ${w || "?"}kg | Height: ${h || "?"}cm | Age: ${a || "?"} | Gender: ${assessment.gender || "?"}`);

      // ── BMI ──────────────────────────────────────────────────────────────
      let bmiRule = "";
      if (w && h) {
        const bmi = w / Math.pow(h / 100, 2);
        const bmiR = Math.round(bmi * 10) / 10;
        let bmiCat;
        if      (bmi < 18.5) { bmiCat = "Underweight"; bmiRule = "BMI underweight — prioritise muscle gain, avoid excessive cardio, caloric surplus cues in notes."; }
        else if (bmi < 25)   { bmiCat = "Normal";      bmiRule = "BMI normal — follow stated goal, standard periodisation."; }
        else if (bmi < 30)   { bmiCat = "Overweight";  bmiRule = "BMI overweight — increase metabolic demand, shorter rest (45-60s), add conditioning finisher each session."; }
        else                 { bmiCat = "Obese";        bmiRule = "BMI obese — fat loss priority regardless of stated goal, low-impact exercises, full-body circuits, 15-20 reps, 30-45s rest."; }
        lines.push(`- BMI: ${bmiR} (${bmiCat}) → ${bmiRule}`);
      }

      // ── Body fat % (gender-specific thresholds) ───────────────────────────
      let pbfRule = "";
      if (pbf !== null) {
        const isFemale = g === "female" || g === "nữ";
        let pbfCat;
        if (isFemale) {
          if      (pbf < 18) { pbfCat = "Very lean / athletic";  pbfRule = "Very low body fat (female) — avoid aggressive fat loss, maintain muscle mass focus."; }
          else if (pbf < 28) { pbfCat = "Fit range";             pbfRule = "Healthy body fat (female) — follow stated goal, standard programming."; }
          else if (pbf < 35) { pbfCat = "Above average";         pbfRule = "Elevated body fat (female) — include fat loss conditioning in every session, prioritise compound movements."; }
          else               { pbfCat = "High body fat";          pbfRule = "High body fat (female) — fat loss override, low-impact circuits, progressive cardio, track waist reduction."; }
        } else {
          if      (pbf < 10) { pbfCat = "Very lean / athletic";  pbfRule = "Very low body fat (male) — muscle building focus, avoid cardio overload, caloric surplus cues."; }
          else if (pbf < 20) { pbfCat = "Fit range";             pbfRule = "Healthy body fat (male) — follow stated goal, standard periodisation."; }
          else if (pbf < 25) { pbfCat = "Above average";         pbfRule = "Elevated body fat (male) — add metabolic conditioning, increase daily movement cues in notes."; }
          else               { pbfCat = "High body fat";          pbfRule = "High body fat (male) — fat loss priority, compound movements, HIIT finishers, minimal isolation."; }
        }
        lines.push(`- Body Fat: ${pbf}% (${pbfCat}) → ${pbfRule}`);
      }

      // ── Skeletal Muscle Mass ──────────────────────────────────────────────
      let smmRule = "";
      if (smm !== null && w !== null) {
        const smmRatio = (smm / w) * 100;
        const smmRatioR = Math.round(smmRatio * 10) / 10;
        const isFemale = g === "female" || g === "nữ";
        const lowThreshold = isFemale ? 27 : 33;
        if (smmRatio < lowThreshold) {
          smmRule = `Low muscle mass ratio (${smmRatioR}% of body weight) — increase strength volume, prioritise compound hypertrophy movements, progressive overload is critical.`;
        } else {
          smmRule = `Good muscle mass ratio (${smmRatioR}% of body weight) — maintain muscle, adjust based on goal.`;
        }
        lines.push(`- SMM: ${smm}kg (${smmRatioR}% body weight) → ${smmRule}`);
      }

      // ── Waist-to-Hip ratio ────────────────────────────────────────────────
      if (waist && hip) {
        const whr = Math.round((waist / hip) * 100) / 100;
        const isFemale = g === "female" || g === "nữ";
        const highRisk = isFemale ? whr > 0.85 : whr > 0.9;
        if (highRisk) {
          lines.push(`- Waist/Hip ratio: ${whr} (HIGH cardiovascular risk) → prioritise visceral fat reduction: cardio conditioning, caloric awareness cues in notes.`);
        } else {
          lines.push(`- Waist/Hip ratio: ${whr} (Healthy range)`);
        }
      }

      // ── Age rules ─────────────────────────────────────────────────────────
      if (a) {
        if (a < 25) {
          lines.push(`- Age ${a}: Young — high volume/frequency, fast recovery, can use intensity techniques (drop sets, supersets).`);
        } else if (a <= 40) {
          lines.push(`- Age ${a}: Standard adult — balanced volume and intensity.`);
        } else if (a <= 55) {
          lines.push(`- Age ${a}: 40+ — extend warm-up 10-12 min, extra mobility work, 30s extra rest between sets, avoid high-impact plyometrics, prioritise joint health cues.`);
        } else {
          lines.push(`- Age ${a}: 55+ — CRITICAL: longer warm-up (12-15 min), RPE max 6-7, avoid heavy axial loading, include balance drills, prefer cables/machines over barbell where possible.`);
        }
      }

      assessContext = "\n" + lines.join("\n");
    }

    // ── Checkpoint trend with intelligent analysis ────────────────────────────
    let progressContext = "";
    if (checkpoints.length > 0) {
      const latest = checkpoints[0];
      const oldest = checkpoints[checkpoints.length - 1];
      const dW   = ((latest.weight || 0) - (oldest.weight || 0)).toFixed(1);
      const dPBF = ((latest.pbf   || 0) - (oldest.pbf   || 0)).toFixed(1);
      const dSMM = ((latest.smm   || 0) - (oldest.smm   || 0)).toFixed(1);

      let trend = "";
      const wGain  = parseFloat(dW)   > 0.5;
      const wLoss  = parseFloat(dW)   < -0.5;
      const fatUp  = parseFloat(dPBF) > 0.5;
      const fatDown= parseFloat(dPBF) < -0.5;
      const muUp   = parseFloat(dSMM) > 0.3;
      const muDown = parseFloat(dSMM) < -0.3;

      if (wGain  && fatUp)   trend = "⚠️ Weight up + body fat up — gaining fat, not muscle. INCREASE conditioning volume, REVIEW nutrition cues in program.";
      else if (wGain && fatDown && muUp) trend = "✅ Body recomp working — muscle up, fat down. Continue current approach, increase load progressively.";
      else if (wLoss && fatDown) trend = "✅ Cutting effectively — fat loss on track. Monitor muscle retention; if SMM dropping, add strength volume.";
      else if (wLoss && muDown)  trend = "⚠️ Losing muscle — likely under-eating or over-cardio. REDUCE cardio, ADD strength volume, increase protein cues.";
      else if (muUp  && !fatUp)  trend = "✅ Clean muscle gain. Progressive overload working. Continue and slightly increase intensity.";
      else                       trend = "Stable — limited change. May need a program refresh or increased stimulus.";

      progressContext = `
PROGRESS TREND (${checkpoints.length} checkpoints, ${workoutHistory.length} sessions logged):
- Weight: ${oldest.weight || "?"}kg → ${latest.weight || "?"}kg (${dW > 0 ? "+" : ""}${dW}kg)
- Body Fat: ${oldest.pbf || "?"}% → ${latest.pbf || "?"}% (${dPBF > 0 ? "+" : ""}${dPBF}%)
- Muscle Mass: ${oldest.smm || "?"}kg → ${latest.smm || "?"}kg (${dSMM > 0 ? "+" : ""}${dSMM}kg)
- ANALYSIS: ${trend}`;
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

    // ── HYROX × Body Assessment integration ──────────────────────────────────
    let hyroxBodyContext = "";
    if (isHyroxGoal(goal, clientNotes) && assessment) {
      const w   = parseFloat(assessment.weight) || null;
      const h   = parseFloat(assessment.height) || null;
      const a   = parseInt(assessment.age)      || null;
      const pbf = parseFloat(assessment.pbf)    || null;
      const smm = parseFloat(assessment.smm)    || null;
      const g   = (assessment.gender || "").toLowerCase();
      const rules = [];

      // BMI → adjust run volume & simulation start %
      if (w && h) {
        const bmi = w / Math.pow(h / 100, 2);
        if (bmi >= 30) {
          rules.push("BMI obese: START simulation at 40% (not 50%). Reduce run distance to 400m per round in Weeks 1-2. Prioritise strength base and station technique before adding running volume. Low-impact warm-up mandatory.");
        } else if (bmi >= 25) {
          rules.push("BMI overweight: Start simulation at 50%. Keep run pace conversational (zone 2) for first 2 weeks. Progress to 60% Week 2, 70% Week 3.");
        }
      }

      // Body fat % → running capacity & station endurance
      if (pbf !== null) {
        const isFemale = g === "female" || g === "nữ";
        const highFat = isFemale ? pbf > 30 : pbf > 22;
        const lowFat  = isFemale ? pbf < 18 : pbf < 10;
        if (highFat) {
          rules.push(`Body fat ${pbf}% (elevated): Running will be harder — keep all runs at zone 2 until Week 3. Simulation progression: 40% → 60% → 70% → 80%. Add extra rest (60s) between brick transitions in Week 1.`);
        } else if (lowFat) {
          rules.push(`Body fat ${pbf}% (very lean): High running capacity. Can progress simulation faster: 60% → 70% → 80% → 100%. Prioritise station strength — lean athletes often lack loaded carry endurance.`);
        }
      }

      // SMM → station strength capacity
      if (smm !== null && w !== null) {
        const smmRatio = (smm / w) * 100;
        const isFemale = g === "female" || g === "nữ";
        if (smmRatio < (isFemale ? 27 : 33)) {
          rules.push(`Low muscle mass (SMM ${smm}kg, ${Math.round(smmRatio)}% BW): Station work will be limiting factor. Add 1 extra strength session in Week 1-2 before introducing simulation. Prioritise: Sled Push, Farmer Carry, Wall Ball strength base.`);
        }
      }

      // Age → warm-up, recovery, simulation %
      if (a) {
        if (a >= 45) {
          rules.push(`Age ${a}: Extend pre-run warm-up to 15 min including hip flexor, ankle, and thoracic mobility. Reduce simulation intensity by 10% vs standard (e.g. Week 3 = 60% instead of 70%). Add 90s rest after each simulation round in Week 1-2.`);
        } else if (a >= 35) {
          rules.push(`Age ${a}: 10-min warm-up before all running sessions. Allow 48h between simulation and next hard session.`);
        }
      }

      // Progress trend × HYROX
      if (checkpoints.length > 0) {
        const latest = checkpoints[0];
        const oldest = checkpoints[checkpoints.length - 1];
        const dSMM = (latest.smm || 0) - (oldest.smm || 0);
        const dPBF = (latest.pbf || 0) - (oldest.pbf || 0);
        if (dSMM < -0.5) {
          rules.push("TREND — muscle loss detected: Reduce running volume by 20% this cycle. Add 1 extra strength station session. Protein intake cue in every session note.");
        }
        if (dPBF > 1.5) {
          rules.push("TREND — body fat increasing: Add conditioning finisher (200m row or 500m ski) after each strength session. Progress simulation % aggressively: don't reduce from standard.");
        }
      }

      if (rules.length > 0) {
        hyroxBodyContext = `\nHYROX × BODY ASSESSMENT — THESE RULES OVERRIDE STANDARD SIMULATION PROGRESSION:\n${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
      }
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
${hyroxBodyContext}

GOAL APPROACH:
${goalGuidance}

LEVEL GUIDANCE:
${levelGuidance}

SPLIT STRUCTURE:
${splitGuidance}
${styleContext}

TASK: Generate a 4-week progressive training program that:
1. Continues naturally from where this client left off
2. Follows the GOAL APPROACH and SPLIT STRUCTURE above precisely
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
- Warm-up: 3-4 exercises (adjust duration based on age guidance above)
- Main Lifts: 3-5 compound exercises matching the split focus
- Accessories: 3-5 isolation / support exercises
- Embed 4-week progression in "cue" field (Week 1→4 load/intensity/sets)
- Vary session focus logically across days — do NOT hit the same muscle group two days in a row
- BODY COMPOSITION RULES OVERRIDE GOAL if they conflict (e.g. high BMI overrides "muscle gain" toward conditioning)
- PROGRESS TREND RULES override generic programming — if client is losing muscle, add strength; if gaining fat, add conditioning
- Exercise names must be clean standard names — never append equipment qualifiers
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
    const { name, email, goal, level, sessionsPerWeek, gender, weight, height, age } = request.data || {};

    // Validate required fields
    if (!name || !email || !goal || !level || !sessionsPerWeek) {
      throw new Error("Thiếu thông tin: name, email, goal, level, sessionsPerWeek là bắt buộc.");
    }
    const sessionsParsed = parseInt(sessionsPerWeek);
    if (isNaN(sessionsParsed) || sessionsParsed < 3 || sessionsParsed > 7) {
      throw new Error("Sessions per week must be between 3 and 7.");
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
        note: `Level: ${level} | Sessions/week: ${sessionsPerWeek}${gender ? ` | Gender: ${gender}` : ""}${age ? ` | Age: ${age}` : ""}${weight ? ` | Weight: ${weight}kg` : ""}${height ? ` | Height: ${height}cm` : ""}`,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("[pulseGenerateFree] Could not save lead:", e.message);
    }

    // ── Step 2: Build context ─────────────────────────────────────────────────
    steps.push({ icon: "🎯", text: "Phân tích mục tiêu của bạn..." });

    const sessions = sessionsParsed;
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

    // ── Step 3b: BMI & age analysis ──────────────────────────────────────────
    let bmiContext = "";
    if (weight && height) {
      const bmi = weight / Math.pow(height / 100, 2);
      const bmiRounded = Math.round(bmi * 10) / 10;
      let bmiCategory, bmiRule;
      if (bmi < 18.5) {
        bmiCategory = "Underweight";
        bmiRule =
          "Client is UNDERWEIGHT (BMI " + bmiRounded + "). " +
          "OVERRIDE: Prioritise muscle gain and caloric output even if goal mentions fat loss. " +
          "Avoid excessive cardio. Focus on compound strength movements and high-protein cues. " +
          "Keep rest periods 90-120s to maximise muscle stimulus.";
      } else if (bmi < 25) {
        bmiCategory = "Normal weight";
        bmiRule =
          "Client is at NORMAL weight (BMI " + bmiRounded + "). " +
          "Follow the stated goal without override. Standard periodisation applies.";
      } else if (bmi < 30) {
        bmiCategory = "Overweight";
        bmiRule =
          "Client is OVERWEIGHT (BMI " + bmiRounded + "). " +
          "TUNE: Increase metabolic demand — more compound movements, shorter rest (45-60s), " +
          "add conditioning finisher to every session. " +
          "Even if goal is muscle gain, include 1 cardio/conditioning phase per session.";
      } else {
        bmiCategory = "Obese";
        bmiRule =
          "Client is in OBESE range (BMI " + bmiRounded + "). " +
          "OVERRIDE: Fat loss is the primary objective regardless of stated goal. " +
          "Use low-impact exercises (no jumping, avoid heavy spinal loading). " +
          "Full-body circuits, moderate weights, 15-20 reps, 30-45s rest. " +
          "Build cardiovascular base first. Include a low-intensity cardio phase every session.";
      }
      bmiContext += `\nBODY METRICS:\n- Weight: ${weight}kg | Height: ${height}cm | BMI: ${bmiRounded} (${bmiCategory})\n- ${bmiRule}`;
    } else if (weight) {
      bmiContext += `\nBODY METRICS:\n- Weight: ${weight}kg`;
    }

    let ageContext = "";
    if (age) {
      if (age < 25) {
        ageContext =
          `\nAGE (${age}): Young athlete — can handle high volume and frequency. ` +
          "Fast recovery. Can include more intensity techniques (supersets, drop sets).";
      } else if (age <= 40) {
        ageContext =
          `\nAGE (${age}): Standard adult — balanced volume and intensity. ` +
          "Standard warm-up protocol.";
      } else if (age <= 55) {
        ageContext =
          `\nAGE (${age}): 40+ athlete — extend warm-up to 10-12 min, include extra mobility work. ` +
          "Reduce max-effort frequency. Add 30s extra rest between sets. " +
          "Avoid high-impact plyometrics. Prioritise joint health cues in exercise notes.";
      } else {
        ageContext =
          `\nAGE (${age}): 55+ athlete — CRITICAL: prioritise mobility, balance, and injury prevention. ` +
          "Longer warm-up (12-15 min), lower intensity (RPE 6-7 max), avoid heavy axial loading. " +
          "Include balance drills in warm-up. Rest 2-3 min between sets. " +
          "Prefer machines and cables over free-weight barbells where possible.";
      }
    }

    // ── Step 3b: Goal, level & split guidance (checks goal for HYROX keywords) ─
    const goalGuidance = detectGoal(goal, "");
    const splitGuidance = detectSplit(sessions, goal, "");

    const levelGuidanceMap = {
      Beginner:
        "Beginner: 2-3 sets per exercise, fundamental movement patterns only " +
        "(squat, hinge, push, pull, carry). Emphasise technique over load. " +
        "Longer warm-up, more mobility/activation work. Keep rest 90s+.",
      Intermediate:
        "Intermediate: 3-4 sets, compound + accessory split, moderate complexity. " +
        "Introduce progressive overload across sessions.",
      Advanced:
        "Advanced: 4-5 sets, higher volume, advanced techniques where appropriate " +
        "(tempo, pause reps). Complex periodisation across the week.",
    };
    const levelGuidance = levelGuidanceMap[level] || levelGuidanceMap["Intermediate"];

    // ── Step 4: Load exercise library ───────────────────────────────────────
    steps.push({ icon: "📚", text: "Loading exercise library..." });
    let exerciseLibraryContext = "";
    try {
      const exSnap = await db.collection("exercises").get();
      if (!exSnap.empty) {
        // Group by primary muscle
        const byMuscle = {};
        exSnap.docs.forEach((doc) => {
          const d = doc.data();
          if (!d.name) return;
          let muscle = "General";
          if (d.muscles && typeof d.muscles === "object") {
            const keys = Object.keys(d.muscles);
            if (keys.length > 0) muscle = keys[0];
          }
          if (!byMuscle[muscle]) byMuscle[muscle] = [];
          byMuscle[muscle].push(d.name);
        });

        const lines = Object.entries(byMuscle)
          .map(([m, names]) => `  ${m}: ${names.join(", ")}`)
          .join("\n");

        exerciseLibraryContext = `
EXERCISE LIBRARY — you MUST only pick exercises from this list:
${lines}

CRITICAL: Use ONLY the exact exercise names listed above. Do NOT invent exercises not in this list. Do NOT append equipment modifiers (e.g. "with Weighted Vest") to any name.`;
      } else {
        // Library empty — don't restrict, but still enforce clean naming
        console.warn("[pulseGenerateFree] Exercise library is empty in Firestore.");
        exerciseLibraryContext = `
EXERCISE NAMING RULE: Use standard, clean exercise names only (e.g. "Romanian Deadlift", "Lat Pulldown"). Do NOT append equipment modifiers like "with Weighted Vest" to any exercise name.`;
      }
    } catch (e) {
      // On error — don't restrict, just enforce clean naming
      console.warn("[pulseGenerateFree] Could not load exercise library:", e.message);
      exerciseLibraryContext = `
EXERCISE NAMING RULE: Use standard, clean exercise names only. Do NOT append equipment modifiers to exercise names.`;
    }

    // ── Step 5: Build prompt ─────────────────────────────────────────────────
    steps.push({ icon: "⚡", text: "Pulse đang tạo chương trình 1 tuần..." });

    const physicalContext = (gender || weight || height || age)
      ? `\nPHYSICAL INFO:${gender ? `\n- Gender: ${gender}` : ""}${age ? `\n- Age: ${age}` : ""}${weight ? `\n- Weight: ${weight}kg` : ""}${height ? `\n- Height: ${height}cm` : ""}`
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
${bmiContext}${ageContext}

GOAL APPROACH:
${goalGuidance}

LEVEL GUIDANCE:
${levelGuidance}

SPLIT STRUCTURE:
${splitGuidance}
${exerciseLibraryContext}
${styleContext}

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
- Warm-up: 3-4 exercises (mobility, activation — not heavy)
- Main Lifts: 3-5 compound exercises matching the split focus
- Accessories: 3-5 isolation / support exercises
- Sets/reps must match the level and goal guidance above
- Vary session focus logically across the week — do NOT repeat the same muscle group two days in a row
- Exercise names must be clean standard names — NEVER append equipment qualifiers to the name
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
