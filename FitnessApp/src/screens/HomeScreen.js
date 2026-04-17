import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions,
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
} from '../services/storage';

const { width } = Dimensions.get('window');
const BAR_MAX = 80;

// Map JS day of week (0=Sun) to plan index: Mon/Thu=Push, Tue/Fri=Pull, Wed/Sat=Leg
const DAY_TO_PLAN = { 1: 0, 4: 0, 2: 1, 5: 1, 3: 2, 6: 2 };

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Chào buổi sáng 👋';
  if (h < 18) return 'Chào buổi chiều 👋';
  return 'Chào buổi tối 👋';
}

function getTodayPlanIndex() {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ...
  return DAY_TO_PLAN[day] ?? 0;
}

export default function HomeScreen({ navigation }) {
  const [selectedBar, setSelectedBar] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [weeklyData, setWeeklyData] = useState(
    ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(day => ({ day, sets: 0, date: '' }))
  );
  const [streak, setStreak] = useState(0);
  const [weekSessions, setWeekSessions] = useState(0);
  const [totalSets, setTotalSets] = useState(0);

  // Reload on every focus so stats update after finishing a workout
  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        const all = await getSessions();
        if (!active) return;
        setSessions(all);
        setStreak(computeStreak(all));
        const weekly = computeWeeklyData(all);
        setWeeklyData(weekly);
        const thisWeek = getThisWeekSessions(all);
        setWeekSessions(thisWeek.length);
        setTotalSets(weekly.reduce((sum, d) => sum + d.sets, 0));
      }
      load();
      return () => { active = false; };
    }, [])
  );

  const todayPlanIndex = getTodayPlanIndex();
  const todayPlan = WORKOUT_PLANS[todayPlanIndex];
  const barMax = Math.max(...weeklyData.map(d => d.sets), 1);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.title}>Tuần này</Text>
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

        {/* Today's Plan */}
        <SectionHeader title="Kế hoạch hôm nay" />
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
          </View>
          <Text style={{ color: COLORS.accent, fontSize: 20 }}>›</Text>
        </TouchableOpacity>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 16, marginBottom: 20 },
  greeting: { fontSize: 13, color: COLORS.muted, marginBottom: 4 },
  title: { fontSize: 36, fontWeight: '800', color: COLORS.white, letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', marginBottom: 24 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barBg: { width: '100%', justifyContent: 'flex-end', backgroundColor: '#1f1f1f', borderRadius: 6 },
  barFill: { width: '100%', borderRadius: 6 },
  barLabel: { fontSize: 10 },
  barDetail: { marginTop: 10, fontSize: 12, color: COLORS.accent },
  todayCard: {
    backgroundColor: 'rgba(200,255,87,0.08)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(200,255,87,0.3)',
    marginBottom: 12,
  },
  planIcon: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: 'rgba(200,255,87,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  planName: { fontWeight: '700', color: COLORS.white, fontSize: 16 },
  planMeta: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  recentCard: { marginBottom: 12 },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recentName: { color: COLORS.white, fontWeight: '600', fontSize: 15 },
  recentDate: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  recentStats: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recentStat: { color: COLORS.accent, fontSize: 13, fontWeight: '600' },
  recentStatSep: { color: COLORS.muted, fontSize: 13 },
});
