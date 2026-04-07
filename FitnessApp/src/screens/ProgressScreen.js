import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/colors';
import { Card, SectionHeader, Divider } from '../components/UI';
import { WORKOUT_HISTORY } from '../data/workoutData';

const LIFETIME_STATS = [
  { value: '42', label: 'buổi tập', color: COLORS.accent },
  { value: '187k', label: 'kg đã nâng', color: COLORS.white },
  { value: '34h', label: 'giờ tập', color: COLORS.amber },
  { value: '3 🔥', label: 'ngày liên tiếp', color: COLORS.red },
];

export default function ProgressScreen() {
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
          {LIFETIME_STATS.map((s, i) => (
            <View key={i} style={styles.statCard}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Personal Records */}
        <SectionHeader title="Kỷ lục cá nhân (PR)" />
        <Card>
          {[
            { name: 'Bench Press', pr: '90 kg', date: '15/3' },
            { name: 'Squat', pr: '120 kg', date: '22/3' },
            { name: 'Deadlift', pr: '130 kg', date: '10/3' },
            { name: 'Overhead Press', pr: '60 kg', date: '18/3' },
          ].map((r, i, arr) => (
            <View key={i}>
              <View style={styles.prRow}>
                <View>
                  <Text style={styles.prName}>{r.name}</Text>
                  <Text style={styles.prDate}>{r.date}</Text>
                </View>
                <View style={styles.prBadge}>
                  <Text style={styles.prValue}>{r.pr}</Text>
                </View>
              </View>
              {i < arr.length - 1 && <Divider />}
            </View>
          ))}
        </Card>

        {/* Workout Log */}
        <SectionHeader title="Nhật ký tập luyện" />
        {WORKOUT_HISTORY.map((entry) => (
          <Card key={entry.id} style={styles.logCard}>
            <View style={styles.logTop}>
              <View>
                <Text style={styles.logName}>{entry.name}</Text>
                <Text style={styles.logDate}>{entry.date}</Text>
              </View>
              <View style={[styles.durationBadge, { backgroundColor: entry.color + '20', borderColor: entry.color + '40' }]}>
                <Text style={[styles.durationText, { color: entry.color }]}>{entry.duration}</Text>
              </View>
            </View>
            <Divider />
            <View style={styles.logStats}>
              <View>
                <Text style={styles.logStatVal}>{entry.sets} sets</Text>
                <Text style={styles.logStatLabel}>khối lượng</Text>
              </View>
              <View style={styles.logStatDivider} />
              <View>
                <Text style={styles.logStatVal}>{entry.volume}</Text>
                <Text style={styles.logStatLabel}>tổng kg</Text>
              </View>
            </View>
          </Card>
        ))}

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
  prValue: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
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
});
