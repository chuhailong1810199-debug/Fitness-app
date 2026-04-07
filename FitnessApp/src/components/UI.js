import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../theme/colors';

// ── Card ──────────────────────────────────────────────
export function Card({ children, style }) {
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

// ── Tag / Badge ───────────────────────────────────────
export function Tag({ label, color = COLORS.accent }) {
  return (
    <View style={[styles.tag, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  );
}

// ── Section Header ────────────────────────────────────
export function SectionHeader({ title }) {
  return (
    <Text style={styles.sectionHeader}>{title}</Text>
  );
}

// ── Primary Button ────────────────────────────────────
export function PrimaryButton({ label, onPress, style }) {
  return (
    <TouchableOpacity style={[styles.primaryBtn, style]} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Ghost Button ──────────────────────────────────────
export function GhostButton({ label, onPress, style }) {
  return (
    <TouchableOpacity style={[styles.ghostBtn, style]} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.ghostBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Progress Bar ──────────────────────────────────────
export function ProgressBar({ percent }) {
  return (
    <View style={styles.progressBg}>
      <View style={[styles.progressFg, { width: `${percent}%` }]} />
    </View>
  );
}

// ── Stat Card ─────────────────────────────────────────
export function StatCard({ value, label, color = COLORS.white, style }) {
  return (
    <View style={[styles.statCard, style]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Divider ───────────────────────────────────────────
export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: COLORS.border,
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeader: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 4,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#0f0f0f',
    fontWeight: '700',
    fontSize: 15,
  },
  ghostBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent + '55',
    backgroundColor: COLORS.card,
  },
  ghostBtnText: {
    color: COLORS.accent,
    fontWeight: '600',
    fontSize: 14,
  },
  progressBg: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFg: {
    height: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 4,
  },
  statCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    flex: 1,
    borderWidth: 0.5,
    borderColor: COLORS.border,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.muted,
  },
  divider: {
    height: 0.5,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },
});
