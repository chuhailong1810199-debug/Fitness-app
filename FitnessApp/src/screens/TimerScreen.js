import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS } from '../theme/colors';
import { Card, SectionHeader, GhostButton, PrimaryButton } from '../components/UI';
import { getSessions } from '../services/storage';

const PRESET_DURATIONS = [30, 60, 90, 120];

export default function TimerScreen() {
  const [duration, setDuration] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [running, setRunning] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [recentSessions, setRecentSessions] = useState([]);
  const [plateTarget, setPlateTarget] = useState('');
  const [barbellKg, setBarbellKg] = useState(20);
  const [ormWeight, setOrmWeight] = useState('');
  const [ormReps, setOrmReps] = useState('');
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  // Reload recent sessions on focus so data is fresh after a workout
  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        const sessions = await getSessions();
        if (!active) return;
        setRecentSessions(sessions.slice(0, 5));
      }
      load();
      return () => { active = false; };
    }, [])
  );

  function start() {
    if (remaining === 0 || running) return;
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function pause() {
    clearInterval(intervalRef.current);
    setRunning(false);
  }

  function reset() {
    clearInterval(intervalRef.current);
    setRunning(false);
    setRemaining(duration);
  }

  function selectDuration(d) {
    clearInterval(intervalRef.current);
    setRunning(false);
    setDuration(d);
    setRemaining(d);
    setShowCustom(false);
  }

  function applyCustomDuration() {
    const secs = parseInt(customInput, 10);
    if (secs && secs >= 5 && secs <= 600) {
      selectDuration(secs);
      setCustomInput('');
    }
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function formatDuration(durationSeconds) {
    if (!durationSeconds) return '—';
    const h = Math.floor(durationSeconds / 3600);
    const m = Math.round((durationSeconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}ph`;
    return `${m} phút`;
  }

  const SIZE = 180;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = 76;
  const CIRC = 2 * Math.PI * R;
  const pct = remaining / duration;
  const dash = CIRC * pct;
  const timerColor = remaining === 0 ? COLORS.red : COLORS.accent;
  const isPreset = PRESET_DURATIONS.includes(duration);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.header}>
          <Text style={styles.subtitle}>Giữa các set</Text>
          <Text style={styles.title}>Hẹn giờ nghỉ</Text>
        </View>

        {/* Timer Card */}
        <Card style={styles.timerCard}>
          <View style={styles.circleWrap}>
            <Svg width={SIZE} height={SIZE}>
              <Circle cx={cx} cy={cy} r={R} fill="none" stroke="#222" strokeWidth={10} />
              <Circle
                cx={cx} cy={cy} r={R}
                fill="none"
                stroke={timerColor}
                strokeWidth={10}
                strokeDasharray={`${dash} ${CIRC}`}
                strokeLinecap="round"
                rotation="-90"
                origin={`${cx}, ${cy}`}
              />
            </Svg>
            <View style={styles.timerCenter}>
              <Text style={[styles.timerText, { color: timerColor }]}>
                {formatTime(remaining)}
              </Text>
              <Text style={styles.timerStatus}>
                {running ? 'đang nghỉ...' : remaining === 0 ? 'hết giờ!' : 'sẵn sàng'}
              </Text>
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            {!running ? (
              <PrimaryButton label="Bắt đầu" onPress={start} style={{ flex: 1 }} />
            ) : (
              <GhostButton label="Tạm dừng" onPress={pause} style={{ flex: 1 }} />
            )}
            <View style={{ width: 10 }} />
            <GhostButton label="Đặt lại" onPress={reset} style={{ flex: 1 }} />
          </View>
        </Card>

        {/* Duration Presets */}
        <SectionHeader title="Thời gian nghỉ" />
        <Card>
          <View style={styles.presets}>
            {PRESET_DURATIONS.map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.presetBtn, duration === d && styles.presetBtnActive]}
                onPress={() => selectDuration(d)}
                activeOpacity={0.7}
              >
                <Text style={[styles.presetText, duration === d && styles.presetTextActive]}>
                  {d}s
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.presetBtn, !isPreset && styles.presetBtnActive, { flex: 1.2 }]}
              onPress={() => setShowCustom(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={[styles.presetText, !isPreset && styles.presetTextActive]}>
                {!isPreset ? `${duration}s` : 'Tùy chỉnh'}
              </Text>
            </TouchableOpacity>
          </View>

          {showCustom && (
            <View style={styles.customRow}>
              <TextInput
                style={styles.customInput}
                value={customInput}
                onChangeText={setCustomInput}
                keyboardType="number-pad"
                placeholder="vd: 150"
                placeholderTextColor={COLORS.muted}
                returnKeyType="done"
                onSubmitEditing={applyCustomDuration}
                selectTextOnFocus
              />
              <Text style={styles.customUnit}>giây</Text>
              <TouchableOpacity style={styles.customApply} onPress={applyCustomDuration} activeOpacity={0.8}>
                <Text style={styles.customApplyText}>OK</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* Recent Workouts */}
        <SectionHeader title="Buổi tập gần đây" />
        {recentSessions.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>Chưa có buổi tập nào. Hãy tập ngay! 💪</Text>
          </View>
        ) : (
          recentSessions.map((s) => (
            <View key={s.id} style={styles.recentRow}>
              <View>
                <Text style={styles.recentName}>{s.planName}</Text>
                <Text style={styles.recentDate}>{s.dateLabel}</Text>
              </View>
              <View style={styles.restBadge}>
                <Text style={styles.restBadgeText}>{formatDuration(s.durationSeconds)}</Text>
              </View>
            </View>
          ))
        )}

        {/* Plate Calculator */}
        <SectionHeader title="Tính tạ đĩa" />
        <PlateCalculator
          target={plateTarget}
          onTargetChange={setPlateTarget}
          barbellKg={barbellKg}
          onBarbellChange={setBarbellKg}
        />

        {/* 1RM Estimator */}
        <SectionHeader title="Ước tính 1RM" />
        <OrmEstimator
          weight={ormWeight}
          reps={ormReps}
          onWeightChange={setOrmWeight}
          onRepsChange={setOrmReps}
        />

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Plate Calculator ─────────────────────────────────
const PLATE_SIZES = [20, 15, 10, 5, 2.5, 1.25]; // kg
const BARBELL_OPTIONS = [20, 15, 10]; // common bar weights

function computePlates(targetKg, barbellKg) {
  const perSide = (targetKg - barbellKg) / 2;
  if (perSide <= 0) return [];
  const plates = [];
  let rem = perSide;
  for (const size of PLATE_SIZES) {
    const count = Math.floor(rem / size + 0.001);
    if (count > 0) {
      plates.push({ size, count });
      rem -= size * count;
    }
  }
  return plates;
}

function PlateCalculator({ target, onTargetChange, barbellKg, onBarbellChange }) {
  const targetNum = parseFloat(target) || 0;
  const plates = targetNum > barbellKg ? computePlates(targetNum, barbellKg) : [];
  const achievable = plates.reduce((sum, p) => sum + p.size * p.count * 2, 0) + barbellKg;
  const exact = Math.abs(achievable - targetNum) < 0.01;

  const PLATE_COLORS = {
    20: '#FF5757', 15: '#FFB847', 10: '#4FC3F7',
    5:  '#81C784', 2.5: '#CE93D8', 1.25: '#BCAAA4',
  };

  return (
    <Card style={plateStyles.card}>
      {/* Bar weight selector */}
      <View style={plateStyles.barRow}>
        <Text style={plateStyles.label}>Đòn tạ:</Text>
        {BARBELL_OPTIONS.map(b => (
          <TouchableOpacity
            key={b}
            style={[plateStyles.barBtn, barbellKg === b && plateStyles.barBtnActive]}
            onPress={() => onBarbellChange(b)}
            activeOpacity={0.7}
          >
            <Text style={[plateStyles.barBtnText, barbellKg === b && plateStyles.barBtnTextActive]}>
              {b} kg
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Target input */}
      <View style={plateStyles.inputRow}>
        <TextInput
          style={plateStyles.input}
          value={target}
          onChangeText={onTargetChange}
          keyboardType="decimal-pad"
          placeholder="Nhập tổng kg…"
          placeholderTextColor={COLORS.muted}
          selectTextOnFocus
        />
        <Text style={plateStyles.inputUnit}>kg</Text>
      </View>

      {/* Result */}
      {targetNum > 0 && targetNum <= barbellKg && (
        <Text style={plateStyles.hint}>Nhỏ hơn hoặc bằng đòn tạ ({barbellKg} kg)</Text>
      )}
      {plates.length > 0 && (
        <>
          <Text style={plateStyles.perSideLabel}>Mỗi bên:</Text>
          <View style={plateStyles.platesRow}>
            {plates.map((p, i) => (
              <View
                key={i}
                style={[plateStyles.plateDisk, { backgroundColor: PLATE_COLORS[p.size] ?? COLORS.border }]}
              >
                <Text style={plateStyles.plateSize}>{p.size}</Text>
                {p.count > 1 && <Text style={plateStyles.plateCount}>×{p.count}</Text>}
              </View>
            ))}
          </View>
          {!exact && (
            <Text style={plateStyles.hint}>
              Tổng thực tế: {achievable} kg (gần nhất có thể)
            </Text>
          )}
        </>
      )}
    </Card>
  );
}

const plateStyles = StyleSheet.create({
  card: { marginBottom: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  label: { color: COLORS.muted, fontSize: 13, marginRight: 4 },
  barBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border,
  },
  barBtnActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(200,255,87,0.1)' },
  barBtnText: { color: COLORS.muted, fontSize: 12, fontWeight: '500' },
  barBtnTextActive: { color: COLORS.accent },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  input: {
    flex: 1, height: 48, backgroundColor: COLORS.cardDark,
    borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.border,
    color: COLORS.white, fontSize: 20, fontWeight: '700', textAlign: 'center',
  },
  inputUnit: { color: COLORS.muted, fontSize: 16, minWidth: 24 },
  perSideLabel: { color: COLORS.muted, fontSize: 12, marginBottom: 10 },
  platesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  plateDisk: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  plateSize: { color: '#0f0f0f', fontWeight: '800', fontSize: 13 },
  plateCount: { color: '#0f0f0f', fontSize: 9, fontWeight: '700', marginTop: -2 },
  hint: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
});

// ── 1RM Estimator ────────────────────────────────────
// Uses Epley formula: 1RM ≈ weight × (1 + reps / 30)
// Also shows percentages of 1RM for common training zones

const TRAINING_ZONES = [
  { pct: 95, reps: '1–2',  label: 'Sức mạnh tối đa' },
  { pct: 85, reps: '5–6',  label: 'Sức mạnh' },
  { pct: 75, reps: '8–10', label: 'Tăng cơ' },
  { pct: 65, reps: '12–15',label: 'Sức bền cơ' },
];

function OrmEstimator({ weight, reps, onWeightChange, onRepsChange }) {
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps, 10) || 0;
  const orm = (w > 0 && r > 0 && r <= 30)
    ? Math.round(w * (1 + r / 30))
    : null;

  return (
    <Card style={ormStyles.card}>
      <View style={ormStyles.inputsRow}>
        <View style={ormStyles.inputGroup}>
          <Text style={ormStyles.inputLabel}>Trọng lượng</Text>
          <View style={ormStyles.inputWrap}>
            <TextInput
              style={ormStyles.input}
              value={weight}
              onChangeText={onWeightChange}
              keyboardType="decimal-pad"
              placeholder="100"
              placeholderTextColor={COLORS.muted}
              selectTextOnFocus
            />
            <Text style={ormStyles.unit}>kg</Text>
          </View>
        </View>
        <View style={ormStyles.inputGroup}>
          <Text style={ormStyles.inputLabel}>Số reps</Text>
          <View style={ormStyles.inputWrap}>
            <TextInput
              style={ormStyles.input}
              value={reps}
              onChangeText={onRepsChange}
              keyboardType="number-pad"
              placeholder="5"
              placeholderTextColor={COLORS.muted}
              selectTextOnFocus
            />
            <Text style={ormStyles.unit}>reps</Text>
          </View>
        </View>
      </View>

      {orm !== null ? (
        <>
          <View style={ormStyles.resultBox}>
            <Text style={ormStyles.resultLabel}>Ước tính 1RM</Text>
            <Text style={ormStyles.resultVal}>{orm} <Text style={ormStyles.resultUnit}>kg</Text></Text>
          </View>
          <View style={ormStyles.zonesWrap}>
            {TRAINING_ZONES.map((z, i) => {
              const zWeight = Math.round(orm * z.pct / 100);
              return (
                <View key={i} style={ormStyles.zoneRow}>
                  <View style={ormStyles.zoneLeft}>
                    <Text style={ormStyles.zonePct}>{z.pct}%</Text>
                    <Text style={ormStyles.zoneLabel}>{z.label}</Text>
                  </View>
                  <View style={ormStyles.zoneRight}>
                    <Text style={ormStyles.zoneWeight}>{zWeight} kg</Text>
                    <Text style={ormStyles.zoneReps}>{z.reps} reps</Text>
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={ormStyles.disclaimer}>* Epley formula — chỉ mang tính tham khảo</Text>
        </>
      ) : (
        <Text style={ormStyles.placeholder}>
          Nhập trọng lượng và số reps để tính 1RM
        </Text>
      )}
    </Card>
  );
}

const ormStyles = StyleSheet.create({
  card: { marginBottom: 8 },
  inputsRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  inputGroup: { flex: 1 },
  inputLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    flex: 1, height: 44, backgroundColor: COLORS.cardDark,
    borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.border,
    color: COLORS.white, fontSize: 18, fontWeight: '700', textAlign: 'center',
  },
  unit: { color: COLORS.muted, fontSize: 12, minWidth: 28 },
  resultBox: {
    backgroundColor: 'rgba(200,255,87,0.08)', borderRadius: 12,
    padding: 14, alignItems: 'center', marginBottom: 14,
    borderWidth: 0.5, borderColor: 'rgba(200,255,87,0.25)',
  },
  resultLabel: { color: COLORS.muted, fontSize: 12, marginBottom: 4 },
  resultVal: { color: COLORS.accent, fontSize: 36, fontWeight: '800' },
  resultUnit: { fontSize: 18, fontWeight: '400', color: COLORS.muted },
  zonesWrap: { gap: 6 },
  zoneRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border,
  },
  zoneLeft: { flex: 1 },
  zonePct: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  zoneLabel: { color: COLORS.muted, fontSize: 11, marginTop: 1 },
  zoneRight: { alignItems: 'flex-end' },
  zoneWeight: { color: COLORS.accent, fontWeight: '700', fontSize: 14 },
  zoneReps: { color: COLORS.muted, fontSize: 11, marginTop: 1 },
  disclaimer: { color: '#333', fontSize: 10, marginTop: 10, textAlign: 'center' },
  placeholder: { color: COLORS.muted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 20 },
  header: { paddingTop: 16, marginBottom: 20 },
  subtitle: { fontSize: 13, color: COLORS.muted, marginBottom: 4 },
  title: { fontSize: 36, fontWeight: '800', color: COLORS.white },
  timerCard: { alignItems: 'center', paddingVertical: 28 },
  circleWrap: {
    position: 'relative', width: 180, height: 180,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  timerCenter: { position: 'absolute', alignItems: 'center' },
  timerText: { fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  timerStatus: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  controls: { flexDirection: 'row', width: '100%', paddingHorizontal: 8 },
  presets: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: 'transparent', alignItems: 'center',
  },
  presetBtnActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(200,255,87,0.1)' },
  presetText: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  presetTextActive: { color: COLORS.accent },
  customRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 0.5, borderTopColor: COLORS.border,
  },
  customInput: {
    flex: 1, height: 40, backgroundColor: COLORS.cardDark,
    borderRadius: 10, borderWidth: 0.5, borderColor: COLORS.border,
    color: COLORS.white, textAlign: 'center', fontSize: 16,
  },
  customUnit: { color: COLORS.muted, fontSize: 13 },
  customApply: {
    backgroundColor: COLORS.accent, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  customApplyText: { color: '#0f0f0f', fontWeight: '700', fontSize: 14 },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.card, padding: 14, borderRadius: 12, marginBottom: 8,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  recentName: { color: COLORS.white, fontSize: 14, fontWeight: '500' },
  recentDate: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  restBadge: {
    backgroundColor: 'rgba(200,255,87,0.15)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  restBadgeText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },
  emptyRow: {
    backgroundColor: COLORS.card, padding: 16, borderRadius: 12,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  emptyText: { color: COLORS.muted, fontSize: 13, textAlign: 'center' },
});
