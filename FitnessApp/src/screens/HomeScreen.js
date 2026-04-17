import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../theme/colors';
import { Card, SectionHeader, StatCard } from '../components/UI';
import { WORKOUT_PLANS } from '../data/workoutData';
import {
  getSessions,
  computeStreak,
  computeWeeklyData,
  getThisWeekSessions,
  getUserProfile,
  saveUserProfile,
  getLastSessionIsoDates,
  getRecoveryStatus,
  computeWeeklyVolumeHistory,
} from '../services/storage';

// Map JS day of week (0=Sun) to plan index: Mon/Thu=Push, Tue/Fri=Pull, Wed/Sat=Leg
const DAY_TO_PLAN = { 1: 0, 4: 0, 2: 1, 5: 1, 3: 2, 6: 2 };

const RECOVERY_COLORS = { ready: COLORS.accent, almost: COLORS.amber, recovering: COLORS.red };
const RECOVERY_LABELS = { ready: '🟢 Sẵn sàng', almost: '🟡 Gần xong', recovering: '🔴 Nghỉ' };

const GOALS = [
  { key: 'strength',    label: '💪 Tăng sức mạnh' },
  { key: 'muscle',      label: '🏋️ Tăng cơ bắp' },
  { key: 'fat_loss',    label: '🔥 Giảm mỡ' },
  { key: 'endurance',   label: '🏃 Sức bền' },
];

function getGreeting(name) {
  const h = new Date().getHours();
  const base = h < 12 ? 'Chào buổi sáng' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  return name ? `${base}, ${name}! 👋` : `${base} 👋`;
}

function getTodayPlanIndex() {
  return DAY_TO_PLAN[new Date().getDay()] ?? 0;
}

// ── Settings Modal ────────────────────────────────────
function SettingsModal({ visible, profile, onSave, onClose }) {
  const [name, setName] = useState(profile.name ?? '');
  const [goal, setGoal] = useState(profile.goal ?? 'strength');
  const [restSecs, setRestSecs] = useState(String(profile.defaultRestSeconds ?? 60));
  const [heightCm, setHeightCm] = useState(String(profile.heightCm ?? ''));

  // Sync when profile changes (e.g. first open)
  React.useEffect(() => {
    setName(profile.name ?? '');
    setGoal(profile.goal ?? 'strength');
    setRestSecs(String(profile.defaultRestSeconds ?? 60));
    setHeightCm(String(profile.heightCm ?? ''));
  }, [profile]);

  function handleSave() {
    const secs = parseInt(restSecs, 10);
    const cm = parseInt(heightCm, 10);
    onSave({
      name: name.trim(),
      goal,
      defaultRestSeconds: isNaN(secs) ? 60 : secs,
      heightCm: isNaN(cm) || cm < 100 || cm > 250 ? null : cm,
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={settStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={settStyles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={settStyles.sheet}>
          <View style={settStyles.handle} />
          <Text style={settStyles.title}>Hồ sơ cá nhân</Text>

          {/* Name */}
          <Text style={settStyles.label}>Tên của bạn</Text>
          <TextInput
            style={settStyles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nhập tên…"
            placeholderTextColor={COLORS.muted}
            maxLength={30}
          />

          {/* Goal */}
          <Text style={settStyles.label}>Mục tiêu</Text>
          <View style={settStyles.goalsGrid}>
            {GOALS.map(g => (
              <TouchableOpacity
                key={g.key}
                style={[settStyles.goalBtn, goal === g.key && settStyles.goalBtnActive]}
                onPress={() => setGoal(g.key)}
                activeOpacity={0.7}
              >
                <Text style={[settStyles.goalText, goal === g.key && settStyles.goalTextActive]}>
                  {g.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Height */}
          <Text style={settStyles.label}>Chiều cao</Text>
          <View style={settStyles.restRow}>
            <TextInput
              style={[settStyles.input, { flex: 1 }]}
              value={heightCm}
              onChangeText={setHeightCm}
              keyboardType="number-pad"
              placeholder="175"
              placeholderTextColor={COLORS.muted}
            />
            <Text style={settStyles.restUnit}>cm</Text>
          </View>

          {/* Default rest time */}
          <Text style={settStyles.label}>Thời gian nghỉ mặc định</Text>
          <View style={settStyles.restRow}>
            <TextInput
              style={[settStyles.input, { flex: 1 }]}
              value={restSecs}
              onChangeText={setRestSecs}
              keyboardType="number-pad"
              placeholder="60"
              placeholderTextColor={COLORS.muted}
            />
            <Text style={settStyles.restUnit}>giây</Text>
          </View>

          <TouchableOpacity style={settStyles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={settStyles.saveBtnText}>Lưu</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────
export default function HomeScreen({ navigation }) {
  const [selectedBar, setSelectedBar] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [weeklyData, setWeeklyData] = useState(
    ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => ({ day, sets: 0, date: '' }))
  );
  const [streak, setStreak] = useState(0);
  const [weekSessions, setWeekSessions] = useState(0);
  const [totalSets, setTotalSets] = useState(0);
  const [profile, setProfile] = useState({ name: '', goal: 'strength', defaultRestSeconds: 60 });
  const [showSettings, setShowSettings] = useState(false);
  const [recoveryByPlan, setRecoveryByPlan] = useState({});
  const [planFreqThisWeek, setPlanFreqThisWeek] = useState({});
  const [weekInsight, setWeekInsight] = useState(null); // { volumePct, needsTraining }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        const [all, prof] = await Promise.all([getSessions(), getUserProfile()]);
        if (!active) return;
        setSessions(all);
        setStreak(computeStreak(all));
        const weekly = computeWeeklyData(all);
        setWeeklyData(weekly);
        const thisWeek = getThisWeekSessions(all);
        setWeekSessions(thisWeek.length);
        setTotalSets(weekly.reduce((sum, d) => sum + d.sets, 0));
        setProfile(prof);
        // Recovery status per plan
        const isoDates = getLastSessionIsoDates(all);
        const recovery = {};
        Object.entries(isoDates).forEach(([planId, iso]) => {
          recovery[planId] = getRecoveryStatus(iso);
        });
        setRecoveryByPlan(recovery);
        // This-week frequency per plan
        const freq = {};
        thisWeek.forEach(s => { freq[s.planId] = (freq[s.planId] || 0) + 1; });
        setPlanFreqThisWeek(freq);
        // Weekly volume insight
        const volHistory = computeWeeklyVolumeHistory(all, 2);
        if (volHistory.length === 2) {
          const prevVol = volHistory[0].volume;
          const curVol = volHistory[1].volume;
          const volumePct = prevVol > 0 ? Math.round(((curVol - prevVol) / prevVol) * 100) : null;
          const needsTraining = WORKOUT_PLANS.find(p => !freq[p.id])?.nameVi ?? null;
          setWeekInsight({ volumePct, needsTraining });
        }
      }
      load();
      return () => { active = false; };
    }, [])
  );

  async function handleSaveProfile(updated) {
    const saved = await saveUserProfile(updated);
    setProfile(saved);
    setShowSettings(false);
  }

  const todayPlanIndex = getTodayPlanIndex();
  const todayPlan = WORKOUT_PLANS[todayPlanIndex];
  const barMax = Math.max(...weeklyData.map(d => d.sets), 1);

  const goalLabel = GOALS.find(g => g.key === profile.goal)?.label ?? '';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting(profile.name)}</Text>
            <Text style={styles.title}>Tuần này</Text>
            {!!goalLabel && <Text style={styles.goalLabel}>{goalLabel}</Text>}
          </View>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsBtn} activeOpacity={0.7}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard
            value={streak > 0 ? `${streak} 🔥` : '0'}
            label="ngày liên tiếp"
            color={COLORS.amber}
            style={{ borderColor: COLORS.amber + '30' }}
          />
          <View style={{ width: 10 }} />
          <StatCard value={String(weekSessions)} label="buổi tập" color={COLORS.white} />
          <View style={{ width: 10 }} />
          <StatCard
            value={String(totalSets)}
            label="tổng set"
            color={COLORS.accent}
            style={{ borderColor: COLORS.accent + '30' }}
          />
        </View>

        {/* Weekly Chart */}
        <SectionHeader title="Khối lượng tuần" />
        <Card>
          <View style={styles.chart}>
            {weeklyData.map((d, i) => {
              const barH = d.sets ? Math.round((d.sets / barMax) * 80) : 4;
              const active = selectedBar === i;
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.barCol}
                  onPress={() => setSelectedBar(active ? null : i)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.barBg, { height: 80 }]}>
                    <View style={[
                      styles.barFill,
                      { height: barH, backgroundColor: active ? COLORS.white : (d.sets ? COLORS.accent : COLORS.border) },
                    ]} />
                  </View>
                  <Text style={[styles.barLabel, { color: d.sets ? COLORS.mutedLight : '#333' }]}>{d.day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {selectedBar !== null && (
            <Text style={styles.barDetail}>
              {weeklyData[selectedBar].date} · {weeklyData[selectedBar].sets || 0} sets
            </Text>
          )}
        </Card>

        {/* Weekly plan frequency pills */}
        <View style={styles.freqRow}>
          {WORKOUT_PLANS.map(plan => {
            const count = planFreqThisWeek[plan.id] || 0;
            const rec = recoveryByPlan[plan.id];
            return (
              <TouchableOpacity
                key={plan.id}
                style={[styles.freqPill, count > 0 && styles.freqPillActive]}
                onPress={() => navigation.navigate('Workout', { planIndex: WORKOUT_PLANS.indexOf(plan) })}
                activeOpacity={0.75}
              >
                <Text style={styles.freqEmoji}>{plan.emoji}</Text>
                <Text style={[styles.freqLabel, count > 0 && { color: COLORS.white }]}>
                  {plan.name.split(' ')[0]}
                </Text>
                <Text style={[styles.freqCount, { color: count > 0 ? COLORS.accent : '#333' }]}>
                  ×{count}
                </Text>
                {rec && (
                  <View style={[styles.freqDot, { backgroundColor: RECOVERY_COLORS[rec] ?? '#333' }]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Weekly insight */}
        {weekInsight && (weekInsight.volumePct !== null || weekInsight.needsTraining) && (
          <View style={styles.insightRow}>
            {weekInsight.volumePct !== null && (
              <Text style={[styles.insightText, {
                color: weekInsight.volumePct >= 0 ? COLORS.accent : COLORS.amber,
              }]}>
                📊 Khối lượng {weekInsight.volumePct >= 0 ? '↑' : '↓'}{Math.abs(weekInsight.volumePct)}% tuần trước
              </Text>
            )}
            {weekInsight.needsTraining && (
              <Text style={styles.insightTextMuted}>
                {weekInsight.volumePct !== null ? ' · ' : ''}{weekInsight.needsTraining} cần tập
              </Text>
            )}
          </View>
        )}

        {/* Today's Plan */}
        <SectionHeader title="Kế hoạch hôm nay" />
        {(() => {
          const rec = recoveryByPlan[todayPlan.id];
          const recLabel = rec ? RECOVERY_LABELS[rec] : null;
          return (
            <TouchableOpacity
              style={styles.todayCard}
              onPress={() => navigation.navigate('Workout', { planIndex: todayPlanIndex })}
              activeOpacity={0.85}
            >
              <View style={styles.planIcon}>
                <Text style={{ fontSize: 24 }}>{todayPlan.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{todayPlan.nameVi}</Text>
                <Text style={styles.planMeta}>{todayPlan.exercises.length} bài · {todayPlan.duration}</Text>
                {recLabel && (
                  <Text style={[styles.planRecovery, { color: RECOVERY_COLORS[rec] }]}>
                    {recLabel}
                  </Text>
                )}
              </View>
              <Text style={{ color: COLORS.accent, fontSize: 20 }}>›</Text>
            </TouchableOpacity>
          );
        })()}

        {/* Recent Session Summary (if any) */}
        {sessions.length > 0 && (
          <>
            <SectionHeader title="Buổi tập gần nhất" />
            <Card style={styles.recentCard}>
              <View style={styles.recentRow}>
                <View>
                  <Text style={styles.recentName}>{sessions[0].planName}</Text>
                  <Text style={styles.recentDate}>{sessions[0].dateLabel}</Text>
                </View>
                <View style={styles.recentStats}>
                  <Text style={styles.recentStat}>{sessions[0].totalSets} sets</Text>
                  <Text style={styles.recentStatSep}>·</Text>
                  <Text style={styles.recentStat}>{sessions[0].totalVolume.toLocaleString()} kg</Text>
                </View>
              </View>
            </Card>
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <SettingsModal
        visible={showSettings}
        profile={profile}
        onSave={handleSaveProfile}
        onClose={() => setShowSettings(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'flex-start' },
  greeting: { fontSize: 13, color: COLORS.muted, marginBottom: 4 },
  title: { fontSize: 36, fontWeight: '800', color: COLORS.white, letterSpacing: 0.5 },
  goalLabel: { fontSize: 12, color: COLORS.amber, marginTop: 4 },
  settingsBtn: { paddingTop: 14, paddingLeft: 12 },
  settingsIcon: { fontSize: 22 },
  statsRow: { flexDirection: 'row', marginBottom: 24 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barBg: { width: '100%', justifyContent: 'flex-end', backgroundColor: '#1f1f1f', borderRadius: 6 },
  barFill: { width: '100%', borderRadius: 6 },
  barLabel: { fontSize: 10 },
  barDetail: { marginTop: 10, fontSize: 12, color: COLORS.accent },
  todayCard: {
    backgroundColor: 'rgba(200,255,87,0.08)',
    borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 0.5, borderColor: 'rgba(200,255,87,0.3)', marginBottom: 12,
  },
  planIcon: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: 'rgba(200,255,87,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  planName: { fontWeight: '700', color: COLORS.white, fontSize: 16 },
  planMeta: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  planRecovery: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  freqRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  freqPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.card, borderRadius: 12, padding: 10,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  freqPillActive: { borderColor: 'rgba(200,255,87,0.3)', backgroundColor: 'rgba(200,255,87,0.06)' },
  freqEmoji: { fontSize: 14 },
  freqLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600', flex: 1 },
  freqCount: { fontSize: 11, fontWeight: '800' },
  freqDot: { width: 6, height: 6, borderRadius: 3 },
  insightRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    backgroundColor: COLORS.card, borderRadius: 12, padding: 10,
    marginBottom: 16, borderWidth: 0.5, borderColor: COLORS.border,
  },
  insightText: { fontSize: 12, fontWeight: '600' },
  insightTextMuted: { fontSize: 12, color: COLORS.amber, fontWeight: '500' },
  recentCard: { marginBottom: 12 },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentName: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
  recentDate: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  recentStats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recentStat: { color: COLORS.accent, fontSize: 13, fontWeight: '600' },
  recentStatSep: { color: COLORS.muted, fontSize: 13 },
});

// Settings modal styles
const settStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
    borderTopWidth: 0.5, borderColor: COLORS.border,
  },
  handle: {
    width: 36, height: 4, backgroundColor: COLORS.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: 20,
  },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.white, marginBottom: 20 },
  label: { color: COLORS.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: COLORS.card, borderRadius: 12,
    borderWidth: 0.5, borderColor: COLORS.border,
    color: COLORS.white, fontSize: 15, padding: 12, height: 46,
  },
  goalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goalBtn: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'transparent',
  },
  goalBtnActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(200,255,87,0.1)' },
  goalText: { color: COLORS.muted, fontSize: 13 },
  goalTextActive: { color: COLORS.accent, fontWeight: '600' },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  restUnit: { color: COLORS.muted, fontSize: 14 },
  saveBtn: {
    marginTop: 24, backgroundColor: COLORS.accent,
    borderRadius: 14, paddingVertical: 15, alignItems: 'center',
  },
  saveBtnText: { color: '#0f0f0f', fontWeight: '700', fontSize: 16 },
});
