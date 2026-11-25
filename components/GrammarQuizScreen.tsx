import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useThemeColors } from '@/hooks/useThemeColors';
import { DictionaryEntry } from '@/hooks/useDictionary';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLang, translateTerm } from '@/contexts/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Props {
  entries: DictionaryEntry[];
  onBack?: () => void;
}

export function GrammarQuizScreen({ entries, onBack }: Props) {
  const { isDark } = useTheme();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { lang, t, isRTL } = useLang();
  
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<'success'|'error'|null>(null);

  useEffect(() => {
    AsyncStorage.getItem('@grammar_score').then(s => {
      if (s) setScore(parseInt(s));
    });
  }, []);

  const updateScore = (pts: number) => {
    setScore(s => {
      const newScore = s + pts;
      AsyncStorage.setItem('@grammar_score', newScore.toString());
      return newScore;
    });
  };

  const validEntries = useMemo(() => {
    return entries.filter(e => {
      const hasMetadata = e.origin || e.wordType || e.gender;
      if (!hasMetadata) return false;
      if (lang === 'en') return !!e.english;
      if (lang === 'fr') return !!e.french;
      if (lang === 'de') return !!e.german;
      return !!e.arabic;
    });
  }, [entries, lang]);

  const getMeaning = (entry: DictionaryEntry) => {
    let text = entry.arabic || "";
    if (lang === 'en') text = entry.english || entry.arabic || "";
    if (lang === 'fr') text = entry.french || entry.arabic || "";
    if (lang === 'de') text = entry.german || entry.arabic || "";
    return text.split(/[،,;\/\n]/)[0].trim();
  };

  const generateQuestion = () => {
    if (validEntries.length === 0) return;
    setFeedback(null);
    const entry = validEntries[Math.floor(Math.random() * validEntries.length)];
    
    const types = [];
    if (entry.origin) types.push('origin');
    if (entry.wordType) types.push('wordType');
    if (entry.gender) types.push('gender');
    
    const type = types[Math.floor(Math.random() * types.length)];
    let questionText = '';
    let correctAnswer = '';
    let allPossible: string[] = [];

    const normalizeTerm = (val: string, category: string) => {
      if (!val) return "";
      const t = val.trim();
      if (category === 'origin') {
        if (t.includes('قبط') || t.includes('مصر')) return 'قبطي';
        if (t.includes('يونان')) return 'يوناني';
        if (t.includes('عبر')) return 'عبري';
        if (t.includes('آرام')) return 'آرامي';
      } else if (category === 'gender') {
        if (t.includes('مذكر')) return 'مذكر';
        if (t.includes('مؤنث')) return 'مؤنث';
        if (t.includes('جمع')) return 'جمع';
      } else if (category === 'wordType') {
        if (t.includes('اسم') || t.includes('أسم')) return 'اسم';
        if (t.includes('فعل')) return 'فعل';
        if (t.includes('صفة')) return 'صفة';
        if (t.includes('حرف')) return 'حرف';
        if (t.includes('ضمير')) return 'ضمير';
        if (t.includes('أداة') || t.includes('اداة')) return 'أداة';
      }
      return t;
    };

    const normalizedValue = normalizeTerm(entry[type as keyof DictionaryEntry] as string, type);

    if (type === 'origin') {
      correctAnswer = normalizedValue;
      allPossible = ["قبطي", "يوناني", "عبري", "آرامي"];
    } else if (type === 'wordType') {
      correctAnswer = normalizedValue;
      allPossible = ["اسم", "فعل", "صفة", "حرف", "ضمير", "أداة"];
    } else if (type === 'gender') {
      correctAnswer = normalizedValue;
      allPossible = ["مذكر", "مؤنث", "جمع"];
    }

    let opts = new Set([correctAnswer]);
    while(opts.size < Math.min(4, allPossible.length + 1)) {
      opts.add(allPossible[Math.floor(Math.random() * allPossible.length)]);
    }
    
    setOptions(Array.from(opts).sort(() => Math.random() - 0.5));
    setCurrentQuestion({ entry, type, correctAnswer });
  };

  useEffect(() => {
    generateQuestion();
  }, [validEntries, lang]);

  const handleAnswer = (ans: string) => {
    if (ans === currentQuestion.correctAnswer) {
      updateScore(10);
      setFeedback('success');
      setTimeout(generateQuestion, 1000);
    } else {
      setFeedback('error');
      setTimeout(() => setFeedback(null), 1000);
    }
  };

  if (!currentQuestion) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>{lang === 'ar' ? 'لا توجد بيانات كافية' : 'Not enough data'}</Text>
      </View>
    );
  }

  const titleText = lang === 'ar' ? 'تدريب القواعد' : 'Grammar Quiz';
  const successText = t.training?.correct || (lang === 'ar' ? 'إجابة صحيحة!' : 'Correct!');
  const errorText = t.training?.incorrect || (lang === 'ar' ? 'حاول مرة أخرى' : 'Try again');

  let dynamicQuestionText = "";
  if (currentQuestion.type === 'origin') dynamicQuestionText = lang === 'ar' ? 'ما هو أصل هذه الكلمة؟' : 'What is the origin of this word?';
  else if (currentQuestion.type === 'wordType') dynamicQuestionText = lang === 'ar' ? 'ما هو نوع هذه الكلمة؟' : 'What is the type of this word?';
  else if (currentQuestion.type === 'gender') dynamicQuestionText = lang === 'ar' ? 'ما هو جنس هذه الكلمة؟' : 'What is the gender of this word?';

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
        <Text style={styles.copticText}>{currentQuestion.entry.coptic}</Text>
        <Text style={styles.arabicText}>{getMeaning(currentQuestion.entry)}</Text>
      </View>

      <Text style={[styles.question, { color: colors.text }]}>{dynamicQuestionText}</Text>
      
      <View style={styles.options}>
        {options.map((opt, idx) => (
          <TouchableOpacity 
            key={idx} 
            style={[styles.optionBtn, { borderColor: colors.gold, backgroundColor: isDark ? '#222' : '#fff' }]}
            onPress={() => handleAnswer(opt)}
          >
            <Text style={[styles.optionText, { color: colors.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{translateTerm(opt, lang)}</Text>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontFamily: 'Cairo_700Bold' },
  scoreBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(200,169,81,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(200,169,81,0.3)' },
  scoreTextLabel: { fontSize: 14, fontFamily: 'Cairo_600SemiBold', marginRight: 4 },
  scoreValue: { fontSize: 16, fontFamily: 'Cairo_700Bold' },
  card: { backgroundColor: 'rgba(200,169,81,0.1)', padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 20 },
  copticText: { fontSize: 36, fontFamily: 'CSAvaVeni-Regular', color: '#C8A951', marginBottom: 5, textAlign: 'center' },
  arabicText: { fontSize: 18, fontFamily: 'Cairo_600SemiBold', color: '#888', textAlign: 'center' },
  question: { width: '100%', flexShrink: 1, fontSize: 20, fontFamily: 'Cairo_700Bold', textAlign: 'center', marginBottom: 15 },
  options: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  optionBtn: { width: '48%', minWidth: 0, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  optionText: { width: '100%', flexShrink: 1, fontSize: 16, fontFamily: 'Cairo_600SemiBold', textAlign: 'center' },
  feedback: { marginTop: 20, padding: 15, borderRadius: 10, alignItems: 'center' },
  feedbackText: { color: 'white', fontSize: 16, fontFamily: 'Cairo_700Bold' }
});
