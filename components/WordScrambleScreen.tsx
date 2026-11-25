import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, I18nManager } from 'react-native';
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

export function WordScrambleScreen({ entries, onBack }: Props) {
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { lang, t, isRTL } = useLang();

  const [currentEntry, setCurrentEntry] = useState<DictionaryEntry | null>(null);
  const [scrambled, setScrambled] = useState<string[]>([]);
  const [userAttempt, setUserAttempt] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'success'|'error'|null>(null);

  useEffect(() => {
    AsyncStorage.getItem('@scramble_score').then(s => {
      if (s) setScore(parseInt(s));
    });
  }, []);

  const updateScore = (pts: number) => {
    setScore(s => {
      const newScore = s + pts;
      AsyncStorage.setItem('@scramble_score', newScore.toString());
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

  const cleanCoptic = (text: string) => {
    return text.replace(/[\s\.,;:!?\-\u200B]/g, "");
  };

  const getGraphemes = (word: string) => {
    const letters: string[] = [];
    for (const char of word) {
      if (/[\u0300-\u036F]/.test(char)) {
        if (letters.length > 0) {
          letters[letters.length - 1] += char;
        }
      } else {
        letters.push(char);
      }
    }
    return letters;
  };

  const generateWord = () => {
    const validEntries = entries.filter(e => {
      if (lang === 'en' && !e.english) return false;
      if (lang === 'fr' && !e.french) return false;
      if (lang === 'de' && !e.german) return false;
      if (lang === 'ar' && !e.arabic) return false;
      const cleanWord = cleanCoptic(e.coptic);
      const graphemes = getGraphemes(cleanWord);
      return graphemes.length >= 3 && graphemes.length <= 8;
    });

    if (validEntries.length === 0) return;
    setFeedback(null);
    setUserAttempt([]);
    
    const entry = validEntries[Math.floor(Math.random() * validEntries.length)];
    const cleanWord = cleanCoptic(entry.coptic);
    const graphemes = getGraphemes(cleanWord);

    setCurrentEntry(entry);
    
    let shuffled = [...graphemes];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setScrambled(shuffled);
  };

  useEffect(() => {
    generateWord();
  }, [entries, lang]);

  const handleLetterPress = (letter: string, index: number) => {
    setUserAttempt(prev => [...prev, letter]);
    setScrambled(prev => {
      const newScrambled = [...prev];
      newScrambled.splice(index, 1);
      return newScrambled;
    });
  };

  const handleRemoveLetter = (letter: string, index: number) => {
    setScrambled(prev => [...prev, letter]);
    setUserAttempt(prev => {
      const newAttempt = [...prev];
      newAttempt.splice(index, 1);
      return newAttempt;
    });
  };

  useEffect(() => {
    if (currentEntry && scrambled.length === 0 && userAttempt.length > 0) {
      const targetGraphemes = getGraphemes(cleanCoptic(currentEntry.coptic));
      const target = targetGraphemes.join('');
      const attempt = userAttempt.join('');
      if (attempt === target) {
        updateScore(10);
        setFeedback('success');
        setTimeout(generateWord, 1500);
      } else {
        setFeedback('error');
        setTimeout(() => {
          setScrambled(userAttempt);
          setUserAttempt([]);
          setFeedback(null);
        }, 1000);
      }
    }
  }, [userAttempt, scrambled, currentEntry]);

  if (!currentEntry) return null;

  const titleText = lang === 'ar' ? 'ترتيب الحروف' : 'Word Scramble';
  const hintText = lang === 'ar' ? 'اضغط على الحروف بالترتيب لتكوين الكلمة بالقبطية' : 'Tap the letters in order to form the Coptic word';
  const successText = t.training?.correct || (lang === 'ar' ? 'ممتاز!' : 'Excellent!');
  const errorText = t.training?.incorrect || (lang === 'ar' ? 'حاول مرة أخرى' : 'Try again');

  // React Native's I18nManager.isRTL makes `flexDirection: 'row'` layout from right-to-left.
  // Coptic is always LTR. So we MUST use 'row-reverse' if I18nManager is RTL.
  const ltrRow = I18nManager.isRTL ? 'row-reverse' : 'row';

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
      
      <View style={styles.card}>
        <Text style={styles.arabicText} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.85}>{getMeaning(currentEntry)}</Text>
        <Text style={styles.hintText}>{hintText}</Text>
      </View>

      {/* Wrapping the attempt area in a horizontal scroll view so it stays on one line */}
      <View style={styles.attemptWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={[styles.attemptArea, { flexDirection: ltrRow }]}
        >
          {userAttempt.map((letter, idx) => (
            <TouchableOpacity key={`att-${idx}`} onPress={() => handleRemoveLetter(letter, idx)} style={[styles.letterBox, { backgroundColor: colors.gold }]}>
              <Text style={styles.letterText}>{letter}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={[styles.scrambledArea, { flexDirection: ltrRow }]}>
        {scrambled.map((letter, idx) => (
          <TouchableOpacity key={`scr-${idx}`} onPress={() => handleLetterPress(letter, idx)} style={[styles.letterBox, { backgroundColor: 'rgba(200,169,81,0.2)', borderColor: colors.gold, borderWidth: 1 }]}>
            <Text style={[styles.letterText, { color: colors.text }]}>{letter}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {feedback && (
        <View style={[styles.feedback, { backgroundColor: feedback === 'success' ? '#4CAF50' : '#F44336' }]}>
          <Text style={styles.feedbackText}>{feedback === 'success' ? successText : errorText}</Text>
        </View>
      )}
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
  card: { backgroundColor: 'rgba(200,169,81,0.1)', padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 30 },
  arabicText: { width: '100%', flexShrink: 1, fontSize: 28, fontFamily: 'Cairo_700Bold', color: '#C8A951', marginBottom: 10, textAlign: 'center' },
  hintText: { width: '100%', flexShrink: 1, fontSize: 14, fontFamily: 'Cairo_600SemiBold', color: '#888', textAlign: 'center' },
  attemptWrapper: { height: 70, marginBottom: 30, alignItems: 'center', justifyContent: 'center' },
  attemptArea: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 10 },
  scrambledArea: { flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  letterBox: { width: 50, height: 50, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  letterText: { fontSize: 28, fontFamily: 'CSAvaVeni-Regular', color: '#fff', textAlign: 'center' },
  feedback: { marginTop: 30, padding: 15, borderRadius: 10, alignItems: 'center' },
  feedbackText: { color: 'white', fontSize: 16, fontFamily: 'Cairo_700Bold' }
});
