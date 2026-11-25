import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { COPTIC_ALPHABET } from '@/constants/CopticAlphabet';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

interface LetterScore {
  char: string;
  score: number;
  date: string;
}

const getSmallChar = (char: string) => {
  const code = char.charCodeAt(0);
  return String.fromCharCode(code + 1);
};

export function HandwritingStats({ onClose }: { onClose?: () => void }) {
  const colors = useThemeColors();
  const { isDark } = useTheme();
  const { t, isRTL, lang } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, { best: number, attempts: number, lastDate: string }>>({});
  const [summary, setSummary] = useState({ avg: 0, mastered: 0, total: 0 });
  const [isSmallMode, setIsSmallMode] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const savedScores = await AsyncStorage.getItem("@coptic_handwriting_v5_scores");
      if (savedScores) {
        const scores: LetterScore[] = JSON.parse(savedScores);
        const letterMap: Record<string, { best: number, attempts: number, lastDate: string }> = {};

        let totalScore = 0;
        let masteredCount = 0;

        scores.forEach(s => {
          if (!letterMap[s.char]) {
            letterMap[s.char] = { best: s.score, attempts: 1, lastDate: s.date };
          } else {
            letterMap[s.char].attempts++;
            if (s.score > letterMap[s.char].best) letterMap[s.char].best = s.score;
            if (new Date(s.date) > new Date(letterMap[s.char].lastDate)) letterMap[s.char].lastDate = s.date;
          }
        });

        const uniqueLetters = Object.keys(letterMap);
        uniqueLetters.forEach(char => {
          totalScore += letterMap[char].best;
          if (letterMap[char].best >= 85) masteredCount++;
        });

        setStats(letterMap);
        setSummary({
          avg: uniqueLetters.length > 0 ? Math.round(totalScore / uniqueLetters.length) : 0,
          mastered: masteredCount,
          total: scores.length
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: isDark ? '#000' : '#FFF' }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#070202' : '#F9F9F9' }]}>
      <View style={[styles.header, { borderBottomColor: isDark ? '#222' : '#EEE', flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.headerTitleRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{lang === 'ar' ? 'إحصائيات إتقان الكتابة' : 'Handwriting Mastery'}</Text>
          <View style={[styles.modeToggleContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity
              style={[styles.modeBtn, !isSmallMode && { backgroundColor: colors.gold }]}
              onPress={() => setIsSmallMode(false)}
            >
              <Text style={[styles.modeBtnText, !isSmallMode ? { color: "#FFF" } : { color: colors.text }]}>Ⲁ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, isSmallMode && { backgroundColor: colors.gold }]}
              onPress={() => setIsSmallMode(true)}
            >
              <Text style={[styles.modeBtnText, isSmallMode ? { color: "#FFF" } : { color: colors.text }]}>ⲁ</Text>
            </TouchableOpacity>
          </View>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={24} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Summary Cards */}
        <View style={[styles.summaryRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <LinearGradient colors={['#FFD700', '#B8860B']} style={styles.summaryCard}>
            <Feather name="award" size={24} color="#FFF" />
            <Text style={styles.summaryVal}>{summary.avg}%</Text>
            <Text style={styles.summaryLabel}>{lang === 'ar' ? 'متوسط الإتقان' : 'Avg Mastery'}</Text>
          </LinearGradient>

          <LinearGradient colors={['#4CAF50', '#2E7D32']} style={styles.summaryCard}>
            <Feather name="check-circle" size={24} color="#FFF" />
            <Text style={styles.summaryVal}>{summary.mastered}/64</Text>
            <Text style={styles.summaryLabel}>{lang === 'ar' ? 'حروف متقنة' : 'Mastered'}</Text>
          </LinearGradient>

          <LinearGradient colors={['#2196F3', '#1565C0']} style={styles.summaryCard}>
            <Feather name="edit-3" size={24} color="#FFF" />
            <Text style={styles.summaryVal}>{summary.total}</Text>
            <Text style={styles.summaryLabel}>{lang === 'ar' ? 'محاولات' : 'Attempts'}</Text>
          </LinearGradient>
        </View>

        {/* Letters Grid */}
        <Text style={[styles.sectionTitle, { color: colors.gold, textAlign: isRTL ? 'right' : 'left' }]}>{lang === 'ar' ? 'تفاصيل الحروف' : 'Letter Details'}</Text>
        <View style={[styles.grid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {COPTIC_ALPHABET.map((item, index) => {
            const displayChar = isSmallMode ? getSmallChar(item.char) : item.char;
            const letterStats = stats[displayChar];
            const hasData = !!letterStats;

            return (
              <Animated.View
                key={index}
                entering={FadeInDown.delay(index * 20)}
                style={[
                  styles.letterCard,
                  { backgroundColor: isDark ? '#1A1A1A' : '#FFF', borderColor: isDark ? '#333' : '#EEE' }
                ]}
              >
                <Text style={[styles.letterChar, { color: colors.text }]}>{displayChar}</Text>
                <Text style={[styles.letterName, { color: colors.gold }]}>{lang === 'ar' ? item.name.ar : item.name.en}</Text>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${hasData ? letterStats.best : 0}%`,
                        backgroundColor: hasData && letterStats.best >= 85 ? '#4CAF50' : colors.gold
                      }
                    ]}
                  />
                </View>

                <Text style={[styles.scoreText, { color: hasData ? colors.text : '#888' }]}>
                  {hasData ? `${letterStats.best}%` : (lang === 'ar' ? 'لم يتم' : 'No data')}
                </Text>

                {hasData && (
                  <Text style={styles.attemptsText}>{letterStats.attempts} {lang === 'ar' ? 'محاولات' : 'attempts'}</Text>
                )}
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: 'Cairo_700Bold' },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 15 },
  modeToggleContainer: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 10, padding: 2 },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, minWidth: 35, alignItems: 'center' },
  modeBtnText: { fontSize: 14, fontFamily: 'CSAvaVeni-Regular' },
  closeBtn: { padding: 5 },
  scrollContent: { padding: 15 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25, gap: 10 },
  summaryCard: {
    flex: 1,
    padding: 15,
    borderRadius: 15,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  summaryVal: { fontSize: 20, fontFamily: 'Cairo_700Bold', color: '#FFF', marginVertical: 5 },
  summaryLabel: { fontSize: 10, fontFamily: 'Cairo_600SemiBold', color: '#FFF', opacity: 0.9 },
  sectionTitle: { fontSize: 18, fontFamily: 'Cairo_700Bold', marginBottom: 15, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  letterCard: {
    width: (width - 40) / 3,
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 5,
  },
  letterChar: { fontSize: 24, fontFamily: 'CSAvaVeni-Regular' },
  letterName: { fontSize: 12, fontFamily: 'Cairo_700Bold', marginBottom: 8 },
  progressTrack: { width: '100%', height: 4, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 2, marginBottom: 5, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 2 },
  scoreText: { fontSize: 12, fontFamily: 'Cairo_700Bold' },
  attemptsText: { fontSize: 9, fontFamily: 'Cairo_400Regular', color: '#888', marginTop: 2 },
});
