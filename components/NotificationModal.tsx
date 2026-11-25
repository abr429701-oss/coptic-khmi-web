import React from 'react';
import { StyleSheet, Text, View, Modal, TouchableOpacity, Dimensions, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLang } from '@/contexts/LanguageContext';

interface NotificationModalProps {
  notification: { body: string; title?: string; imageUrl?: string; notificationId?: string } | null;
  onClose: () => void;
  onOpenImage?: (notification: { body: string; title?: string; imageUrl?: string; notificationId?: string }) => void;
}

const { width } = Dimensions.get('window');

export function NotificationModal({ notification, onClose, onOpenImage }: NotificationModalProps) {
  const { isDark } = useTheme();
  const { t, isRTL, lang } = useLang();

  if (!notification) return null;

  return (
    <Modal key={lang} transparent visible={!!notification} animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
              <MaterialIcons name="close" size={24} color={isDark ? '#9CA3AF' : '#BBB'} />
            </TouchableOpacity>
            <View style={styles.headerContent}>
              <Text style={[styles.title, { color: isDark ? '#F3F4F6' : '#333' }]}>{notification.title || t.notification.new}</Text>
              <View style={styles.bellCircle}>
                <MaterialIcons name="notifications-none" size={30} color="#FFF" />
              </View>
            </View>
          </View>

          {/* Body */}
          <View style={styles.body}>
            {notification.imageUrl ? <Image source={{ uri: notification.imageUrl }} style={styles.image} resizeMode="cover" /> : null}
            <Text style={[styles.message, { 
              color: isDark ? '#D1D5DB' : '#444', 
              textAlign: isRTL ? 'right' : 'left' 
            }]}>
              {notification.body}
            </Text>
          </View>

          {/* Action button */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              if (notification.imageUrl && onOpenImage) onOpenImage(notification);
              onClose();
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.actionText}>{notification.imageUrl ? (lang === 'ar' ? 'عرض الصورة والتفاصيل' : 'View image and details') : t.notification.ok}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: width * 0.9,
    borderRadius: 25,
    padding: 20,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bellCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#8B0000',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 15,
  },
  title: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 22,
  },
  closeIcon: {
    padding: 5,
  },
  body: {
    width: '100%',
    paddingVertical: 20,
  },
  message: {
    fontFamily: 'Cairo_500Medium',
    fontSize: 18,
    lineHeight: 28,
    width: '100%',
  },
  image: {
    width: '100%',
    height: 190,
    borderRadius: 14,
    marginBottom: 16,
    backgroundColor: '#0F172A',
  },
  actionButton: {
    width: '100%',
    backgroundColor: '#8B0000',
    paddingVertical: 15,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 10,
    alignSelf: 'stretch',
  },
  actionText: {
    fontFamily: 'Cairo_700Bold',
    color: '#FFF',
    fontSize: 18,
  },
});
