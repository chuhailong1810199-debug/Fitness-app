import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../theme/colors';
import { Card, ProgressBar, PrimaryButton } from '../components/UI';
import { WORKOUT_PLANS } from '../data/workoutData';
import { addSession, updatePRsFromSession, toDateStr, toDateLabel } from '../services/storage';

// Rest timer banner that auto-dismisses after 8 seconds
function RestTimerBanner({ visible, onStart, onDismiss }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef(null);

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(onDismiss, 8000);
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      clearTimeout(dismissTimer.current);
    }
    return () => clearTimeout(dismissTimer.current);
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.restBanner, { opacity }]}>
      <Text style={styles.restBannerText}>⏱ Bắt đầu nghỉ?</Text>
      <TouchableOpacity style={styles.restBannerBtn} onPress={onStart} activeOpacity={0.8}>
        <Text style={styles.restBannerBtnText}>Bắt đầu 60s</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} style={{ paddingHorizontal: 8 }}>
        <Text style={{ color: COLORS.muted, fontSize: 18 }}>×</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function WorkoutScreen({ route, navigation }) {
  const planIndex = route?.params?.planIndex ?? 0;
  const plan = WORKOUT_PLANS[planIndex];

  const [setsData, setSetsData] = useState(() => {
    const init = {};
    plan.exercises.forEach((ex, ei) => {
      ex.sets.forEach((s, si) => {
        init[`${ei}-${si}`] = { weight: String(s.weight), reps: String(s.reps) };
      });
    });
    return init;
  });

  const [completed, setCompleted] = useState({});
  const [saved, setSaved] = useState(false);
  const [showRestBanner, setShowRestBanner] = useState(false);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const init = {};
    plan.exercises.forEach((ex, ei) => {
      ex.sets.forEach((s, si) => {
        init[`${ei}-${si}`] = { weight: String(s.weight), reps: String(s.reps) };
      });
    });
    setSetsData(init);
    setCompleted({});
    setSaved(false);
    setShowRestBanner(false);
    startTimeRef.current = Date.now();
  }, [planIndex]);

  const totalSets = plan.exercises.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = Object.values(completed).filter(Boolean).length;
  const percent = Math.round((doneSets / totalSets) * 100);

  function toggleSet(key) {
    const wasCompleted = !!completed[key];
    setCompleted(prev => ({ ...prev, [key]: !prev[key] }));
    // Show rest banner when a set is newly completed
    if (!wasCompleted) setShowRestBanner(true);
  }

  function updateField(key, field, value) {
    setSetsData(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  function handleStartRestTimer() {
    setShowRestBanner(false);
    navigation.navigate('Timer');
  }

  async function saveSession() {
    const now = new Date();
    const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);

    const exercises = plan.exercises.map((ex, ei) => ({
      name: ex.name,
      nameVi: ex.nameVi,
      sets: ex.sets.map((_, si) => {
        const key = `${ei}-${si}`;
        return {
          weight: setsData[key]?.weight ?? '0',
          reps: setsData[key]?.reps ?? '0',
          done: !!completed[key],
        };
      }),
    }));

    let totalVolume = 0;
    exercises.forEach(ex => {
      ex.sets.forEach(s => {
        if (s.done) {
          totalVolume += (parseFloat(s.weight) || 0) * (parseInt(s.reps, 10) || 0);
        }
      });
    });

    const session = {
      id: String(Date.now()),
      planId: plan.id,
      planName: plan.nameVi,
      planColor: plan.color,
      planBorderColor: plan.borderColor,
      date: toDateStr(now),
      dateLabel: toDateLabel(now),
      exercises,
      totalSets: doneSets,
      totalVolume: Math.round(totalVolume),
      durationSeconds,
    };

    await addSession(session);
    await updatePRsFromSession(session);
    setSaved(true);
  }

  async function handleFinish() {
    if (percent < 100) {
      Alert.alert(
        'Chưa hoàn thành',
        `Bạn mới hoàn thành ${doneSets}/${totalSets} set. Kết thúc sớm?`,
        [
          { text: 'Tiếp tục tập', style: 'cancel' },
          {
            text: 'Kết thúc',
            style: 'destructive',
            onPress: async () => {
              await saveSession();
              Alert.alert('Đã lưu!', `Buổi tập đã được ghi lại (${doneSets}/${totalSets} set).`);
            },
          },
        ]
      );
    } else {
      await saveSession();
    }
  }

  function formatDuration(ms) {
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return `${totalMin} phút`;
    return `${Math.floor(totalMin / 60)}h ${totalMin % 60}ph`;
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Rest timer banner — pinned above the scroll area */}
      <RestTimerBanner
        visible={showRestBanner}
        onStart={handleStartRestTimer}
        onDismiss={() => setShowRestBanner(false)}
      />

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

        {/* Finish / Complete */}
        {saved && percent === 100 ? (
          <View style={styles.completeBox}>
            <Text style={{ fontSize: 32 }}>🎉</Text>
            <Text style={styles.completeText}>Hoàn thành xuất sắc!</Text>
            <Text style={styles.completeSub}>{doneSets} set · {formatDuration(Date.now() - startTimeRef.current)}</Text>
          </View>
        ) : (
          <PrimaryButton
            label={`Kết thúc (${doneSets}/${totalSets} set)`}
            onPress={handleFinish}
            style={{ marginBottom: 24 }}
          />
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
    gap: 8, marginBottom: 8, padding: 6, borderRadius: 10,
  },
  setRowDone: { opacity: 0.5 },
  setNum: { color: '#444', fontSize: 13, width: 24 },
  input: {
    width: 64, height: 36,
    backgroundColor: COLORS.cardDark,
    borderRadius: 8, borderWidth: 0.5, borderColor: COLORS.border,
    color: COLORS.white, textAlign: 'center', fontSize: 14,
  },
  inputDone: { opacity: 0.4 },
  checkBtn: {
    flex: 1, height: 32, borderRadius: 8,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignSelf: 'flex-end', marginLeft: 'auto', width: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  checkBtnDone: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  completeBox: {
    backgroundColor: 'rgba(200,255,87,0.08)',
    borderRadius: 16, padding: 24, alignItems: 'center',
    borderWidth: 0.5, borderColor: 'rgba(200,255,87,0.3)', marginBottom: 24,
  },
  completeText: { color: COLORS.accent, fontWeight: '700', fontSize: 18, marginTop: 8 },
  completeSub: { color: COLORS.muted, fontSize: 13, marginTop: 4 },

  // Rest timer banner
  restBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
    paddingHorizontal: 16, paddingVertical: 10, gap: 10,
  },
  restBannerText: { flex: 1, color: COLORS.mutedLight, fontSize: 13 },
  restBannerBtn: {
    backgroundColor: COLORS.accent, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  restBannerBtnText: { color: '#0f0f0f', fontWeight: '700', fontSize: 12 },
});
