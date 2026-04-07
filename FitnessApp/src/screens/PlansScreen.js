import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/colors';
import { SectionHeader } from '../components/UI';
import { WORKOUT_PLANS } from '../data/workoutData';

export default function PlansScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.subtitle}>Tuần này</Text>
          <Text style={styles.title}>Kế hoạch tập</Text>
        </View>

        <SectionHeader title="Chương trình PPL" />

        {WORKOUT_PLANS.map((plan, index) => (
          <TouchableOpacity
            key={plan.id}
            style={[styles.planCard, { backgroundColor: plan.color, borderColor: plan.borderColor }]}
            onPress={() => navigation.navigate('Workout', { planIndex: index })}
            activeOpacity={0.85}
          >
            <View style={[styles.iconWrap, { backgroundColor: plan.borderColor }]}>
              <Text style={{ fontSize: 26 }}>{plan.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>{plan.nameVi}</Text>
              <Text style={styles.planDays}>{plan.days}</Text>
              <Text style={styles.planTag}>{plan.tag}</Text>
            </View>
            <View style={styles.arrow}>
              <Text style={{ color: COLORS.muted, fontSize: 20 }}>›</Text>
            </View>
          </TouchableOpacity>
        ))}

        {/* Tips section */}
        <SectionHeader title="Tips tập luyện" />
        {[
          { icon: '💧', tip: 'Uống 2-3 lít nước mỗi ngày' },
          { icon: '😴', tip: 'Ngủ 7-9 tiếng để phục hồi cơ bắp' },
          { icon: '🥗', tip: 'Ăn đủ protein: 1.6-2.2g/kg cơ thể' },
          { icon: '🔁', tip: 'Nghỉ 48 tiếng giữa các buổi cùng nhóm cơ' },
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
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
    borderWidth: 0.5,
  },
  iconWrap: {
    width: 56, height: 56,
    borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  planName: { fontSize: 17, fontWeight: '700', color: COLORS.white },
  planDays: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  planTag: { fontSize: 11, color: '#555', marginTop: 3 },
  arrow: { padding: 4 },
  tipRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.card,
    padding: 14, borderRadius: 12, marginBottom: 8,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  tipText: { color: COLORS.mutedLight, fontSize: 13, flex: 1 },
});
