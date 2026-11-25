import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LanguageContext';

interface Props {
  /** نص الرسالة */
  message: string;
  /** مدة الظهور بالملي ثانية (default 3000) */
  duration?: number;
  /** دالة إغلاق يدوية */
  onClose?: () => void;
}

/**
 * Toast‑style notification that slides down from the top.
 * Appears for `duration` ms then hides automatically.
 */
export const ScreenNotification: React.FC<Props> = ({ message, duration = 3000, onClose }) => {
  const { isDark } = useTheme();
  const { isRTL } = useLang();
  const translateY = useRef(new Animated.Value(-100)).current; // start above screen
  const opacity = useRef(new Animated.Value(0)).current;

  const isMessageArabic = /[\u0600-\u06FF]/.test(message || '');
  const displayDir = isMessageArabic ? 'rtl' : 'ltr';
  const textAlign = isMessageArabic ? 'right' : 'left';

  useEffect(() => {
    // show animation
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    const hideTimer = setTimeout(() => hide(), duration);
    return () => clearTimeout(hideTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hide = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -100, duration: 300, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      onClose?.();
    });
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
          transform: [{ translateY }],
          opacity,
          flexDirection: isRTL ? 'row-reverse' : 'row'
        }
      ]}>
      <View style={[styles.content, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <MaterialIcons
          name="info"
          size={20}
          color={isDark ? '#9CA3AF' : '#555'}
          style={isRTL ? { marginLeft: 8 } : { marginRight: 8 }}
        />
        <Text style={[
          styles.message,
          {
            color: isDark ? '#F3F4F6' : '#111827',
            writingDirection: displayDir,
            textAlign: textAlign
          }
        ]}>
          {message}
        </Text>
      </View>
      <TouchableOpacity onPress={hide} style={styles.closeBtn}>
        <MaterialIcons name="close" size={20} color={isDark ? '#9CA3AF' : '#555'} />
      </TouchableOpacity>
    </Animated.View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    zIndex: 999,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  message: {
    fontFamily: 'Cairo_500Medium',
    fontSize: 15,
    flexShrink: 1,
  },
  closeBtn: {
    padding: 4,
  },
});
