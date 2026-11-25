import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, TextInput, Alert, Dimensions, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAdmin } from '@/contexts/AdminContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifyAdminPin } from '@/lib/adminAuth';

const { width } = Dimensions.get('window');

interface GlobalMaintenanceScreenProps {
  waLink?: string;
}

export const GlobalMaintenanceScreen: React.FC<GlobalMaintenanceScreenProps> = ({ waLink }) => {
  const { toggleAdminMode } = useAdmin();
  const [pin, setPin] = useState("");
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [checkingPin, setCheckingPin] = useState(false);

  const checkPin = async () => {
    if (checkingPin || !pin) return;
    setCheckingPin(true);
    try {
      const result = await verifyAdminPin(pin);
      if (result.success) {
        await AsyncStorage.setItem("@coptic/maintenance_bypass", "true");
        toggleAdminMode();
        setShowAdminLogin(false);
        setPin("");
        Alert.alert("تم التفعيل", "أهلاً بك يا أدمن، تم فتح التطبيق لك بنجاح.");
      } else {
        Alert.alert("تعذر الدخول", result.error === "network_error" ? "تحقق من اتصال الإنترنت ثم حاول مجددًا." : result.error === "rate_limited" ? "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة." : "الكود السري غير صحيح.");
        setPin("");
      }
    } finally {
      setCheckingPin(false);
    }
  };

  return (
    <LinearGradient colors={['#0F172A', '#1E293B', '#0F172A']} style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Feather name="shield" size={80} color="#C8A951" />
        </View>

        <Text style={styles.title}>تحديثات هامة جارية</Text>
        <Text style={styles.subtitle}>System Maintenance Underway</Text>
        
        <View style={styles.card}>
          <Text style={styles.description}>
            نحن نقوم الآن ببعض الأعمال الفنية لتحسين مستوى الخدمة. 
            يرجى العودة قريباً، شكراً لانتظاركم.
          </Text>
        </View>

        {waLink && (
          <TouchableOpacity 
            style={styles.supportBtn}
            onPress={() => Linking.openURL(waLink)}
          >
            <Feather name="headphones" size={20} color="#0F172A" />
            <Text style={styles.supportText}>الدعم الفني</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* منطقة الأدمن المخفية ولكن يمكن الوصول لها */}
      <View style={styles.adminArea}>
        {!showAdminLogin ? (
          <TouchableOpacity onPress={() => setShowAdminLogin(true)} style={styles.adminTrigger}>
            <Feather name="lock" size={14} color="rgba(255,255,255,0.2)" />
            <Text style={styles.adminTriggerText}>الإدارة</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.loginBox}>
            <TextInput
              style={styles.input}
              placeholder="كود الدخول"
              placeholderTextColor="#666"
              keyboardType="numeric"
              secureTextEntry
              maxLength={4}
              value={pin}
              onChangeText={setPin}
              autoFocus
            />
            <View style={styles.btnRow}>
               <TouchableOpacity style={[styles.loginBtn, checkingPin && { opacity: 0.6 }]} onPress={checkPin} disabled={checkingPin}>
                 {checkingPin ? <ActivityIndicator color="#0F172A" /> : <Text style={styles.loginBtnText}>دخول</Text>}
               </TouchableOpacity>
               <TouchableOpacity onPress={() => setShowAdminLogin(false)}>
                 <Text style={{ color: '#999', marginLeft: 15 }}>إلغاء</Text>
               </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '85%',
    alignItems: 'center',
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(200,169,81,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(200,169,81,0.2)',
  },
  title: {
    fontSize: 28,
    fontFamily: 'Cairo_700Bold',
    color: '#FFF',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#C8A951',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 30,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 24,
    padding: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 30,
  },
  description: {
    fontSize: 17,
    fontFamily: 'Cairo_400Regular',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 28,
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#C8A951',
    paddingHorizontal: 25,
    paddingVertical: 15,
    borderRadius: 16,
    gap: 10,
  },
  supportText: {
    color: '#0F172A',
    fontFamily: 'Cairo_700Bold',
    fontSize: 16,
  },
  adminArea: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    alignItems: 'center',
  },
  adminTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    opacity: 0.5,
  },
  adminTriggerText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
  },
  loginBox: {
    width: '70%',
    backgroundColor: '#1E293B',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#C8A951',
  },
  input: {
    backgroundColor: '#0F172A',
    height: 50,
    borderRadius: 12,
    color: '#FFF',
    textAlign: 'center',
    fontSize: 18,
    marginBottom: 15,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtn: {
    backgroundColor: '#C8A951',
    paddingHorizontal: 25,
    paddingVertical: 10,
    borderRadius: 10,
  },
  loginBtnText: {
    color: '#0F172A',
    fontFamily: 'Cairo_700Bold',
  }
});
