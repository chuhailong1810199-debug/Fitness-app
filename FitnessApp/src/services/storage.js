import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSIONS_KEY = 'ftn_sessions';
const PRS_KEY = 'ftn_personal_records';
const BODY_WEIGHT_KEY = 'ftn_body_weight';

// ── Sessions ──────────────────────────────────────────
// Session shape:
// {
//   id: string,
//   planId: number,
//   planName: string,       // Vietnamese display name
//   planColor: string,      // hex/rgba for UI
//   date: string,           // ISO date string (YYYY-MM-DD)
//   dateLabel: string,      // e.g. '17/4'
//   exercises: [{ name, nameVi, sets: [{ weight, reps, done }] }],
//   totalSets: number,
//   totalVolume: number,    // sum of weight*reps for completed sets
//   durationSeconds: number,
// }

export async function getSessions() {
  try {
    const json = await AsyncStorage.getItem(SESSIONS_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

export async function addSession(session) {
  const sessions = await getSessions();
  sessions.unshift(session); // newest first
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  return sessions;
}

// ── Personal Records ──────────────────────────────────
// PR shape: { [exerciseName]: { weight: number, reps: number, date: string } }

export async function getPRs() {
  try {
    const json = await AsyncStorage.getItem(PRS_KEY);
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}

export async function updatePRsFromSession(session) {
  const prs = await getPRs();
  session.exercises.forEach(ex => {
    ex.sets.forEach(set => {
      if (!set.done) return;
      const w = parseFloat(set.weight) || 0;
      if (w <= 0) return;
      const existing = prs[ex.name];
      if (!existing || w > existing.weight) {
        prs[ex.name] = {
          weight: w,
          reps: parseInt(set.reps, 10) || 0,
          date: session.dateLabel,
        };
      }
    });
  });
  await AsyncStorage.setItem(PRS_KEY, JSON.stringify(prs));
  return prs;
}

// ── Derived Stats ─────────────────────────────────────

/** Returns sessions from the last N days, keyed by YYYY-MM-DD */
export function groupSessionsByDate(sessions) {
  const map = {};
  sessions.forEach(s => {
    const d = s.date;
    if (!map[d]) map[d] = [];
    map[d].push(s);
  });
  return map;
}

/** Returns current streak (consecutive training days ending today or yesterday) */
export function computeStreak(sessions) {
  if (!sessions.length) return 0;
  const byDate = groupSessionsByDate(sessions);
  const today = toDateStr(new Date());
  let streak = 0;
  let cursor = new Date();
  // Allow streak to still count if last session was yesterday
  if (!byDate[today]) cursor.setDate(cursor.getDate() - 1);
  while (true) {
    const key = toDateStr(cursor);
    if (!byDate[key]) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Returns weekly sets data for the past 7 days */
export function computeWeeklyData(sessions) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const byDate = groupSessionsByDate(sessions);
  return days.map(d => {
    const key = toDateStr(d);
    const daySessions = byDate[key] || [];
    const sets = daySessions.reduce((sum, s) => sum + (s.totalSets || 0), 0);
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return {
      day: dayNames[d.getDay()],
      date: `${d.getDate()}/${d.getMonth() + 1}`,
      sets,
    };
  });
}

/** Compute lifetime stats from sessions */
export function computeLifetimeStats(sessions) {
  const totalSessions = sessions.length;
  const totalVolume = sessions.reduce((sum, s) => sum + (s.totalVolume || 0), 0);
  const totalDurationSeconds = sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
  const streak = computeStreak(sessions);
  const totalHours = Math.round(totalDurationSeconds / 3600);
  const volumeLabel = totalVolume >= 1000
    ? `${Math.round(totalVolume / 1000)}k`
    : String(totalVolume);
  return { totalSessions, totalVolume, volumeLabel, totalHours, streak };
}

/**
 * Returns the most recent saved session for a given planId,
 * or null if the plan has never been completed before.
 */
export async function getPreviousSession(planId) {
  const sessions = await getSessions();
  return sessions.find(s => s.planId === planId) ?? null;
}

/**
 * Given the current session and the previous session for the same plan,
 * returns a list of PRs that were broken: [{ name, newWeight, prevWeight }]
 */
export function detectNewPRs(session, existingPRs) {
  const broken = [];
  session.exercises.forEach(ex => {
    ex.sets.forEach(set => {
      if (!set.done) return;
      const w = parseFloat(set.weight) || 0;
      if (w <= 0) return;
      const prev = existingPRs[ex.name];
      if (!prev || w > prev.weight) {
        // Only report the highest new weight per exercise
        const existing = broken.find(b => b.name === ex.name);
        if (!existing || w > existing.newWeight) {
          if (!existing) {
            broken.push({ name: ex.name, newWeight: w, prevWeight: prev?.weight ?? null });
          } else {
            existing.newWeight = w;
          }
        }
      }
    });
  });
  return broken;
}

/** Returns sessions within the last 7 days only */
export function getThisWeekSessions(sessions) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 6);
  cutoff.setHours(0, 0, 0, 0);
  return sessions.filter(s => new Date(s.date) >= cutoff);
}

/**
 * Returns weekly volume totals for the past numWeeks calendar weeks (Mon–Sun).
 * Each item: { label: string, volume: number, sessionCount: number }
 */
export function computeWeeklyVolumeHistory(sessions, numWeeks = 6) {
  const result = [];
  const now = new Date();
  // Anchor to start of current week (Monday)
  const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - dayOfWeek);
  thisMonday.setHours(0, 0, 0, 0);

  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekStart = new Date(thisMonday);
    weekStart.setDate(thisMonday.getDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const weekSessions = sessions.filter(s => {
      const d = new Date(s.date);
      return d >= weekStart && d < weekEnd;
    });

    const volume = weekSessions.reduce((sum, s) => sum + (s.totalVolume || 0), 0);
    const label = i === 0
      ? 'T.này'
      : `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
    result.push({ label, volume, sessionCount: weekSessions.length });
  }
  return result;
}

/**
 * Returns the most recent session date for each planId.
 * Result: { [planId]: dateLabel }
 */
export function getLastSessionByPlan(sessions) {
  const map = {};
  sessions.forEach(s => {
    if (!map[s.planId]) map[s.planId] = s.dateLabel;
  });
  return map;
}

// ── Helpers ───────────────────────────────────────────

export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toDateLabel(date) {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function formatVolume(kg) {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}k kg`;
  return `${kg} kg`;
}

// ── Body Weight Log ───────────────────────────────────
// Entry shape: { id: string, date: string (YYYY-MM-DD), dateLabel: string, weight: number }

export async function getBodyWeightLog() {
  try {
    const json = await AsyncStorage.getItem(BODY_WEIGHT_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

export async function addBodyWeightEntry(weightKg) {
  const entries = await getBodyWeightLog();
  const now = new Date();
  const entry = {
    id: String(Date.now()),
    date: toDateStr(now),
    dateLabel: toDateLabel(now),
    weight: Math.round(weightKg * 10) / 10, // 1 decimal
  };
  // Replace today's entry if it already exists
  const filtered = entries.filter(e => e.date !== entry.date);
  filtered.unshift(entry);
  await AsyncStorage.setItem(BODY_WEIGHT_KEY, JSON.stringify(filtered));
  return filtered;
}

/** Returns last N body weight entries sorted newest-first */
export function getRecentWeightEntries(entries, n = 10) {
  return entries.slice(0, n);
}

/** Compute weight trend: difference between latest and the entry 7 days before */
export function computeWeightTrend(entries) {
  if (entries.length < 2) return null;
  const latest = entries[0].weight;
  const ref = entries[entries.length - 1].weight;
  return Math.round((latest - ref) * 10) / 10;
}
