import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { DictionaryEntry } from '@/hooks/useDictionary';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLang } from '@/contexts/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';

interface Props {
  entries: DictionaryEntry[];
  onBack?: () => void;
}

export function MatchingGameScreen({ entries, onBack }: Props) {
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { lang, t, isRTL } = useLang();

  const [copticWords, setCopticWords] = useState<{ id: string, text: string }[]>([]);
  const [arabicWords, setArabicWords] = useState<{ id: string, text: string }[]>([]);
  const [selectedCoptic, setSelectedCoptic] = useState<string | null>(null);
  const [selectedArabic, setSelectedArabic] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<Set<string>>(new Set());
  const [score, setScore] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem('@matching_score').then(s => {
      if (s) setScore(parseInt(s));
    });
  }, []);

  const updateScore = (pts: number) => {
    setScore(s => {
      const newScore = s + pts;
      AsyncStorage.setItem('@matching_score', newScore.toString());
      return newScore;
    });
  };

  const getMeaning = (entry: DictionaryEntry) => {
    let text = entry.arabic || "";
    if (lang === 'en') text = entry.english || entry.arabic || "";
    if (lang === 'fr') text = entry.french || entry.arabic || "";
    if (lang === 'de') text = entry.german || entry.arabic || "";
    return text.split(/[،,;\/\n]/)[0].trim();
  };

  const startLevel = () => {
    const validEntries = entries.filter(e => {
      if (lang === 'en') return !!e.english;
      if (lang === 'fr') return !!e.french;
      if (lang === 'de') return !!e.german;
      return !!e.arabic;
    });

    if (validEntries.length < 5) return;
    
    const shuffled = [...validEntries].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);
    
    const cWords = selected.map(e => ({ id: e.id, text: e.coptic }));
    const aWords = selected.map(e => ({ id: e.id, text: getMeaning(e) }));
    
    setCopticWords(cWords.sort(() => 0.5 - Math.random()));
    setArabicWords(aWords.sort(() => 0.5 - Math.random()));
    setMatchedPairs(new Set());
    setSelectedCoptic(null);
    setSelectedArabic(null);
  };

  useEffect(() => {
    startLevel();
  }, [entries, lang]);

  useEffect(() => {
    if (selectedCoptic && selectedArabic) {
      if (selectedCoptic === selectedArabic) {
        setMatchedPairs(prev => {
          const newSet = new Set(prev);
          newSet.add(selectedCoptic);
          return newSet;
        });
        updateScore(10);
        setSelectedCoptic(null);
        setSelectedArabic(null);
      } else {
        setTimeout(() => {
          setSelectedCoptic(null);
          setSelectedArabic(null);
        }, 500);
      }
    }
  }, [selectedCoptic, selectedArabic]);

  useEffect(() => {
    if (matchedPairs.size === 5 && copticWords.length === 5) {
      setTimeout(startLevel, 1000);
    }
  }, [matchedPairs, copticWords]);

  const titleText = lang === 'ar' ? 'توصيل الكلمات' : 'Matching Game';
  const hintText = lang === 'ar' ? 'اضغط على الكلمة القبطية ثم معناها الصحيح للربط بينهما' : 'Tap a Coptic word and its meaning to match them';

  return (
    <ScrollView 
      contentContainerStyle={[styles.root, { paddingBottom: insets.bottom + 20 }]}
      style={{ backgroundColor: colors.background }}
    >
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, paddingRight: 10 }}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={{ marginRight: 15, justifyContent: 'center' }}>
              <Feather name={isRTL ? "arrow-right" : "arrow-left"} size={24} color={colors.text} />
            </TouchableOpacity>
          )}
          <Text style={[styles.title, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>{titleText}</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Feather name="star" size={16} color={colors.gold} style={{ marginRight: 6 }} />
          <Text style={[styles.scoreTextLabel, { color: colors.gold }]}>{t.training?.score || (lang === 'ar' ? 'النقاط' : 'Score')}: </Text>
          <Text style={[styles.scoreValue, { color: colors.gold }]}>{score}</Text>
        </View>
      </View>

      <Text style={styles.hintText}>{hintText}</Text>
      
      <View style={styles.board}>
        <View style={styles.column}>
          {copticWords.map(word => {
            const isMatched = matchedPairs.has(word.id);
            const isSelected = selectedCoptic === word.id;
            return (
              <TouchableOpacity
                key={`c-${word.id}`}
                disabled={isMatched}
                onPress={() => setSelectedCoptic(word.id)}
                style={[
                  styles.card,
                  isMatched && { opacity: 0 },
                  isSelected && { borderColor: colors.gold, backgroundColor: 'rgba(200,169,81,0.2)' },
                  !isSelected && !isMatched && { borderColor: isDark ? '#333' : '#ddd', backgroundColor: isDark ? '#222' : '#fff' }
                ]}
              >
                <Text style={[styles.copticText, { color: colors.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{word.text}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.column}>
          {arabicWords.map(word => {
            const isMatched = matchedPairs.has(word.id);
            const isSelected = selectedArabic === word.id;
            return (
              <TouchableOpacity
                key={`a-${word.id}`}
                disabled={isMatched}
                onPress={() => setSelectedArabic(word.id)}
                style={[
                  styles.card,
                  isMatched && { opacity: 0 },
                  isSelected && { borderColor: colors.gold, backgroundColor: 'rgba(200,169,81,0.2)' },
                  !isSelected && !isMatched && { borderColor: isDark ? '#333' : '#ddd', backgroundColor: isDark ? '#222' : '#fff' }
                ]}
              >
                <Text style={[styles.arabicText, { color: colors.text }]} numberOfLines={3} ellipsizeMode="tail">
                  {entries.find(e => e.id === word.id) ? getMeaning(entries.find(e => e.id === word.id)!) : word.text}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontFamily: 'Cairo_700Bold' },
  scoreBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(200,169,81,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(200,169,81,0.3)' },
  scoreTextLabel: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', marginRight: 4 },
  scoreValue: { fontSize: 16, fontFamily: 'Cairo_700Bold' },
  board: { flexDirection: 'row', justifyContent: 'space-between', flex: 1, gap: 12 },
  column: { flex: 1, minWidth: 0, gap: 15 },
  card: { 
    minHeight: 70, 
    borderRadius: 12, 
    borderWidth: 2,
    justifyContent: 'center', 
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  hintText: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: '#888', textAlign: 'center', marginBottom: 20 },
  copticText: { width: '100%', flexShrink: 1, fontSize: 20, fontFamily: 'CSAvaVeni-Regular', textAlign: 'center' },
  arabicText: { width: '100%', flexShrink: 1, fontSize: 16, fontFamily: 'Cairo_600SemiBold', textAlign: 'center' }
});
