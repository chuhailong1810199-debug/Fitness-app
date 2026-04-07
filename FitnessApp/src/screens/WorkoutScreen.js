import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/colors';
import { Card, ProgressBar, PrimaryButton } from '../components/UI';
import { WORKOUT_PLANS } from '../data/workoutData';

export default function WorkoutScreen({ route }) {
  const planIndex = route?.params?.planIndex ?? 0;
  const plan = WORKOUT_PLANS[planIndex];

  // Track sets data: { 'exIdx-setIdx': { weight, reps } }
  const [setsData, setSetsData] = useState(() => {
    const init = {};
    plan.exercises.forEach((ex, ei) => {
      ex.sets.forEach((s, si) => {
        init[`${ei}-${si}`] = { weight: String(s.weight), reps: String(s.reps) };
      });
    });
    return init;
  });

  // Track completed sets
  const [completed, setCompleted] = useState({});

  const totalSets = plan.exercises.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = Object.values(completed).filter(Boolean).length;
  const percent = Math.round((doneSets / totalSets) * 100);

  function toggleSet(key) {
    setCompleted(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function updateField(key, field, value) {
    setSetsData(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  function handleFinish() {
    if (percent < 100) {
      Alert.alert(
        'Chưa hoàn thành',
        `Bạn mới hoàn thành ${doneSets}/${totalSets} set. Kết thúc sớm?`,
        [
          { text: 'Tiếp tục tập', style: 'cancel' },
          { text: 'Kết thúc', style: 'destructive', onPress: () => Alert.alert('Đã lưu!', 'Buổi tập đã được ghi lại.') },
        ]
      );
    } else {
      Alert.alert('🎉 Xuất sắc!', 'Bạn đã hoàn thành toàn bộ buổi tập!');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
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
            <Text style={styles.exName}>{ex.nameVi}</Text>
            <Text style={styles.exNameEn}>{ex.name}</Text>

            {/* Column headers */}
            <View style={styles.setHeader}>
              <Text style={[styles.setHeaderText, { width: 24 }]}>#</Text>
              <Text style={[styles.setHeaderText, styles.inputCol]}>KG</Text>
              <Text style={[styles.setHeaderText, styles.inputCol]}>REPS</Text>
              <Text style={[styles.setHeaderText, { flex: 1, textAlign: 'right' }]}>✓</Text>
            </View>

            {ex.sets.map((_, si) => {
              const key = `${ei}-${si}`;
              const isDone = completed[key];
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
        {percent === 100 ? (
          <View style={styles.completeBox}>
            <Text style={{ fontSize: 32 }}>🎉</Text>
            <Text style={styles.completeText}>Hoàn thành xuất sắc!</Text>
            <Text style={styles.completeSub}>{doneSets} set đã hoàn thành</Text>
          </View>
        ) : (
          <PrimaryButton label={`Kết thúc (${doneSets}/${totalSets} set)`} onPress={handleFinish} style={{ marginBottom: 24 }} />
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 16, marginBottom: 16 },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.white },
  subtitle: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  progressLabel: { fontSize: 12, color: COLORS.accent, minWidth: 36, textAlign: 'right' },
  exCard: { marginBottom: 14 },
  exName: { fontSize: 16, fontWeight: '700', color: COLORS.white, marginBottom: 2 },
  exNameEn: { fontSize: 12, color: COLORS.muted, marginBottom: 10 },
  setHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  setHeaderText: { fontSize: 10, color: '#444', fontWeight: '700', letterSpacing: 0.5 },
  inputCol: { width: 64, textAlign: 'center' },
  setRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 8, padding: 6,
    borderRadius: 10,
  },
  setRowDone: { opacity: 0.5 },
  setNum: { color: '#444', fontSize: 13, width: 24 },
  input: {
    width: 64, height: 36,
    backgroundColor: COLORS.cardDark,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    color: COLORS.white,
    textAlign: 'center',
    fontSize: 14,
  },
  inputDone: { opacity: 0.4 },
  checkBtn: {
    flex: 1,
    height: 32, width: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 0,
    alignSelf: 'flex-end',
    marginLeft: 'auto',
    width: 32,
    alignItems: 'center',
  },
  checkBtnDone: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  completeBox: {
    backgroundColor: 'rgba(200,255,87,0.08)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(200,255,87,0.3)',
    marginBottom: 24,
  },
  completeText: { color: COLORS.accent, fontWeight: '700', fontSize: 18, marginTop: 8 },
  completeSub: { color: COLORS.muted, fontSize: 13, marginTop: 4 },
});
