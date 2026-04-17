import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../theme/colors';
import { Card, SectionHeader, Divider } from '../components/UI';
import { getSessions, getPRs, computeLifetimeStats } from '../services/storage';

// Known exercises from workout plans — shown even before any session is saved
const DEFAULT_PR_EXERCISES = ['Bench Press', 'Squat', 'Romanian Deadlift', 'Overhead Press', 'Barbell Row'];

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}ph`;
  return `${m} phút`;
}

export default function ProgressScreen() {
  const [sessions, setSessions] = useState([]);
  const [prs, setPRs] = useState({});
  const [stats, setStats] = useState({ totalSessions: 0, volumeLabel: '0', totalHours: 0, streak: 0 });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        const [allSessions, allPRs] = await Promise.all([getSessions(), getPRs()]);
        if (!active) return;
        setSessions(allSessions);
        setPRs(allPRs);
        setStats(computeLifetimeStats(allSessions));
      }
      load();
      return () => { active = false; };
    }, [])
  );

  // Build PR rows: saved PRs first, then any default exercises not yet logged
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

        {/* Lifetime Stats Grid */}
        <SectionHeader title="Thống kê tổng" />
        <View style={styles.statsGrid}>
          {lifetimeCards.map((s, i) => (
            <View key={i} style={styles.statCard}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

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
            <Card key={entry.id} style={styles.logCard}>
              <View style={styles.logTop}>
                <View>
                  <Text style={styles.logName}>{entry.planName}</Text>
                  <Text style={styles.logDate}>{entry.dateLabel}</Text>
                </View>
                <View style={[styles.durationBadge, {
                  backgroundColor: 'rgba(200,255,87,0.1)',
                  borderColor: 'rgba(200,255,87,0.25)',
                }]}>
                  <Text style={[styles.durationText, { color: COLORS.accent }]}>
                    {formatDuration(entry.durationSeconds)}
                  </Text>
                </View>
              </View>
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
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 16, marginBottom: 20 },
  subtitle: { fontSize: 13, color: COLORS.muted, marginBottom: 4 },
  title: { fontSize: 36, fontWeight: '800', color: COLORS.white },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24,
  },
  statCard: {
    width: '47%',
    backgroundColor: COLORS.card,
    borderRadius: 14, padding: 16,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  statValue: { fontSize: 30, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 12, color: COLORS.muted },
  prRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4,
  },
  prName: { color: COLORS.white, fontSize: 14, fontWeight: '500' },
  prDate: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  prBadge: {
    backgroundColor: 'rgba(200,255,87,0.12)',
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20,
  },
  prBadgeEmpty: { backgroundColor: COLORS.cardDark },
  prValue: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
  prValueEmpty: { color: COLORS.muted },
  logCard: { marginBottom: 10 },
  logTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logName: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
  logDate: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  durationBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 0.5,
  },
  durationText: { fontSize: 12, fontWeight: '600' },
  logStats: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  logStatVal: { color: COLORS.white, fontSize: 14, fontWeight: '600' },
  logStatLabel: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  logStatDivider: {
    width: 0.5, height: 28,
    backgroundColor: COLORS.border,
  },
  emptyText: {
    color: COLORS.muted, fontSize: 14, textAlign: 'center',
    lineHeight: 22, paddingVertical: 8,
  },
});
