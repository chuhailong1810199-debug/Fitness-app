import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../theme/colors';
import { Card, SectionHeader, Divider } from '../components/UI';
import {
  getSessions, getPRs, computeLifetimeStats,
  getBodyWeightLog, addBodyWeightEntry,
  getRecentWeightEntries, computeWeightTrend,
  computeWeeklyVolumeHistory,
} from '../services/storage';

const DEFAULT_PR_EXERCISES = ['Bench Press', 'Squat', 'Romanian Deadlift', 'Overhead Press', 'Barbell Row'];

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

export default function ProgressScreen() {
  const [sessions, setSessions] = useState([]);
  const [prs, setPRs] = useState({});
  const [stats, setStats] = useState({ totalSessions: 0, volumeLabel: '0', totalHours: 0, streak: 0 });
  const [weightLog, setWeightLog] = useState([]);
  const [weightInput, setWeightInput] = useState('');
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weeklyVolumeData, setWeeklyVolumeData] = useState([]);
  const [detailSession, setDetailSession] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        const [allSessions, allPRs, wLog] = await Promise.all([
          getSessions(), getPRs(), getBodyWeightLog(),
        ]);
        if (!active) return;
        setSessions(allSessions);
        setPRs(allPRs);
        setStats(computeLifetimeStats(allSessions));
        setWeightLog(wLog);
        setWeeklyVolumeData(computeWeeklyVolumeHistory(allSessions));
      }
      load();
      return () => { active = false; };
    }, [])
  );

  async function handleSaveWeight() {
    const kg = parseFloat(weightInput.replace(',', '.'));
    if (!kg || kg < 20 || kg > 300) return;
    const updated = await addBodyWeightEntry(kg);
    setWeightLog(updated);
    setWeightInput('');
    setShowWeightModal(false);
  }

  const recentWeight = getRecentWeightEntries(weightLog, 8);
  const weightTrend = computeWeightTrend(recentWeight);
  const latestWeight = recentWeight[0]?.weight;

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
              <WeightSparkline entries={recentWeight} />
              <View style={styles.weightHistory}>
                {recentWeight.slice(0, 5).map((e, i) => (
                  <View key={e.id} style={styles.weightHistoryRow}>
                    <Text style={styles.weightHistoryDate}>{e.dateLabel}</Text>
                    <Text style={[styles.weightHistoryVal, i === 0 && { color: COLORS.white }]}>
                      {e.weight} kg
                    </Text>
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

        {/* Personal Records */}
        <SectionHeader title="Kỷ lục cá nhân (PR)" />
        <Card>
          {prRows.map((r, i, arr) => (
            <View key={r.name}>
              <View style={styles.prRow}>
                <View>
                  <Text style={styles.prName}>{r.name}</Text>
                  <Text style={styles.prDate}>{r.date ?? '—'}</Text>
                </View>
                <View style={[styles.prBadge, !r.weight && styles.prBadgeEmpty]}>
                  <Text style={[styles.prValue, !r.weight && styles.prValueEmpty]}>
                    {r.weight ? `${r.weight} kg` : 'Chưa có'}
                  </Text>
                </View>
              </View>
              {i < arr.length - 1 && <Divider />}
            </View>
          ))}
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

      {/* Session Detail Modal */}
      <SessionDetailModal
        session={detailSession}
        onClose={() => setDetailSession(null)}
      />
    </SafeAreaView>
  );
}

// ── Session Detail Modal ──────────────────────────────
const INTENSITY_LABELS = { 1: '😴 Nhẹ', 2: '😊 Ổn', 3: '💪 Tốt', 4: '🔥 Khó', 5: '⚡ Max' };
const INTENSITY_EMOJIS = { 1: '😴', 2: '😊', 3: '💪', 4: '🔥', 5: '⚡' };

function SessionDetailModal({ session, onClose }) {
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
  exNameEn: { fontSize: 11, color: COLORS.muted, marginBottom: 10 },
  setHeaderRow: { flexDirection: 'row', marginBottom: 6 },
  setHeaderText: { fontSize: 10, color: '#444', fontWeight: '700', letterSpacing: 0.5 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 4 },
  setRowSkipped: { opacity: 0.3 },
  setNum: { color: '#444', fontSize: 12, width: 22 },
  setVal: { flex: 1, color: COLORS.white, fontSize: 13, textAlign: 'center', fontWeight: '500' },
  setDone: { color: '#333', fontSize: 13, width: 22, textAlign: 'right' },
  setDoneActive: { color: COLORS.accent },
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

  weightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  weightValue: { fontSize: 36, fontWeight: '800', color: COLORS.white },
  weightUnit: { fontSize: 18, fontWeight: '400', color: COLORS.muted },
  weightDate: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  trendBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginTop: 4 },
  trendText: { fontWeight: '700', fontSize: 13 },
  weightHistory: { marginTop: 10, gap: 4 },
  weightHistoryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  weightHistoryDate: { color: COLORS.muted, fontSize: 13 },
  weightHistoryVal: { color: COLORS.mutedLight, fontSize: 13, fontWeight: '500' },

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
