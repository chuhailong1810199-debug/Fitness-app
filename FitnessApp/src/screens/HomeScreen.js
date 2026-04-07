import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/colors';
import { Card, SectionHeader, StatCard } from '../components/UI';
import { WEEKLY_DATA, WORKOUT_PLANS } from '../data/workoutData';

const { width } = Dimensions.get('window');
const BAR_MAX = 80;

export default function HomeScreen({ navigation }) {
  const [selectedBar, setSelectedBar] = useState(null);
  const totalSets = WEEKLY_DATA.reduce((a, b) => a + b.sets, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Chào buổi sáng 👋</Text>
          <Text style={styles.title}>Tuần này</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <StatCard value="3 🔥" label="ngày liên tiếp" color={COLORS.amber} style={{ borderColor: COLORS.amber + '30' }} />
          <View style={{ width: 10 }} />
          <StatCard value="5" label="buổi tập" color={COLORS.white} />
          <View style={{ width: 10 }} />
          <StatCard value={totalSets} label="tổng set" color={COLORS.accent} style={{ borderColor: COLORS.accent + '30' }} />
        </View>

        {/* Weekly Chart */}
        <SectionHeader title="Khối lượng tuần" />
        <Card>
          <View style={styles.chart}>
            {WEEKLY_DATA.map((d, i) => {
              const barH = d.sets ? Math.round((d.sets / BAR_MAX) * 80) : 4;
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
              {WEEKLY_DATA[selectedBar].date} · {WEEKLY_DATA[selectedBar].sets || 0} sets
            </Text>
          )}
        </Card>

        {/* Today's Plan */}
        <SectionHeader title="Kế hoạch hôm nay" />
        <TouchableOpacity
          style={styles.todayCard}
          onPress={() => navigation.navigate('Workout')}
          activeOpacity={0.85}
        >
          <View style={styles.planIcon}>
            <Text style={{ fontSize: 24 }}>{WORKOUT_PLANS[0].emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.planName}>{WORKOUT_PLANS[0].nameVi}</Text>
            <Text style={styles.planMeta}>3 bài · {WORKOUT_PLANS[0].duration}</Text>
          </View>
          <Text style={{ color: COLORS.accent, fontSize: 20 }}>›</Text>
        </TouchableOpacity>

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
  mutedLight: COLORS.mutedLight,
});
