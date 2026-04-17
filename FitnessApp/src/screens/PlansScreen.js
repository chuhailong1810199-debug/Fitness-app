import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../theme/colors';
import { SectionHeader } from '../components/UI';
import { WORKOUT_PLANS } from '../data/workoutData';
import {
  getSessions, getLastSessionByPlan,
  getLastSessionIsoDates, getRecoveryStatus,
} from '../services/storage';

// Map JS day-of-week (0=Sun) to recommended plan index
const DAY_TO_PLAN = { 1: 0, 4: 0, 2: 1, 5: 1, 3: 2, 6: 2 };

const RECOVERY_CONFIG = {
  ready:      { label: '🟢 Sẵn sàng',       color: COLORS.accent },
  almost:     { label: '🟡 Gần sẵn sàng',   color: COLORS.amber },
  recovering: { label: '🔴 Đang hồi phục',  color: COLORS.red },
};

export default function PlansScreen({ navigation }) {
  const [lastByPlan, setLastByPlan] = useState({});
  const [recoveryByPlan, setRecoveryByPlan] = useState({});
  const todayPlanIndex = DAY_TO_PLAN[new Date().getDay()] ?? null;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        const sessions = await getSessions();
        if (!active) return;
        setLastByPlan(getLastSessionByPlan(sessions));
        const isoDates = getLastSessionIsoDates(sessions);
        const recovery = {};
        Object.entries(isoDates).forEach(([planId, isoDate]) => {
          recovery[planId] = getRecoveryStatus(isoDate);
        });
        setRecoveryByPlan(recovery);
      }
      load();
      return () => { active = false; };
    }, [])
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.subtitle}>Tuần này</Text>
          <Text style={styles.title}>Kế hoạch tập</Text>
        </View>

        <SectionHeader title="Chương trình PPL" />

        {WORKOUT_PLANS.map((plan, index) => {
          const isToday = index === todayPlanIndex;
          const lastDate = lastByPlan[plan.id];
          const recoveryStatus = recoveryByPlan[plan.id] ?? (lastDate ? 'ready' : null);
          const recoveryCfg = recoveryStatus ? RECOVERY_CONFIG[recoveryStatus] : null;

          return (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                { backgroundColor: plan.color, borderColor: plan.borderColor },
                isToday && styles.planCardToday,
              ]}
              onPress={() => navigation.navigate('Workout', { planIndex: index })}
              activeOpacity={0.85}
            >
              <View style={[styles.iconWrap, { backgroundColor: plan.borderColor }]}>
                <Text style={{ fontSize: 26 }}>{plan.emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.planName}>{plan.nameVi}</Text>
                  {isToday && (
                    <View style={styles.todayBadge}>
                      <Text style={styles.todayBadgeText}>Hôm nay</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.planDays}>{plan.days}</Text>
                <Text style={styles.planTag}>{plan.tag}</Text>

                <View style={styles.statusRow}>
                  {lastDate != null && (
                    <Text style={styles.lastDate}>Lần cuối: {lastDate}</Text>
                  )}
                  {recoveryCfg && (
                    <Text style={[styles.recoveryLabel, { color: recoveryCfg.color }]}>
                      {recoveryCfg.label}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.arrow}>
                <Text style={{ color: COLORS.muted, fontSize: 20 }}>›</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Tips section */}
        <SectionHeader title="Tips tập luyện" />
        {[
          { icon: '💧', tip: 'Uống 2-3 lít nước mỗi ngày' },
          { icon: '😴', tip: 'Ngủ 7-9 tiếng để phục hồi cơ bắp' },
          { icon: '🥗', tip: 'Ăn đủ protein: 1.6-2.2g/kg cơ thể' },
          { icon: '🔁', tip: 'Nghỉ 48 tiếng giữa các buổi cùng nhóm cơ' },
          { icon: '📈', tip: 'Tăng tạ 2-5% mỗi tuần để tiến bộ liên tục' },
        ].map((t, i) => (
          <View key={i} style={styles.tipRow}>
            <Text style={{ fontSize: 18 }}>{t.icon}</Text>
            <Text style={styles.tipText}>{t.tip}</Text>
          </View>
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
  planCard: {
    borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center',
    gap: 14, marginBottom: 12, borderWidth: 0.5,
  },
  planCardToday: { borderWidth: 1.5 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  planName: { fontSize: 17, fontWeight: '700', color: COLORS.white },
  todayBadge: {
    backgroundColor: 'rgba(200,255,87,0.2)',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
    borderWidth: 0.5, borderColor: 'rgba(200,255,87,0.5)',
  },
  todayBadgeText: { color: COLORS.accent, fontSize: 10, fontWeight: '700' },
  planDays: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  planTag: { fontSize: 11, color: '#555', marginTop: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' },
  lastDate: { fontSize: 11, color: COLORS.amber },
  recoveryLabel: { fontSize: 11, fontWeight: '600' },
  arrow: { padding: 4 },
  tipRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card,
    padding: 14, borderRadius: 12, marginBottom: 8,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  tipText: { color: COLORS.mutedLight, fontSize: 13, flex: 1 },
});
