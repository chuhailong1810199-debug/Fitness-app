import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, Alert, Animated, Modal, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/colors';
import { Card, ProgressBar, PrimaryButton, Divider } from '../components/UI';
import { WORKOUT_PLANS } from '../data/workoutData';
import {
  addSession, updatePRsFromSession, getPRs,
  getPreviousSession, detectNewPRs,
  toDateStr, toDateLabel, getUserProfile,
} from '../services/storage';

// ── In-Workout Rest Timer ─────────────────────────────────────────────────────
function InWorkoutTimer({ visible, totalSeconds, onDismiss, onGoToTimer }) {
  const [left, setLeft] = useState(totalSeconds);
  const opacity = useRef(new Animated.Value(0)).current;
  const intervalRef = useRef(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 120,
      useNativeDriver: true,
    }).start();
    if (visible) {
      setLeft(totalSeconds);
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            Vibration.vibrate([0, 200, 100, 200]);
            onDismissRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [visible, totalSeconds]);

  if (!visible) return null;
  const pct = Math.round(((totalSeconds - left) / totalSeconds) * 100);
  const mins = Math.floor(left / 60);
  const secs = left % 60;
  const timeStr = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${left}s`;

  return (
    <Animated.View style={[styles.restTimer, { opacity }]}>
      <Text style={styles.restTimerTime}>{timeStr}</Text>
      <View style={styles.restTimerBarBg}>
        <View style={[styles.restTimerBarFill, { width: `${pct}%` }]} />
      </View>
      <View style={styles.restTimerBtns}>
        <TouchableOpacity style={styles.restTimerSkip} onPress={onDismiss} activeOpacity={0.7}>
          <Text style={styles.restTimerSkipText}>Bỏ qua</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.restTimerFull} onPress={onGoToTimer} activeOpacity={0.7}>
          <Text style={styles.restTimerFullText}>⏱ Đầy đủ</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ── Post-Workout Summary Modal ───────────────────────────────────────────────
function SummaryModal({ visible, summary, onClose }) {
  if (!summary) return null;
  const volumeDelta = summary.prevVolume != null
    ? Math.round(summary.totalVolume - summary.prevVolume)
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sumStyles.overlay}>
        <View style={sumStyles.card}>
          <Text style={sumStyles.title}>🎉 Hoàn thành!</Text>
          <Text style={sumStyles.planName}>{summary.planName}</Text>

          {/* Key stats */}
          <View style={sumStyles.statsRow}>
            <View style={sumStyles.statBox}>
              <Text style={sumStyles.statVal}>{summary.totalSets}</Text>
              <Text style={sumStyles.statLbl}>sets</Text>
            </View>
            <View style={sumStyles.statBox}>
              <Text style={sumStyles.statVal}>{summary.totalVolume.toLocaleString()}</Text>
              <Text style={sumStyles.statLbl}>kg tổng</Text>
            </View>
            <View style={sumStyles.statBox}>
              <Text style={sumStyles.statVal}>{summary.duration}</Text>
              <Text style={sumStyles.statLbl}>thời gian</Text>
            </View>
          </View>

          {/* Volume vs previous */}
          {volumeDelta !== null && (
            <View style={[
              sumStyles.deltaBadge,
              { backgroundColor: volumeDelta >= 0 ? 'rgba(200,255,87,0.12)' : 'rgba(255,87,87,0.1)' },
            ]}>
              <Text style={[sumStyles.deltaText, { color: volumeDelta >= 0 ? COLORS.accent : COLORS.red }]}>
                {volumeDelta >= 0 ? '↑' : '↓'} {Math.abs(volumeDelta).toLocaleString()} kg so với lần trước
              </Text>
            </View>
          )}

          {/* New PRs */}
          {summary.newPRs.length > 0 && (
            <>
              <View style={sumStyles.prHeader}>
                <Text style={sumStyles.prHeaderText}>🏆 Kỷ lục mới!</Text>
              </View>
              {summary.newPRs.map((pr, i) => (
                <View key={i} style={sumStyles.prRow}>
                  <Text style={sumStyles.prName}>{pr.name}</Text>
                  <Text style={sumStyles.prVal}>{pr.newWeight} kg</Text>
                  {pr.prevWeight != null && (
                    <Text style={sumStyles.prPrev}>↑ từ {pr.prevWeight} kg</Text>
                  )}
                </View>
              ))}
            </>
          )}

          {/* Intensity */}
          {summary.intensity != null && (
            <View style={sumStyles.intensityRow}>
              <Text style={sumStyles.intensityText}>
                {INTENSITY_OPTIONS.find(o => o.value === summary.intensity)?.emoji}{' '}
                {INTENSITY_OPTIONS.find(o => o.value === summary.intensity)?.label}
              </Text>
            </View>
          )}

          {/* Note */}
          {!!summary.note && (
            <View style={sumStyles.noteBox}>
              <Text style={sumStyles.noteText}>"{summary.note}"</Text>
            </View>
          )}

          <TouchableOpacity style={sumStyles.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={sumStyles.closeBtnText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function WorkoutScreen({ route, navigation }) {
  const planIndex = route?.params?.planIndex ?? 0;
  const plan = WORKOUT_PLANS[planIndex];

  const [setsData, setSetsData] = useState(() => buildInitSets(plan));
  const [completed, setCompleted] = useState({});
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [defaultRestSecs, setDefaultRestSecs] = useState(60);
  const [prevSession, setPrevSession] = useState(null);
  const [prs, setPRsState] = useState({});
  const [summary, setSummary] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const [sessionNote, setSessionNote] = useState('');
  const [intensity, setIntensity] = useState(3); // 1–5
  const [extraSets, setExtraSets] = useState({}); // { [ei]: count }
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const startTimeRef = useRef(Date.now());

  // Load previous session, profile, and reset state on plan change
  useEffect(() => {
    setSetsData(buildInitSets(plan));
    setCompleted({});
    setShowRestTimer(false);
    setSummary(null);
    setShowSummary(false);
    setSessionNote('');
    setIntensity(3);
    setExtraSets({});
    setElapsedSecs(0);
    startTimeRef.current = Date.now();
    getPreviousSession(plan.id).then(setPrevSession);
    getUserProfile().then(p => setDefaultRestSecs(p.defaultRestSeconds ?? 60));
    getPRs().then(setPRsState);
  }, [planIndex]);

  // Live elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSecs(Math.round((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-fill weights/reps from previous session
  useEffect(() => {
    if (!prevSession) return;
    setSetsData(prev => {
      const next = { ...prev };
      prevSession.exercises.forEach((ex, ei) => {
        ex.sets.forEach((set, si) => {
          const key = `${ei}-${si}`;
          if (set.done && parseFloat(set.weight) > 0) {
            next[key] = { weight: set.weight, reps: set.reps };
          }
        });
      });
      return next;
    });
  }, [prevSession]);

  const totalSets = plan.exercises.reduce((a, e, ei) => a + e.sets.length + (extraSets[ei] || 0), 0);
  const doneSets = Object.values(completed).filter(Boolean).length;
  const percent = Math.round((doneSets / totalSets) * 100);

  function toggleSet(key) {
    const wasCompleted = !!completed[key];
    setCompleted(prev => ({ ...prev, [key]: !prev[key] }));
    if (!wasCompleted) {
      Vibration.vibrate(40);
      setShowRestTimer(true);
    } else {
      setShowRestTimer(false);
    }
  }

  function updateField(key, field, value) {
    setSetsData(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function addSet(ei) {
    const totalForEx = plan.exercises[ei].sets.length + (extraSets[ei] || 0);
    const lastKey = `${ei}-${totalForEx - 1}`;
    const seed = setsData[lastKey] ?? { weight: '0', reps: '0' };
    const newKey = `${ei}-${totalForEx}`;
    setSetsData(prev => ({ ...prev, [newKey]: { ...seed } }));
    setExtraSets(prev => ({ ...prev, [ei]: (prev[ei] || 0) + 1 }));
  }

  function removeLastSet(ei) {
    if ((extraSets[ei] || 0) === 0) return;
    const totalForEx = plan.exercises[ei].sets.length + (extraSets[ei] || 0);
    const lastKey = `${ei}-${totalForEx - 1}`;
    if (completed[lastKey]) return; // don't remove a done set
    setSetsData(prev => { const n = { ...prev }; delete n[lastKey]; return n; });
    setCompleted(prev => { const n = { ...prev }; delete n[lastKey]; return n; });
    setExtraSets(prev => ({ ...prev, [ei]: (prev[ei] || 0) - 1 }));
  }

  // Build exercise/set objects for saving (includes extra sets)
  function buildSessionExercises() {
    return plan.exercises.map((ex, ei) => {
      const total = ex.sets.length + (extraSets[ei] || 0);
      return {
        name: ex.name,
        nameVi: ex.nameVi,
        sets: Array.from({ length: total }, (_, si) => {
          const key = `${ei}-${si}`;
          return {
            weight: setsData[key]?.weight ?? '0',
            reps: setsData[key]?.reps ?? '0',
            done: !!completed[key],
          };
        }),
      };
    });
  }

  async function finishAndSave() {
    const now = new Date();
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
    const exercises = buildSessionExercises();

    let totalVolume = 0;
    exercises.forEach(ex => {
      ex.sets.forEach(s => {
        if (s.done) totalVolume += (parseFloat(s.weight) || 0) * (parseInt(s.reps, 10) || 0);
      });
    });

    const session = {
      id: String(Date.now()),
      planId: plan.id,
      planName: plan.nameVi,
      planColor: plan.color,
      planBorderColor: plan.borderColor,
      date: toDateStr(now),
      dateLabel: toDateLabel(now),
      exercises,
      totalSets: doneSets,
      totalVolume: Math.round(totalVolume),
      durationSeconds,
      note: sessionNote.trim(),
      intensity,
    };

    // Capture PRs before updating so detectNewPRs can compare
    const existingPRs = await getPRs();
    const newPRs = detectNewPRs(session, existingPRs);
    await addSession(session);
    const updatedPRs = await updatePRsFromSession(session);
    setPRsState(updatedPRs);

    const mins = Math.round(durationSeconds / 60);
    const durationLabel = mins < 60 ? `${mins} ph` : `${Math.floor(mins / 60)}h ${mins % 60}ph`;

    setSummary({
      planName: plan.nameVi,
      totalSets: doneSets,
      totalVolume: Math.round(totalVolume),
      duration: durationLabel,
      prevVolume: prevSession?.totalVolume ?? null,
      newPRs,
      intensity,
      note: sessionNote.trim(),
    });
    setShowSummary(true);
  }

  async function handleFinish() {
    if (percent < 100) {
      Alert.alert(
        'Chưa hoàn thành',
        `Bạn mới hoàn thành ${doneSets}/${totalSets} set. Kết thúc sớm?`,
        [
          { text: 'Tiếp tục tập', style: 'cancel' },
          { text: 'Kết thúc', style: 'destructive', onPress: finishAndSave },
        ]
      );
    } else {
      await finishAndSave();
    }
  }

  // Previous session lookup helpers
  function getPrevSet(exIdx, setIdx) {
    if (!prevSession) return null;
    const ex = prevSession.exercises?.[exIdx];
    return ex?.sets?.[setIdx] ?? null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <InWorkoutTimer
        visible={showRestTimer}
        totalSeconds={defaultRestSecs}
        onDismiss={() => setShowRestTimer(false)}
        onGoToTimer={() => { setShowRestTimer(false); navigation.navigate('Timer'); }}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{plan.nameVi}</Text>
            <Text style={styles.subtitle}>{plan.exercises.length} bài · {plan.duration}</Text>
          </View>
          <Text style={styles.elapsed}>
            {Math.floor(elapsedSecs / 60)}:{String(elapsedSecs % 60).padStart(2, '0')}
          </Text>
        </View>

        {/* Progress */}
        <View style={styles.progressRow}>
          <ProgressBar percent={percent} />
          <Text style={styles.progressLabel}>{percent}%</Text>
        </View>

        {/* Exercises */}
        {plan.exercises.map((ex, ei) => (
          <Card key={ex.id} style={styles.exCard}>
            <View style={styles.exHeader}>
              <View>
                <Text style={styles.exName}>{ex.nameVi}</Text>
                <Text style={styles.exNameEn}>{ex.name}</Text>
              </View>
              {prevSession && (
                <View style={styles.prevBadge}>
                  <Text style={styles.prevBadgeText}>Lần trước</Text>
                </View>
              )}
            </View>

            {/* Column headers */}
            <View style={styles.setHeader}>
              <Text style={[styles.setHeaderText, { width: 24 }]}>#</Text>
              <Text style={[styles.setHeaderText, styles.inputCol]}>KG</Text>
              <Text style={[styles.setHeaderText, styles.inputCol]}>REPS</Text>
              {prevSession && (
                <Text style={[styles.setHeaderText, styles.prevCol]}>TRƯỚC</Text>
              )}
              <Text style={[styles.setHeaderText, { width: 32, textAlign: 'center' }]}>✓</Text>
            </View>

            {Array.from({ length: ex.sets.length + (extraSets[ei] || 0) }, (_, si) => {
              const key = `${ei}-${si}`;
              const isDone = completed[key];
              const prev = getPrevSet(ei, si);
              const enteredW = parseFloat(setsData[key]?.weight) || 0;
              const existingPR = prs[ex.name]?.weight ?? 0;
              const isNewPR = enteredW > 0 && enteredW > existingPR;
              const isExtra = si >= ex.sets.length;
              return (
                <View key={si} style={[styles.setRow, isDone && styles.setRowDone]}>
                  <Text style={[styles.setNum, isExtra && styles.setNumExtra]}>{si + 1}</Text>
                  <TextInput
                    style={[styles.input, isDone && styles.inputDone]}
                    value={setsData[key]?.weight}
                    onChangeText={v => updateField(key, 'weight', v)}
                    keyboardType="numeric"
                    editable={!isDone}
                    selectTextOnFocus
                  />
                  <TextInput
                    style={[styles.input, isDone && styles.inputDone]}
                    value={setsData[key]?.reps}
                    onChangeText={v => updateField(key, 'reps', v)}
                    keyboardType="numeric"
                    editable={!isDone}
                    selectTextOnFocus
                  />
                  {prevSession && (
                    <View style={styles.prevCell}>
                      {prev?.done ? (
                        <Text style={styles.prevText}>{prev.weight}×{prev.reps}</Text>
                      ) : (
                        <Text style={[styles.prevText, { color: '#333' }]}>—</Text>
                      )}
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.checkBtn, isDone && styles.checkBtnDone]}
                    onPress={() => toggleSet(key)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: isDone ? '#0f0f0f' : COLORS.muted, fontSize: 14 }}>
                      {isDone ? '✓' : '○'}
                    </Text>
                  </TouchableOpacity>
                  {isNewPR && (
                    <View style={styles.prLiveBadge}>
                      <Text style={styles.prLiveBadgeText}>PR</Text>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Add / Remove set buttons */}
            <View style={styles.setActionsRow}>
              <TouchableOpacity
                style={styles.setActionBtn}
                onPress={() => addSet(ei)}
                activeOpacity={0.7}
              >
                <Text style={styles.setActionText}>+ Set</Text>
              </TouchableOpacity>
              {(extraSets[ei] || 0) > 0 && (
                <TouchableOpacity
                  style={[styles.setActionBtn, styles.setActionBtnRemove]}
                  onPress={() => removeLastSet(ei)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.setActionText, { color: COLORS.muted }]}>− Set</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>
        ))}

        {/* Session Note + Intensity */}
        <Card style={styles.noteCard}>
          <Text style={styles.noteLabel}>Cảm nhận buổi tập</Text>
          <View style={styles.intensityRow}>
            {INTENSITY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.intensityBtn, intensity === opt.value && styles.intensityBtnActive]}
                onPress={() => setIntensity(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={styles.intensityEmoji}>{opt.emoji}</Text>
                <Text style={[styles.intensityLabel, intensity === opt.value && styles.intensityLabelActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.noteInput}
            value={sessionNote}
            onChangeText={setSessionNote}
            placeholder="Ghi chú buổi tập (không bắt buộc)…"
            placeholderTextColor={COLORS.muted}
            multiline
            numberOfLines={3}
            maxLength={300}
          />
        </Card>

        {/* Finish Button */}
        <PrimaryButton
          label={`Kết thúc (${doneSets}/${totalSets} set)`}
          onPress={handleFinish}
          style={{ marginBottom: 24 }}
        />

        <View style={{ height: 20 }} />
      </ScrollView>

      <SummaryModal
        visible={showSummary}
        summary={summary}
        onClose={() => setShowSummary(false)}
      />
    </SafeAreaView>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const INTENSITY_OPTIONS = [
  { value: 1, emoji: '😴', label: 'Nhẹ' },
  { value: 2, emoji: '😊', label: 'Ổn' },
  { value: 3, emoji: '💪', label: 'Tốt' },
  { value: 4, emoji: '🔥', label: 'Khó' },
  { value: 5, emoji: '⚡', label: 'Max' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildInitSets(plan) {
  const init = {};
  plan.exercises.forEach((ex, ei) => {
    ex.sets.forEach((s, si) => {
      init[`${ei}-${si}`] = { weight: String(s.weight), reps: String(s.reps) };
    });
  });
  return init;
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.white },
  subtitle: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  elapsed: { fontSize: 18, fontWeight: '700', color: COLORS.muted, paddingTop: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  progressLabel: { fontSize: 12, color: COLORS.accent, minWidth: 36, textAlign: 'right' },
  exCard: { marginBottom: 14 },
  exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  exName: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  exNameEn: { fontSize: 12, color: COLORS.muted, marginTop: 1 },
  prevBadge: {
    backgroundColor: 'rgba(255,184,71,0.12)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
  },
  prevBadgeText: { color: COLORS.amber, fontSize: 10, fontWeight: '700' },
  setHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  setHeaderText: { fontSize: 10, color: '#444', fontWeight: '700', letterSpacing: 0.5 },
  inputCol: { width: 60, textAlign: 'center' },
  prevCol: { flex: 1, textAlign: 'center' },
  setRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 8, padding: 6, borderRadius: 10,
  },
  setRowDone: { opacity: 0.5 },
  setNum: { color: '#444', fontSize: 13, width: 24 },
  setNumExtra: { color: COLORS.amber },
  setActionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  setActionBtn: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
    borderWidth: 0.5, borderColor: 'rgba(200,255,87,0.3)',
    backgroundColor: 'rgba(200,255,87,0.06)',
  },
  setActionBtnRemove: {
    borderColor: COLORS.border, backgroundColor: 'transparent',
  },
  setActionText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },
  input: {
    width: 60, height: 36,
    backgroundColor: COLORS.cardDark,
    borderRadius: 8, borderWidth: 0.5, borderColor: COLORS.border,
    color: COLORS.white, textAlign: 'center', fontSize: 14,
  },
  inputDone: { opacity: 0.4 },
  prevCell: { flex: 1, alignItems: 'center' },
  prevText: { color: COLORS.muted, fontSize: 11, fontWeight: '500' },
  checkBtn: {
    width: 32, height: 32, borderRadius: 8,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkBtnDone: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  prLiveBadge: {
    backgroundColor: 'rgba(255,184,71,0.18)',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    borderWidth: 0.5, borderColor: 'rgba(255,184,71,0.5)',
  },
  prLiveBadgeText: { color: COLORS.amber, fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  // Note + intensity card
  noteCard: { marginBottom: 16 },
  noteLabel: { color: COLORS.white, fontWeight: '700', fontSize: 14, marginBottom: 12 },
  intensityRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  intensityBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: 'transparent',
  },
  intensityBtnActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(200,255,87,0.1)' },
  intensityEmoji: { fontSize: 20 },
  intensityLabel: { fontSize: 10, color: COLORS.muted, marginTop: 3, fontWeight: '500' },
  intensityLabelActive: { color: COLORS.accent },
  noteInput: {
    backgroundColor: COLORS.cardDark, borderRadius: 10,
    borderWidth: 0.5, borderColor: COLORS.border,
    color: COLORS.white, fontSize: 14, padding: 12,
    minHeight: 72, textAlignVertical: 'top',
  },

  // In-workout rest timer
  restTimer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(22,22,22,0.97)',
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
    paddingHorizontal: 16, paddingVertical: 10, gap: 10,
  },
  restTimerTime: { fontSize: 22, fontWeight: '800', color: COLORS.accent, minWidth: 46 },
  restTimerBarBg: { flex: 1, height: 4, backgroundColor: COLORS.border, borderRadius: 2 },
  restTimerBarFill: { height: 4, backgroundColor: COLORS.accent, borderRadius: 2 },
  restTimerBtns: { flexDirection: 'row', gap: 6 },
  restTimerSkip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 0.5, borderColor: COLORS.border,
  },
  restTimerSkipText: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  restTimerFull: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, backgroundColor: 'rgba(200,255,87,0.12)',
  },
  restTimerFullText: { color: COLORS.accent, fontSize: 11, fontWeight: '600' },
});

// Summary modal styles
const sumStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, paddingBottom: 44,
    borderTopWidth: 0.5, borderColor: COLORS.border,
  },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.white, textAlign: 'center', marginBottom: 4 },
  planName: { fontSize: 14, color: COLORS.muted, textAlign: 'center', marginBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, alignItems: 'center',
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  statVal: { fontSize: 22, fontWeight: '800', color: COLORS.white },
  statLbl: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  deltaBadge: {
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 12, marginBottom: 16, alignItems: 'center',
  },
  deltaText: { fontWeight: '700', fontSize: 13 },
  prHeader: { marginBottom: 10, marginTop: 4 },
  prHeaderText: { color: COLORS.amber, fontWeight: '700', fontSize: 15 },
  prRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  prName: { flex: 1, color: COLORS.white, fontSize: 13 },
  prVal: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
  prPrev: { color: COLORS.muted, fontSize: 11 },
  intensityRow: {
    alignItems: 'center', marginBottom: 12,
  },
  intensityText: { color: COLORS.mutedLight, fontSize: 15 },
  noteBox: {
    backgroundColor: COLORS.card, borderRadius: 12,
    padding: 12, marginBottom: 12,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  noteText: { color: COLORS.mutedLight, fontSize: 13, fontStyle: 'italic', lineHeight: 20 },
  closeBtn: {
    marginTop: 16, backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  closeBtnText: { color: '#0f0f0f', fontWeight: '700', fontSize: 16 },
});
