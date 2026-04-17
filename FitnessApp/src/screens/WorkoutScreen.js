import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, Alert, Animated, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/colors';
import { Card, ProgressBar, PrimaryButton, Divider } from '../components/UI';
import { WORKOUT_PLANS } from '../data/workoutData';
import {
  addSession, updatePRsFromSession, getPRs,
  getPreviousSession, detectNewPRs,
  toDateStr, toDateLabel,
} from '../services/storage';

// ── Rest Timer Banner ────────────────────────────────────────────────────────
function RestTimerBanner({ visible, onStart, onDismiss }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef(null);

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(onDismiss, 8000);
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      clearTimeout(dismissTimer.current);
    }
    return () => clearTimeout(dismissTimer.current);
  }, [visible]);

  if (!visible) return null;
  return (
    <Animated.View style={[styles.restBanner, { opacity }]}>
      <Text style={styles.restBannerText}>⏱ Bắt đầu nghỉ?</Text>
      <TouchableOpacity style={styles.restBannerBtn} onPress={onStart} activeOpacity={0.8}>
        <Text style={styles.restBannerBtnText}>Bắt đầu 60s</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} style={{ paddingHorizontal: 8 }}>
        <Text style={{ color: COLORS.muted, fontSize: 18 }}>×</Text>
      </TouchableOpacity>
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
  const [showRestBanner, setShowRestBanner] = useState(false);
  const [prevSession, setPrevSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const startTimeRef = useRef(Date.now());

  // Load previous session and reset state on plan change
  useEffect(() => {
    setSetsData(buildInitSets(plan));
    setCompleted({});
    setShowRestBanner(false);
    setSummary(null);
    setShowSummary(false);
    startTimeRef.current = Date.now();
    getPreviousSession(plan.id).then(setPrevSession);
  }, [planIndex]);

  const totalSets = plan.exercises.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = Object.values(completed).filter(Boolean).length;
  const percent = Math.round((doneSets / totalSets) * 100);

  function toggleSet(key) {
    const wasCompleted = !!completed[key];
    setCompleted(prev => ({ ...prev, [key]: !prev[key] }));
    if (!wasCompleted) setShowRestBanner(true);
  }

  function updateField(key, field, value) {
    setSetsData(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function handleStartRestTimer() {
    setShowRestBanner(false);
    navigation.navigate('Timer');
  }

  // Build exercise/set objects for saving
  function buildSessionExercises() {
    return plan.exercises.map((ex, ei) => ({
      name: ex.name,
      nameVi: ex.nameVi,
      sets: ex.sets.map((_, si) => {
        const key = `${ei}-${si}`;
        return {
          weight: setsData[key]?.weight ?? '0',
          reps: setsData[key]?.reps ?? '0',
          done: !!completed[key],
        };
      }),
    }));
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
    };

    // Capture PRs before updating so detectNewPRs can compare
    const existingPRs = await getPRs();
    const newPRs = detectNewPRs(session, existingPRs);
    await addSession(session);
    await updatePRsFromSession(session);

    const mins = Math.round(durationSeconds / 60);
    const durationLabel = mins < 60 ? `${mins} ph` : `${Math.floor(mins / 60)}h ${mins % 60}ph`;

    setSummary({
      planName: plan.nameVi,
      totalSets: doneSets,
      totalVolume: Math.round(totalVolume),
      duration: durationLabel,
      prevVolume: prevSession?.totalVolume ?? null,
      newPRs,
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
      <RestTimerBanner
        visible={showRestBanner}
        onStart={handleStartRestTimer}
        onDismiss={() => setShowRestBanner(false)}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{plan.nameVi}</Text>
          <Text style={styles.subtitle}>{plan.exercises.length} bài · {plan.duration}</Text>
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

            {ex.sets.map((_, si) => {
              const key = `${ei}-${si}`;
              const isDone = completed[key];
              const prev = getPrevSet(ei, si);
              return (
                <View key={si} style={[styles.setRow, isDone && styles.setRowDone]}>
                  <Text style={styles.setNum}>{si + 1}</Text>
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
                </View>
              );
            })}
          </Card>
        ))}

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
  header: { paddingTop: 16, marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.white },
  subtitle: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
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

  // Rest banner
  restBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
    paddingHorizontal: 16, paddingVertical: 10, gap: 10,
  },
  restBannerText: { flex: 1, color: COLORS.mutedLight, fontSize: 13 },
  restBannerBtn: {
    backgroundColor: COLORS.accent, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  restBannerBtnText: { color: '#0f0f0f', fontWeight: '700', fontSize: 12 },
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
  closeBtn: {
    marginTop: 24, backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  closeBtnText: { color: '#0f0f0f', fontWeight: '700', fontSize: 16 },
});
