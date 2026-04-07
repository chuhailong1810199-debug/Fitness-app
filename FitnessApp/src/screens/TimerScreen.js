import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { COLORS } from '../theme/colors';
import { Card, SectionHeader, GhostButton, PrimaryButton } from '../components/UI';

const DURATIONS = [30, 60, 90, 120];

const RECENT_RESTS = [
  { name: 'Bench Press', date: '29/3', rest: '60s' },
  { name: 'Squat', date: '26/3', rest: '90s' },
  { name: 'Pull-Ups', date: '24/3', rest: '45s' },
  { name: 'Overhead Press', date: '22/3', rest: '60s' },
];

export default function TimerScreen() {
  const [duration, setDuration] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  function start() {
    if (remaining === 0) return;
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
  }

  function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // SVG circle
  const SIZE = 180;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = 76;
  const CIRC = 2 * Math.PI * R;
  const pct = remaining / duration;
  const dash = CIRC * pct;
  const timerColor = remaining === 0 ? COLORS.red : COLORS.accent;

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
              {/* Track */}
              <Circle cx={cx} cy={cy} r={R} fill="none" stroke="#222" strokeWidth={10} />
              {/* Progress */}
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
              <PrimaryButton
                label="Bắt đầu"
                onPress={start}
                style={{ flex: 1 }}
              />
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
            {DURATIONS.map(d => (
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
          </View>
        </Card>

        {/* Recent Sessions */}
        <SectionHeader title="Buổi tập gần đây" />
        {RECENT_RESTS.map((r, i) => (
          <View key={i} style={styles.recentRow}>
            <View>
              <Text style={styles.recentName}>{r.name}</Text>
              <Text style={styles.recentDate}>{r.date}</Text>
            </View>
            <View style={styles.restBadge}>
              <Text style={styles.restBadgeText}>{r.rest}</Text>
            </View>
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
  timerCard: { alignItems: 'center', paddingVertical: 28 },
  circleWrap: { position: 'relative', width: 180, height: 180, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  timerCenter: { position: 'absolute', alignItems: 'center' },
  timerText: { fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  timerStatus: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  controls: { flexDirection: 'row', width: '100%', paddingHorizontal: 8 },
  presets: { flexDirection: 'row', gap: 10 },
  presetBtn: {
    flex: 1, paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  presetBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(200,255,87,0.1)',
  },
  presetText: { fontSize: 14, color: COLORS.muted, fontWeight: '500' },
  presetTextActive: { color: COLORS.accent },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    padding: 14, borderRadius: 12, marginBottom: 8,
    borderWidth: 0.5, borderColor: COLORS.border,
  },
  recentName: { color: COLORS.white, fontSize: 14, fontWeight: '500' },
  recentDate: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  restBadge: {
    backgroundColor: 'rgba(200,255,87,0.15)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
  },
  restBadgeText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },
});
