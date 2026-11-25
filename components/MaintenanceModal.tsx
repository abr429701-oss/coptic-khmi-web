import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Linking, TextInput, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useThemeColors';
import { LinearGradient } from 'expo-linear-gradient';
import { useAdmin } from '@/contexts/AdminContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifyAdminPin } from '@/lib/adminAuth';

interface MaintenanceModalProps {
  visible: boolean;
  waLink?: string;
}

export const MaintenanceModal: React.FC<MaintenanceModalProps> = ({ visible, waLink }) => {
  const colors = useThemeColors();
  const { toggleAdminMode, isAdminMode } = useAdmin();
  const [tapCount, setTapCount] = useState(0);
  const [showPinInput, setShowPinInput] = useState(false);
  const [pin, setPin] = useState("");
  const [checkingPin, setCheckingPin] = useState(false);
  const [forceHide, setForceHide] = useState(false);

  const handleSecretTap = () => {
    const newCount = tapCount + 1;
    if (newCount >= 6) {
      setShowPinInput(true);
      setTapCount(0);
    } else {
      setTapCount(newCount);
      setTimeout(() => setTapCount(0), 2000);
    }
  };

  const checkPin = async () => {
    if (checkingPin || !pin) return;
    setCheckingPin(true);
    try {
      const result = await verifyAdminPin(pin);
      if (result.success) {
        setForceHide(true);
        toggleAdminMode();
        await AsyncStorage.setItem("@coptic/maintenance_bypass", "true");
        setShowPinInput(false);
        setPin("");
        Alert.alert("تم التفعيل", "تم فتح التطبيق لك بشكل دائم على هذا الجهاز.");
      } else {
        Alert.alert("تعذر الدخول", result.error === "network_error" ? "تحقق من اتصال الإنترنت ثم حاول مجددًا." : result.error === "rate_limited" ? "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة." : "الكود السري غير صحيح.");
        setPin("");
      }
    } finally {
      setCheckingPin(false);
    }
  };

  // لو الأدمن وضع مفعّل بالفعل، نخفي الشاشة
  const isCurrentlyVisible = visible && !forceHide && !isAdminMode;

  return (
    <Modal visible={isCurrentlyVisible} transparent animationType="fade">
      <View style={styles.overlay}>
        {!showPinInput ? (
          <LinearGradient
            colors={['#1E293B', '#0F172A']}
            style={styles.content}
          >
            <TouchableOpacity activeOpacity={1} onPress={handleSecretTap} style={styles.iconContainer}>
              <Feather name="tool" size={60} color="#C8A951" />
            </TouchableOpacity>
            
            <Text style={styles.title}>عذراً.. نحن في صيانة</Text>
            <Text style={styles.subtitle}>Maintenance Mode</Text>
            
            <Text style={styles.description}>
              نقوم حالياً ببعض التحديثات والتحسينات لنقدم لكم تجربة أفضل. سيعود التطبيق للعمل خلال وقت قصير جداً.
            </Text>

            <View style={styles.divider} />

            <Text style={styles.infoText}>شكراً لصبركم وتفهمكم</Text>

            {waLink && (
              <TouchableOpacity 
                style={styles.contactBtn}
                onPress={() => Linking.openURL(waLink)}
              >
                <Feather name="message-circle" size={20} color="#1E293B" />
                <Text style={styles.contactBtnText}>تواصل مع الدعم الفني</Text>
              </TouchableOpacity>
            )}
          </LinearGradient>
        ) : (
          <View style={styles.pinContainer}>
            <Text style={styles.pinTitle}>الوضع السري</Text>
            <TextInput
              style={styles.pinInput}
              placeholder="أدخل الكود"
              placeholderTextColor="#666"
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              value={pin}
              onChangeText={setPin}
              autoFocus
            />
            <TouchableOpacity style={[styles.pinBtn, checkingPin && { opacity: 0.6 }]} onPress={checkPin} disabled={checkingPin}>
              {checkingPin ? <ActivityIndicator color="#1E293B" /> : <Text style={styles.pinBtnText}>تأكيد</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowPinInput(false)}>
              <Text style={{ color: "#999", marginTop: 15 }}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  content: {
    width: '100%',
    borderRadius: 32,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(200,169,81,0.3)',
  },
  pinContainer: {
    backgroundColor: '#1E293B',
    padding: 30,
    borderRadius: 20,
    width: '80%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C8A951'
  },
  pinTitle: { color: '#FFF', fontSize: 20, marginBottom: 20, fontFamily: 'Cairo_700Bold' },
  pinInput: {
    backgroundColor: '#0F172A',
    width: '100%',
    height: 50,
    borderRadius: 10,
    color: '#FFF',
    textAlign: 'center',
    fontSize: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155'
  },
  pinBtn: { backgroundColor: '#C8A951', paddingHorizontal: 40, paddingVertical: 12, borderRadius: 10 },
  pinBtnText: { color: '#1E293B', fontFamily: 'Cairo_700Bold' },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(200,169,81,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  title: {
    fontSize: 24,
    fontFamily: 'Cairo_700Bold',
    color: '#FFF',
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#C8A951',
    marginTop: -5,
    marginBottom: 20,
    letterSpacing: 2
  },
  description: {
    fontSize: 16,
    fontFamily: 'Cairo_400Regular',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 25
  },
  divider: {
    width: 60,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginBottom: 20
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Cairo_600SemiBold',
    color: '#64748B',
    marginBottom: 30
  },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#C8A951',
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 16
  },
  contactBtnText: {
    color: '#1E293B',
    fontSize: 16,
    fontFamily: 'Cairo_700Bold'
  }
});
