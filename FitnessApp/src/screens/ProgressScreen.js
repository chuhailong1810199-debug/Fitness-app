import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../theme/colors';
import { Card, SectionHeader, Divider } from '../components/UI';
import {
  getSessions, getPRs, computeLifetimeStats,
  getBodyWeightLog, addBodyWeightEntry, deleteBodyWeightEntry,
  getRecentWeightEntries, computeWeightTrend,
  computeWeeklyVolumeHistory, deleteSession,
  getExerciseBestPerSession,
  computeTrainingHeatmap, computeMaxStreak,
  getUserProfile,
  getMeasurements, addMeasurementEntry, deleteMeasurementEntry, computeMeasurementTrends,
} from '../services/storage';

const DEFAULT_PR_EXERCISES = [
  'Bench Press', 'Squat', 'Romanian Deadlift', 'Overhead Press', 'Barbell Row',
  'Incline Dumbbell Press', 'Lateral Raise', 'Face Pull', 'Barbell Curl',
  'Leg Press', 'Leg Curl',
];

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}ph`;
  return `${m} phút`;
}

// Mini sparkline for body weight (last 7 entries)
function WeightSparkline({ entries }) {
  if (entries.length < 2) return null;
  const weights = entries.map(e => e.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const W = 200;
  const H = 40;
  const step = W / (weights.length - 1);

  const points = weights
    .slice()
    .reverse()
    .map((w, i) => {
      const x = i * step;
      const y = H - ((w - min) / range) * (H - 8) - 4;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <View style={sparkStyles.wrap}>
      {/* SVG-less fallback: simple dot row */}
      <View style={sparkStyles.row}>
        {weights
          .slice()
          .reverse()
          .map((w, i) => {
            const pct = range === 0 ? 0.5 : (w - min) / range;
            const isLatest = i === weights.length - 1;
            return (
              <View key={i} style={[sparkStyles.col, { justifyContent: 'flex-end' }]}>
                <View style={[
                  sparkStyles.dot,
                  { marginBottom: Math.round(pct * 28) },
                  isLatest && sparkStyles.dotLatest,
                ]} />
              </View>
            );
          })}
      </View>
    </View>
  );
}

const sparkStyles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 4 },
  col: { flex: 1, alignItems: 'center', height: 40 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.border },
  dotLatest: { backgroundColor: COLORS.accent, width: 8, height: 8, borderRadius: 4 },
});

// Volume bar chart for weekly trend
function VolumeTrendChart({ weeklyData }) {
  const maxVolume = Math.max(...weeklyData.map(w => w.volume), 1);
  const BAR_H = 60;

  return (
    <View style={volStyles.wrap}>
      <View style={volStyles.barsRow}>
        {weeklyData.map((w, i) => {
          const barH = w.volume ? Math.max(4, Math.round((w.volume / maxVolume) * BAR_H)) : 4;
          const isLatest = i === weeklyData.length - 1;
          return (
            <View key={i} style={volStyles.col}>
              <View style={[volStyles.barBg, { height: BAR_H }]}>
                <View style={[
                  volStyles.barFill,
                  {
                    height: barH,
                    backgroundColor: isLatest
                      ? COLORS.accent
                      : w.volume ? 'rgba(200,255,87,0.35)' : COLORS.border,
                  },
                ]} />
              </View>
              <Text style={[volStyles.label, isLatest && { color: COLORS.accent }]}>{w.label}</Text>
              {w.volume > 0 && (
                <Text style={volStyles.volLabel}>
                  {w.volume >= 1000 ? `${Math.round(w.volume / 1000)}k` : w.volume}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const volStyles = StyleSheet.create({
  wrap: { marginTop: 4 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  barBg: {
    width: '100%', justifyContent: 'flex-end',
    backgroundColor: '#1f1f1f', borderRadius: 6,
  },
  barFill: { width: '100%', borderRadius: 6 },
  label: { fontSize: 9, color: COLORS.muted, fontWeight: '500' },
  volLabel: { fontSize: 8, color: '#444', marginTop: -2 },
});

// ── Body Measurements ─────────────────────────────────
const MEASURE_FIELDS = [
  { key: 'chest', label: 'Vòng ngực', icon: '📏' },
  { key: 'waist', label: 'Vòng eo',   icon: '📐' },
  { key: 'arms',  label: 'Vòng tay',  icon: '💪' },
  { key: 'hips',  label: 'Vòng hông', icon: '🍑' },
];

function MeasurementModal({ visible, latestEntry, onSave, onClose }) {
  const [vals, setVals] = React.useState({});
  React.useEffect(() => {
    if (visible) {
      const init = {};
      MEASURE_FIELDS.forEach(f => { init[f.key] = latestEntry?.[f.key] != null ? String(latestEntry[f.key]) : ''; });
      setVals(init);
    }
  }, [visible]);

  function handleSave() {
    const data = {};
    MEASURE_FIELDS.forEach(f => {
      const v = parseFloat(vals[f.key]);
      if (!isNaN(v) && v > 0) data[f.key] = Math.round(v * 10) / 10;
    });
    onSave(data);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' }} activeOpacity={1} onPress={onClose} />
        <View style={measStyles.sheet}>
          <View style={measStyles.handle} />
          <Text style={measStyles.title}>Số đo cơ thể</Text>
          {MEASURE_FIELDS.map(f => (
            <View key={f.key} style={measStyles.row}>
              <Text style={measStyles.icon}>{f.icon}</Text>
              <Text style={measStyles.fieldLabel}>{f.label}</Text>
              <View style={measStyles.inputWrap}>
                <TextInput
                  style={measStyles.input}
                  value={vals[f.key] ?? ''}
                  onChangeText={v => setVals(prev => ({ ...prev, [f.key]: v }))}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={COLORS.muted}
                  selectTextOnFocus
                />
                <Text style={measStyles.unit}>cm</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={measStyles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={measStyles.saveBtnText}>Lưu</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const measStyles = StyleSheet.create({
  sheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, borderTopWidth: 0.5, borderColor: COLORS.border,
  },
  handle: {
    width: 36, height: 4, backgroundColor: COLORS.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.white, marginBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  icon: { fontSize: 20, width: 26 },
  fieldLabel: { flex: 1, color: COLORS.mutedLight, fontSize: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    width: 80, height: 42, backgroundColor: COLORS.card,
    borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.border,
    color: COLORS.white, textAlign: 'center', fontSize: 15,
  },
  unit: { color: COLORS.muted, fontSize: 13, width: 24 },
  saveBtn: {
    marginTop: 10, backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  saveBtnText: { color: '#0f0f0f', fontWeight: '700', fontSize: 16 },
});

// ── Training Heatmap ──────────────────────────────────
function TrainingHeatmap({ grid }) {
  const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const CELL = 11;
  const GAP = 3;

  function cellColor(sets) {
    if (sets < 0) return 'transparent';
    if (sets === 0) return '#1e1e1e';
    if (sets < 6)  return 'rgba(200,255,87,0.22)';
    if (sets < 12) return 'rgba(200,255,87,0.48)';
    if (sets < 20) return 'rgba(200,255,87,0.72)';
    return COLORS.accent;
  }

  return (
    <View style={heatStyles.container}>
      <View style={[heatStyles.dayCol, { gap: GAP }]}>
        {DAY_LABELS.map((d, i) => (
          <View key={i} style={{ height: CELL, justifyContent: 'center' }}>
            <Text style={heatStyles.dayLabel}>{i % 2 === 0 ? d : ''}</Text>
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        <View style={[heatStyles.grid, { gap: GAP }]}>
          {grid.map((week, wi) => (
            <View key={wi} style={[heatStyles.weekCol, { gap: GAP }]}>
              {week.map((sets, di) => (
                <View
                  key={di}
                  style={[heatStyles.cell, { width: CELL, height: CELL, backgroundColor: cellColor(sets) }]}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const heatStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 4 },
  dayCol: { width: 22, marginRight: 4 },
  dayLabel: { fontSize: 8, color: COLORS.muted, textAlign: 'right' },
  grid: { flexDirection: 'row' },
  weekCol: { flexDirection: 'column' },
  cell: { borderRadius: 2 },
});

// ── Achievement Badges ────────────────────────────────
const ACHIEVEMENTS = [
  { id: 'first', icon: '🎯', label: 'Bắt đầu',   check: (s) => s.totalSessions >= 1 },
  { id: 's10',   icon: '💪', label: '10 buổi',   check: (s) => s.totalSessions >= 10 },
  { id: 's50',   icon: '🏆', label: '50 buổi',   check: (s) => s.totalSessions >= 50 },
  { id: 's100',  icon: '👑', label: '100 buổi',  check: (s) => s.totalSessions >= 100 },
  { id: 'str7',  icon: '🔥', label: 'Streak 7',  check: (s) => s.maxStreak >= 7 },
  { id: 'str30', icon: '⚡', label: 'Streak 30', check: (s) => s.maxStreak >= 30 },
  { id: 'v10k',  icon: '📦', label: '10K kg',    check: (s) => s.totalVolume >= 10000 },
  { id: 'v100k', icon: '🌟', label: '100K kg',   check: (s) => s.totalVolume >= 100000 },
];

function AchievementBadges({ stats, maxStreak }) {
  const ext = { ...stats, maxStreak };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
      <View style={achStyles.row}>
        {ACHIEVEMENTS.map(a => {
          const earned = a.check(ext);
          return (
            <View key={a.id} style={[achStyles.badge, !earned && achStyles.locked]}>
              <Text style={[achStyles.icon, !earned && { opacity: 0.3 }]}>{a.icon}</Text>
              <Text style={[achStyles.label, !earned && achStyles.lockedLabel]}>{a.label}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const achStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingVertical: 4, paddingHorizontal: 2 },
  badge: {
    alignItems: 'center', backgroundColor: 'rgba(200,255,87,0.1)',
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 0.5, borderColor: 'rgba(200,255,87,0.3)', minWidth: 70,
  },
  locked: { backgroundColor: COLORS.card, borderColor: COLORS.border },
  icon: { fontSize: 22, marginBottom: 4 },
  label: { fontSize: 10, fontWeight: '700', color: COLORS.accent },
  lockedLabel: { color: '#333' },
});

export default function ProgressScreen() {
  const [sessions, setSessions] = useState([]);
  const [prs, setPRs] = useState({});
  const [stats, setStats] = useState({ totalSessions: 0, volumeLabel: '0', totalHours: 0, streak: 0 });
  const [weightLog, setWeightLog] = useState([]);
  const [weightInput, setWeightInput] = useState('');
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [heightCm, setHeightCm] = useState(null);
  const [weeklyVolumeData, setWeeklyVolumeData] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [maxStreak, setMaxStreak] = useState(0);
  const [measurements, setMeasurements] = useState([]);
  const [showMeasureModal, setShowMeasureModal] = useState(false);
  const [detailSession, setDetailSession] = useState(null);
  const [exHistoryExercise, setExHistoryExercise] = useState(null); // exercise name

  async function handleDeleteSession(sessionId) {
    const updated = await deleteSession(sessionId);
    setSessions(updated);
    setStats(computeLifetimeStats(updated));
    setWeeklyVolumeData(computeWeeklyVolumeHistory(updated));
    setHeatmapData(computeTrainingHeatmap(updated));
    setMaxStreak(computeMaxStreak(updated));
    setDetailSession(null);
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        const [allSessions, allPRs, wLog, profile, meas] = await Promise.all([
          getSessions(), getPRs(), getBodyWeightLog(), getUserProfile(), getMeasurements(),
        ]);
        if (!active) return;
        setSessions(allSessions);
        setPRs(allPRs);
        setStats(computeLifetimeStats(allSessions));
        setWeightLog(wLog);
        setWeeklyVolumeData(computeWeeklyVolumeHistory(allSessions));
        setHeatmapData(computeTrainingHeatmap(allSessions));
        setMaxStreak(computeMaxStreak(allSessions));
        setHeightCm(profile.heightCm ?? null);
        setMeasurements(meas);
      }
      load();
      return () => { active = false; };
    }, [])
  );

  async function handleSaveMeasurement(data) {
    const updated = await addMeasurementEntry(data);
    setMeasurements(updated);
    setShowMeasureModal(false);
  }

  async function handleSaveWeight() {
    const kg = parseFloat(weightInput.replace(',', '.'));
    if (!kg || kg < 20 || kg > 300) return;
    const updated = await addBodyWeightEntry(kg);
    setWeightLog(updated);
    setWeightInput('');
    setShowWeightModal(false);
  }

  async function handleDeleteWeightEntry(entryId) {
    const updated = await deleteBodyWeightEntry(entryId);
    setWeightLog(updated);
  }

  async function handleDeleteLatestMeasurement() {
    const latestId = measurements[0]?.id;
    if (!latestId) return;
    const updated = await deleteMeasurementEntry(latestId);
    setMeasurements(updated);
  }

  const recentWeight = getRecentWeightEntries(weightLog, 8);
  const weightTrend = computeWeightTrend(recentWeight);
  const latestWeight = recentWeight[0]?.weight;

  function computeBMI(weightKg, heightCmVal) {
    if (!weightKg || !heightCmVal) return null;
    return Math.round((weightKg / Math.pow(heightCmVal / 100, 2)) * 10) / 10;
  }
  function getBMICategory(bmi) {
    if (bmi < 18.5) return { label: 'Thiếu cân', color: COLORS.amber };
    if (bmi < 25)   return { label: 'Bình thường', color: COLORS.accent };
    if (bmi < 30)   return { label: 'Thừa cân', color: COLORS.amber };
    return { label: 'Béo phì', color: COLORS.red };
  }
  const bmi = computeBMI(latestWeight, heightCm);
  const bmiCategory = bmi ? getBMICategory(bmi) : null;

  const prExercises = Object.keys(prs);
  const prRows = [
    ...prExercises.map(name => ({ name, ...prs[name] })),
    ...DEFAULT_PR_EXERCISES
      .filter(n => !prs[n])
      .map(name => ({ name, weight: null, reps: null, date: null })),
  ];

  const lifetimeCards = [
    { value: String(stats.totalSessions), label: 'buổi tập', color: COLORS.accent },
    { value: stats.volumeLabel, label: 'kg đã nâng', color: COLORS.white },
    { value: `${stats.totalHours}h`, label: 'giờ tập', color: COLORS.amber },
    { value: stats.streak > 0 ? `${stats.streak} 🔥` : '0', label: 'ngày liên tiếp', color: COLORS.red },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.subtitle}>Tổng quát</Text>
          <Text style={styles.title}>Tiến độ</Text>
        </View>

        {/* Lifetime Stats */}
        <SectionHeader title="Thống kê tổng" />
        <View style={styles.statsGrid}>
          {lifetimeCards.map((s, i) => (
            <View key={i} style={styles.statCard}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Achievements */}
        <SectionHeader title="Thành tích" />
        <AchievementBadges stats={stats} maxStreak={maxStreak} />

        {/* Volume Trend */}
        <SectionHeader title="Xu hướng khối lượng (6 tuần)" />
        <Card style={{ marginBottom: 24 }}>
          {weeklyVolumeData.every(w => w.volume === 0) ? (
            <Text style={styles.emptyText}>Chưa có dữ liệu. Tập luyện để xem xu hướng! 📈</Text>
          ) : (
            <VolumeTrendChart weeklyData={weeklyVolumeData} />
          )}
        </Card>

        {/* Body Weight Tracker */}
        <View style={styles.sectionRow}>
          <SectionHeader title="Cân nặng" />
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => {
              setWeightInput(latestWeight ? String(latestWeight) : '');
              setShowWeightModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.addBtnText}>+ Cập nhật</Text>
          </TouchableOpacity>
        </View>

        <Card>
          {latestWeight ? (
            <>
              <View style={styles.weightRow}>
                <View>
                  <Text style={styles.weightValue}>{latestWeight} <Text style={styles.weightUnit}>kg</Text></Text>
                  <Text style={styles.weightDate}>{recentWeight[0].dateLabel}</Text>
                </View>
                {weightTrend !== null && (
                  <View style={[
                    styles.trendBadge,
                    { backgroundColor: weightTrend > 0 ? 'rgba(255,87,87,0.12)' : 'rgba(200,255,87,0.12)' },
                  ]}>
                    <Text style={[
                      styles.trendText,
                      { color: weightTrend > 0 ? COLORS.red : COLORS.accent },
                    ]}>
                      {weightTrend > 0 ? '+' : ''}{weightTrend} kg
                    </Text>
                  </View>
                )}
              </View>
              {bmi && bmiCategory && (
                <View style={styles.bmiRow}>
                  <Text style={styles.bmiLabel}>BMI</Text>
                  <Text style={[styles.bmiValue, { color: bmiCategory.color }]}>{bmi}</Text>
                  <View style={[styles.bmiCatBadge, { backgroundColor: bmiCategory.color + '18' }]}>
                    <Text style={[styles.bmiCatText, { color: bmiCategory.color }]}>
                      {bmiCategory.label}
                    </Text>
                  </View>
                </View>
              )}
              <WeightSparkline entries={recentWeight} />
              <View style={styles.weightHistory}>
                {recentWeight.slice(0, 5).map((e, i) => (
                  <View key={e.id} style={styles.weightHistoryRow}>
                    <Text style={styles.weightHistoryDate}>{e.dateLabel}</Text>
                    <View style={styles.weightHistoryRight}>
                      <Text style={[styles.weightHistoryVal, i === 0 && { color: COLORS.white }]}>
                        {e.weight} kg
                      </Text>
                      <TouchableOpacity
                        style={styles.rowDeleteBtn}
                        onPress={() =>
                          Alert.alert(
                            'Xóa bản ghi cân nặng?',
                            `Bản ghi ngày ${e.dateLabel} sẽ bị xóa.`,
                            [
                              { text: 'Hủy', style: 'cancel' },
                              { text: 'Xóa', style: 'destructive', onPress: () => handleDeleteWeightEntry(e.id) },
                            ]
                          )
                        }
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.rowDeleteText}>🗑</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <TouchableOpacity onPress={() => setShowWeightModal(true)} activeOpacity={0.7}>
              <Text style={styles.emptyText}>Chưa có dữ liệu cân nặng.{'\n'}Nhấn để ghi lần đầu! ⚖️</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Body Measurements */}
        {(() => {
          const latest = measurements[0];
          const trends = computeMeasurementTrends(measurements);
          return (
            <>
              <View style={styles.sectionRow}>
                <SectionHeader title="Số đo cơ thể" />
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => setShowMeasureModal(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addBtnText}>+ Cập nhật</Text>
                </TouchableOpacity>
                {latest && (
                  <TouchableOpacity
                    style={styles.addBtnSecondary}
                    onPress={() =>
                      Alert.alert(
                        'Xóa số đo mới nhất?',
                        `Bản ghi ngày ${latest.dateLabel} sẽ bị xóa.`,
                        [
                          { text: 'Hủy', style: 'cancel' },
                          { text: 'Xóa', style: 'destructive', onPress: handleDeleteLatestMeasurement },
                        ]
                      )
                    }
                    activeOpacity={0.7}
                  >
                    <Text style={styles.addBtnSecondaryText}>🗑 Xóa mới nhất</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Card style={{ marginBottom: 24 }}>
                {latest ? (
                  <View style={styles.measureGrid}>
                    {MEASURE_FIELDS.map(f => {
                      const val = latest[f.key];
                      if (val == null) return null;
                      const delta = trends[f.key];
                      return (
                        <View key={f.key} style={styles.measureCell}>
                          <Text style={styles.measureIcon}>{f.icon}</Text>
                          <Text style={styles.measureVal}>{val}</Text>
                          <Text style={styles.measureLabel}>{f.label.replace('Vòng ', '')}</Text>
                          {delta != null && (
                            <Text style={[styles.measureDelta, { color: delta === 0 ? COLORS.muted : delta < 0 ? COLORS.accent : COLORS.red }]}>
                              {delta > 0 ? '+' : ''}{delta} cm
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setShowMeasureModal(true)} activeOpacity={0.7}>
                    <Text style={styles.emptyText}>Chưa có số đo.{'\n'}Nhấn để ghi lần đầu! 📏</Text>
                  </TouchableOpacity>
                )}
              </Card>
            </>
          );
        })()}

        {/* Personal Records */}
        <SectionHeader title="Kỷ lục cá nhân (PR)" />
        <Card>
          {prRows.map((r, i, arr) => (
            <TouchableOpacity
              key={r.name}
              onPress={() => r.weight ? setExHistoryExercise(r.name) : null}
              activeOpacity={r.weight ? 0.7 : 1}
            >
              <View style={styles.prRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prName}>{r.name}</Text>
                  <Text style={styles.prDate}>{r.date ?? '—'}</Text>
                </View>
                <View style={[styles.prBadge, !r.weight && styles.prBadgeEmpty]}>
                  <Text style={[styles.prValue, !r.weight && styles.prValueEmpty]}>
                    {r.weight ? `${r.weight} kg` : 'Chưa có'}
                  </Text>
                </View>
                {r.weight && <Text style={styles.prArrow}>›</Text>}
              </View>
              {i < arr.length - 1 && <Divider />}
            </TouchableOpacity>
          ))}
        </Card>

        {/* Training Heatmap */}
        <SectionHeader title="Lịch tập (14 tuần)" />
        <Card style={{ marginBottom: 24 }}>
          {heatmapData.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có dữ liệu. Hãy tập luyện! 🔥</Text>
          ) : (
            <>
              <TrainingHeatmap grid={heatmapData} />
              <View style={styles.heatLegend}>
                <Text style={styles.heatLegendLabel}>Ít</Text>
                {['#1e1e1e', 'rgba(200,255,87,0.22)', 'rgba(200,255,87,0.48)', 'rgba(200,255,87,0.72)', COLORS.accent].map((c, i) => (
                  <View key={i} style={[styles.heatLegendCell, { backgroundColor: c }]} />
                ))}
                <Text style={styles.heatLegendLabel}>Nhiều</Text>
              </View>
            </>
          )}
        </Card>

        {/* Workout Log */}
        <SectionHeader title="Nhật ký tập luyện" />
        {sessions.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>Chưa có buổi tập nào được ghi lại.{'\n'}Hãy bắt đầu tập ngay! 💪</Text>
          </Card>
        ) : (
          sessions.slice(0, 20).map((entry) => (
            <TouchableOpacity
              key={entry.id}
              onPress={() => setDetailSession(entry)}
              activeOpacity={0.8}
            >
              <Card style={styles.logCard}>
                <View style={styles.logTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logName}>{entry.planName}</Text>
                    <Text style={styles.logDate}>{entry.dateLabel}</Text>
                  </View>
                  <View style={styles.logTopRight}>
                    {entry.intensity != null && (
                      <Text style={styles.logIntensity}>
                        {INTENSITY_EMOJIS[entry.intensity] ?? ''}
                      </Text>
                    )}
                    <View style={styles.durationBadge}>
                      <Text style={styles.durationText}>
                        {formatDuration(entry.durationSeconds)}
                      </Text>
                    </View>
                  </View>
                </View>
                {!!entry.note && (
                  <Text style={styles.logNote} numberOfLines={1}>
                    "{entry.note}"
                  </Text>
                )}
                <Divider />
                <View style={styles.logStats}>
                  <View>
                    <Text style={styles.logStatVal}>{entry.totalSets} sets</Text>
                    <Text style={styles.logStatLabel}>bộ</Text>
                  </View>
                  <View style={styles.logStatDivider} />
                  <View>
                    <Text style={styles.logStatVal}>{entry.totalVolume.toLocaleString()} kg</Text>
                    <Text style={styles.logStatLabel}>tổng kg</Text>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Body Weight Input Modal */}
      <Modal
        visible={showWeightModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWeightModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowWeightModal(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cân nặng hôm nay</Text>
            <View style={styles.modalInputRow}>
              <TextInput
                style={styles.modalInput}
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType="decimal-pad"
                placeholder="70.5"
                placeholderTextColor={COLORS.muted}
                autoFocus
                selectTextOnFocus
              />
              <Text style={styles.modalUnit}>kg</Text>
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowWeightModal(false)} activeOpacity={0.7}>
                <Text style={styles.modalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveWeight} activeOpacity={0.85}>
                <Text style={styles.modalSaveText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Body Measurement Modal */}
      <MeasurementModal
        visible={showMeasureModal}
        latestEntry={measurements[0]}
        onSave={handleSaveMeasurement}
        onClose={() => setShowMeasureModal(false)}
      />

      {/* Session Detail Modal */}
      <SessionDetailModal
        session={detailSession}
        onClose={() => setDetailSession(null)}
        onDelete={handleDeleteSession}
      />

      {/* Exercise History Modal */}
      <ExerciseHistoryModal
        exerciseName={exHistoryExercise}
        sessions={sessions}
        onClose={() => setExHistoryExercise(null)}
      />
    </SafeAreaView>
  );
}

// ── Session Detail Modal ──────────────────────────────
const INTENSITY_LABELS = { 1: '😴 Nhẹ', 2: '😊 Ổn', 3: '💪 Tốt', 4: '🔥 Khó', 5: '⚡ Max' };
const INTENSITY_EMOJIS = { 1: '😴', 2: '😊', 3: '💪', 4: '🔥', 5: '⚡' };

function SessionDetailModal({ session, onClose, onDelete }) {
  if (!session) return null;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={detailStyles.overlay}>
        <SafeAreaView style={detailStyles.sheet} edges={['bottom']}>
          <View style={detailStyles.handle} />

          {/* Header */}
          <View style={detailStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={detailStyles.planName}>{session.planName}</Text>
              <Text style={detailStyles.meta}>{session.dateLabel} · {formatDuration(session.durationSeconds)}</Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                Alert.alert('Xóa buổi tập?', 'Thao tác này không thể hoàn tác.', [
                  { text: 'Hủy', style: 'cancel' },
                  { text: 'Xóa', style: 'destructive', onPress: () => onDelete(session.id) },
                ])
              }
              style={detailStyles.deleteBtn}
            >
              <Text style={detailStyles.deleteText}>🗑</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={detailStyles.closeBtn}>
              <Text style={detailStyles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Intensity + Note */}
          {(session.intensity != null || session.note) && (
            <View style={detailStyles.metaRow}>
              {session.intensity != null && (
                <View style={detailStyles.intensityBadge}>
                  <Text style={detailStyles.intensityText}>
                    {INTENSITY_LABELS[session.intensity] ?? ''}
                  </Text>
                </View>
              )}
              {!!session.note && (
                <Text style={detailStyles.noteText}>"{session.note}"</Text>
              )}
            </View>
          )}

          {/* Summary stats */}
          <View style={detailStyles.statsRow}>
            <View style={detailStyles.statBox}>
              <Text style={detailStyles.statVal}>{session.totalSets}</Text>
              <Text style={detailStyles.statLbl}>sets</Text>
            </View>
            <View style={detailStyles.statBox}>
              <Text style={detailStyles.statVal}>{(session.totalVolume ?? 0).toLocaleString()}</Text>
              <Text style={detailStyles.statLbl}>kg tổng</Text>
            </View>
          </View>

          {/* Exercise list */}
          <ScrollView style={detailStyles.scroll} showsVerticalScrollIndicator={false}>
            {(session.exercises ?? []).map((ex, ei) => (
              <View key={ei} style={detailStyles.exBlock}>
                <Text style={detailStyles.exName}>{ex.nameVi}</Text>
                <Text style={detailStyles.exNameEn}>{ex.name}</Text>
                {!!ex.note && (
                  <Text style={detailStyles.exNote}>"{ex.note}"</Text>
                )}
                <View style={detailStyles.setHeaderRow}>
                  <Text style={[detailStyles.setHeaderText, { width: 22 }]}>#</Text>
                  <Text style={[detailStyles.setHeaderText, { flex: 1, textAlign: 'center' }]}>KG</Text>
                  <Text style={[detailStyles.setHeaderText, { flex: 1, textAlign: 'center' }]}>REPS</Text>
                  <Text style={[detailStyles.setHeaderText, { width: 22, textAlign: 'right' }]}>✓</Text>
                </View>
                {ex.sets.map((s, si) => (
                  <View key={si} style={[detailStyles.setRow, !s.done && detailStyles.setRowSkipped]}>
                    <Text style={detailStyles.setNum}>{si + 1}</Text>
                    <Text style={detailStyles.setVal}>{s.weight}</Text>
                    <Text style={detailStyles.setVal}>{s.reps}</Text>
                    <Text style={[detailStyles.setDone, s.done && detailStyles.setDoneActive]}>
                      {s.done ? '✓' : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const detailStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface, maxHeight: '85%',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 0.5, borderColor: COLORS.border,
    paddingHorizontal: 20, paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, backgroundColor: COLORS.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  planName: { fontSize: 20, fontWeight: '800', color: COLORS.white },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  closeBtn: { padding: 6 },
  closeText: { color: COLORS.muted, fontSize: 18 },
  deleteBtn: { padding: 6, marginRight: 4 },
  deleteText: { fontSize: 18 },
  metaRow: { marginBottom: 14, gap: 6 },
  intensityBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(200,255,87,0.1)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  intensityText: { color: COLORS.accent, fontSize: 13, fontWeight: '600' },
  noteText: { color: COLORS.mutedLight, fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, alignItems: 'center',
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  statVal: { fontSize: 20, fontWeight: '800', color: COLORS.white },
  statLbl: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  scroll: { flex: 1 },
  exBlock: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  exName: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  exNameEn: { fontSize: 11, color: COLORS.muted, marginBottom: 4 },
  exNote: { fontSize: 11, color: COLORS.mutedLight, fontStyle: 'italic', marginBottom: 8 },
  setHeaderRow: { flexDirection: 'row', marginBottom: 6 },
  setHeaderText: { fontSize: 10, color: '#444', fontWeight: '700', letterSpacing: 0.5 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 4 },
  setRowSkipped: { opacity: 0.3 },
  setNum: { color: '#444', fontSize: 12, width: 22 },
  setVal: { flex: 1, color: COLORS.white, fontSize: 13, textAlign: 'center', fontWeight: '500' },
  setDone: { color: '#333', fontSize: 13, width: 22, textAlign: 'right' },
  setDoneActive: { color: COLORS.accent },
});

// ── Exercise History Modal ────────────────────────────

function ExerciseHistoryMiniChart({ data }) {
  if (data.length < 2) return null;
  const weights = data.map(d => d.bestWeight).reverse(); // oldest → newest
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const BAR_H = 48;

  return (
    <View style={exStyles.chartWrap}>
      <View style={exStyles.chartBars}>
        {weights.map((w, i) => {
          const h = Math.max(4, Math.round(((w - min) / range) * BAR_H));
          const isLatest = i === weights.length - 1;
          return (
            <View key={i} style={[exStyles.chartBarBg, { height: BAR_H }]}>
              <View style={[
                exStyles.chartBarFill,
                { height: h, backgroundColor: isLatest ? COLORS.accent : 'rgba(200,255,87,0.35)' },
              ]} />
            </View>
          );
        })}
      </View>
      <View style={exStyles.chartLabels}>
        <Text style={exStyles.chartLabelMin}>{min} kg</Text>
        <Text style={exStyles.chartLabelMax}>{max} kg</Text>
      </View>
    </View>
  );
}

function ExerciseHistoryModal({ exerciseName, sessions, onClose }) {
  if (!exerciseName) return null;
  const history = getExerciseBestPerSession(exerciseName, sessions);
  const improvement = history.length >= 2
    ? Math.round((history[0].bestWeight - history[history.length - 1].bestWeight) * 10) / 10
    : null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={exStyles.overlay}>
        <SafeAreaView style={exStyles.sheet} edges={['bottom']}>
          <View style={exStyles.handle} />

          <View style={exStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={exStyles.title}>{exerciseName}</Text>
              <Text style={exStyles.subtitle}>{history.length} buổi tập đã ghi</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={exStyles.closeBtn}>
              <Text style={exStyles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {improvement !== null && (
            <View style={[
              exStyles.improveBadge,
              { backgroundColor: improvement >= 0 ? 'rgba(200,255,87,0.1)' : 'rgba(255,87,87,0.1)' },
            ]}>
              <Text style={[exStyles.improveText, { color: improvement >= 0 ? COLORS.accent : COLORS.red }]}>
                {improvement >= 0 ? '↑' : '↓'} {Math.abs(improvement)} kg so với lần đầu
              </Text>
            </View>
          )}

          <ExerciseHistoryMiniChart data={history} />

          <ScrollView style={exStyles.list} showsVerticalScrollIndicator={false}>
            {history.map((entry, i) => (
              <View key={i} style={exStyles.row}>
                <View style={exStyles.rowLeft}>
                  <Text style={exStyles.rowDate}>{entry.dateLabel}</Text>
                  <Text style={exStyles.rowSession}>{entry.sessionName}</Text>
                </View>
                <View style={exStyles.rowRight}>
                  <Text style={exStyles.rowWeight}>{entry.bestWeight} kg</Text>
                  <Text style={exStyles.rowReps}>× {entry.bestReps} reps</Text>
                </View>
                {i === 0 && (
                  <View style={exStyles.prBadge}>
                    <Text style={exStyles.prBadgeText}>PR</Text>
                  </View>
                )}
              </View>
            ))}
            {history.length === 0 && (
              <Text style={exStyles.empty}>Chưa có dữ liệu cho bài tập này.</Text>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const exStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.surface, maxHeight: '80%',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 0.5, borderColor: COLORS.border,
    paddingHorizontal: 20, paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, backgroundColor: COLORS.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.white },
  subtitle: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  closeBtn: { padding: 6 },
  closeText: { color: COLORS.muted, fontSize: 18 },
  improveBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 12, marginBottom: 14,
  },
  improveText: { fontWeight: '700', fontSize: 13 },
  // Mini chart
  chartWrap: { marginBottom: 16 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', height: 48, gap: 4, marginBottom: 4 },
  chartBarBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#1f1f1f', borderRadius: 4 },
  chartBarFill: { width: '100%', borderRadius: 4 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  chartLabelMin: { color: '#444', fontSize: 10 },
  chartLabelMax: { color: COLORS.accent, fontSize: 10 },
  // List
  list: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
    gap: 8,
  },
  rowLeft: { flex: 1 },
  rowDate: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  rowSession: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  rowWeight: { color: COLORS.accent, fontWeight: '700', fontSize: 15 },
  rowReps: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  prBadge: {
    backgroundColor: 'rgba(255,184,71,0.15)', paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 8,
  },
  prBadgeText: { color: COLORS.amber, fontSize: 10, fontWeight: '800' },
  empty: { color: COLORS.muted, textAlign: 'center', paddingVertical: 20, fontSize: 14 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 16, marginBottom: 20 },
  subtitle: { fontSize: 13, color: COLORS.muted, marginBottom: 4 },
  title: { fontSize: 36, fontWeight: '800', color: COLORS.white },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statCard: {
    width: '47%', backgroundColor: COLORS.card,
    borderRadius: 14, padding: 16,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  statValue: { fontSize: 30, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 12, color: COLORS.muted },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: {
    backgroundColor: 'rgba(200,255,87,0.12)',
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, marginBottom: 12,
  },
  addBtnText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },
  addBtnSecondary: {
    backgroundColor: COLORS.card,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 12,
  },
  addBtnSecondaryText: { color: COLORS.mutedLight, fontSize: 12, fontWeight: '600' },

  weightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  weightValue: { fontSize: 36, fontWeight: '800', color: COLORS.white },
  weightUnit: { fontSize: 18, fontWeight: '400', color: COLORS.muted },
  weightDate: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  trendBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginTop: 4 },
  trendText: { fontWeight: '700', fontSize: 13 },
  weightHistory: { marginTop: 10, gap: 4 },
  weightHistoryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  weightHistoryDate: { color: COLORS.muted, fontSize: 13 },
  weightHistoryRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weightHistoryVal: { color: COLORS.mutedLight, fontSize: 13, fontWeight: '500' },
  rowDeleteBtn: { paddingVertical: 2, paddingHorizontal: 2 },
  rowDeleteText: { fontSize: 14, color: COLORS.muted },

  prRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4,
  },
  prName: { color: COLORS.white, fontSize: 14, fontWeight: '500' },
  prDate: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  prBadge: {
    backgroundColor: 'rgba(200,255,87,0.12)',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  prBadgeEmpty: { backgroundColor: COLORS.cardDark },
  prValue: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
  prValueEmpty: { color: COLORS.muted },
  prArrow: { color: COLORS.muted, fontSize: 18, marginLeft: 6 },

  logCard: { marginBottom: 10 },
  logTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logName: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
  logDate: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  durationBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 0.5,
    backgroundColor: 'rgba(200,255,87,0.1)', borderColor: 'rgba(200,255,87,0.25)',
  },
  durationText: { fontSize: 12, fontWeight: '600', color: COLORS.accent },
  logStats: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  logStatVal: { color: COLORS.white, fontSize: 14, fontWeight: '600' },
  logStatLabel: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  logStatDivider: { width: 0.5, height: 28, backgroundColor: COLORS.border },
  logTopRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logIntensity: { fontSize: 16 },
  logNote: { color: COLORS.muted, fontSize: 12, fontStyle: 'italic', marginTop: 4, marginBottom: 2 },

  measureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  measureCell: {
    width: '47%', backgroundColor: COLORS.cardDark, borderRadius: 12,
    padding: 12, borderWidth: 0.5, borderColor: COLORS.border,
  },
  measureIcon: { fontSize: 18, marginBottom: 4 },
  measureVal: { fontSize: 22, fontWeight: '800', color: COLORS.white },
  measureLabel: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  measureDelta: { fontSize: 11, fontWeight: '700', marginTop: 3 },

  bmiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  bmiLabel: { color: COLORS.muted, fontSize: 12 },
  bmiValue: { fontSize: 22, fontWeight: '800' },
  bmiCatBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  bmiCatText: { fontSize: 11, fontWeight: '700' },

  heatLegend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  heatLegendCell: { width: 11, height: 11, borderRadius: 2 },
  heatLegendLabel: { fontSize: 9, color: '#444', marginHorizontal: 2 },

  emptyText: {
    color: COLORS.muted, fontSize: 14, textAlign: 'center', lineHeight: 22, paddingVertical: 8,
  },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
    borderTopWidth: 0.5, borderColor: COLORS.border,
  },
  modalTitle: { color: COLORS.white, fontSize: 18, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  modalInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  modalInput: {
    flex: 1, height: 56, backgroundColor: COLORS.card,
    borderRadius: 14, borderWidth: 0.5, borderColor: COLORS.border,
    color: COLORS.white, textAlign: 'center', fontSize: 32, fontWeight: '700',
  },
  modalUnit: { fontSize: 22, color: COLORS.muted, fontWeight: '400', width: 32 },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', backgroundColor: COLORS.card,
  },
  modalCancelText: { color: COLORS.muted, fontWeight: '600', fontSize: 15 },
  modalSave: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    backgroundColor: COLORS.accent, alignItems: 'center',
  },
  modalSaveText: { color: '#0f0f0f', fontWeight: '700', fontSize: 15 },
});
