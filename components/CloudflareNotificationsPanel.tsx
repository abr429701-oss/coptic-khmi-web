import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { CLOUDFLARE_API_BASE, type CloudflareAdminSession } from "@/lib/cloudflare";
import { LocalNotificationTestPanel } from "@/components/LocalNotificationTestPanel";

const GOLD = "#C8A951";
const MUTED = "#94A3B8";
const MAX_DEVICE_KEYS = 200;

type Language = "all" | "ar" | "en" | "fr" | "de";

interface CloudflareDevice {
  deviceKey: string;
  label: string;
  appVersion: string;
  language: string;
  platform: string;
  lastSeenAt: string;
}

interface SelectedNotificationImage {
  uri: string;
  name: string;
  size?: number;
}

interface Props {
  session: CloudflareAdminSession | null;
  onSessionChange: (session: CloudflareAdminSession | null) => void;
}

const languageOptions: { value: Language; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "ar", label: "العربية" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
];

interface DropdownOption {
  value: string;
  label: string;
}

function DropdownField({ label, value, placeholder, options, onChange }: {
  label: string;
  value: string;
  placeholder: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.dropdownField} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Feather name="chevron-down" size={17} color={GOLD} />
        <Text style={[styles.dropdownValue, !selected && styles.dropdownPlaceholder]}>{selected?.label || placeholder}</Text>
      </TouchableOpacity>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.dropdownOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.dropdownSheet}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Feather name="x" size={20} color={MUTED} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.dropdownOptions} keyboardShouldPersistTaps="handled">
              {options.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={styles.dropdownOption}
                  onPress={() => { onChange(option.value); setOpen(false); }}
                >
                  <Feather name={option.value === value ? "check-circle" : "circle"} size={16} color={option.value === value ? GOLD : MUTED} />
                  <Text style={[styles.dropdownOptionText, option.value === value && { color: GOLD }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function normalizeDevices(payload: unknown): CloudflareDevice[] {
  const root = asObject(payload);
  const nested = asObject(root.data);
  const candidates = root.devices ?? root.items ?? root.results ?? nested.devices ?? nested.items;
  if (!Array.isArray(candidates)) return [];

  return candidates.map((raw: unknown, index: number) => {
    const item = asObject(raw);
    const deviceKey = String(item.deviceKey ?? item.device_key ?? item.key ?? item.id ?? item.deviceId ?? "").trim();
    const appVersion = String(item.appVersion ?? item.app_version ?? "");
    const platform = String(item.platform ?? "");
    const language = String(item.interfaceLanguage ?? item.interface_language ?? item.language ?? "all");
    return {
      deviceKey,
      label: String((item.label ?? item.name ?? `${platform || "جهاز"} ${appVersion ? `· ${appVersion}` : ""}`.trim()) || `جهاز ${index + 1}`),
      appVersion,
      language,
      platform,
      lastSeenAt: String(item.lastSeenAt ?? item.last_seen_at ?? ""),
    };
  }).filter((device) => Boolean(device.deviceKey));
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaultScheduleParts() {
  const date = new Date(Date.now() + 15 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return { date: localDateKey(date), hour: String(date.getHours()).padStart(2, "0"), minute: String(Math.floor(date.getMinutes() / 15) * 15).padStart(2, "0") };
}

async function readResponse(response: Response): Promise<Record<string, any>> {
  try {
    return asObject(await response.json());
  } catch {
    return {};
  }
}

export function CloudflareNotificationsPanel({ session, onSessionChange }: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("https://docs.google.com/spreadsheets/d/1kZKjF2KDsGT0HslGSenN-pDTzx4FpX0QDPqX0ZOnriY/edit?gid=425952754#gid=425952754");
  const [sheetColumn, setSheetColumn] = useState("C");
  const [sheetImportBusy, setSheetImportBusy] = useState(false);
  const [sheetPreview, setSheetPreview] = useState<{ validUnique: number; invalid: number; duplicates: number } | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageMode, setImageMode] = useState<"none" | "upload" | "url">("none");
  const [imageUrl, setImageUrl] = useState("");
  const [selectedImage, setSelectedImage] = useState<SelectedNotificationImage | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const [language, setLanguage] = useState<Language>("all");
  const [appVersion, setAppVersion] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "scheduled">("now");
  const [scheduleDate, setScheduleDate] = useState(() => defaultScheduleParts().date);
  const [scheduleHour, setScheduleHour] = useState(() => defaultScheduleParts().hour);
  const [scheduleMinute, setScheduleMinute] = useState(() => defaultScheduleParts().minute);
  const [manualDeviceKeys, setManualDeviceKeys] = useState("");
  const [devices, setDevices] = useState<CloudflareDevice[]>([]);
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [visibleDeviceLimit, setVisibleDeviceLimit] = useState(40);
  const [selectedDeviceKeys, setSelectedDeviceKeys] = useState<string[]>([]);
  const [devicesBusy, setDevicesBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);

  useEffect(() => {
    if (session && session.expiresAt > 0 && Date.now() >= session.expiresAt) {
      onSessionChange(null);
    }
  }, [session, onSessionChange]);

  const filteredDevices = useMemo(() => {
    const query = deviceSearch.trim().toLowerCase();
    if (!query) return devices;
    return devices.filter((device) =>
      `${device.deviceKey} ${device.label} ${device.appVersion} ${device.platform} ${device.language}`.toLowerCase().includes(query)
    );
  }, [devices, deviceSearch]);
  const visibleDevices = filteredDevices.slice(0, visibleDeviceLimit);
  const versionOptions = useMemo(() => [
    { value: "", label: "كل الإصدارات" },
    ...Array.from(new Set(devices.map((device) => device.appVersion.trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((version) => ({ value: version, label: version })),
  ], [devices]);
  const dateOptions = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const dayLabel = index === 0 ? "اليوم" : index === 1 ? "غدًا" : date.toLocaleDateString("ar-EG", { weekday: "long" });
    return { value: localDateKey(date), label: `${dayLabel} · ${date.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}` };
  }), []);
  const scheduleModeOptions = [
    { value: "now", label: "إرسال فوري" },
    { value: "scheduled", label: "جدولة الإرسال" },
  ];
  const hourOptions = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour).padStart(2, "0"), label: `${String(hour).padStart(2, "0")}:00` }));
  const minuteOptions = ["00", "15", "30", "45"].map((minute) => ({ value: minute, label: minute }));

  const login = async () => {
    if (!passphrase.trim()) {
      Alert.alert("مطلوب", "أدخل كلمة مرور مسؤول Cloudflare.");
      return;
    }
    setAuthBusy(true);
    try {
      const response = await fetch(`${CLOUDFLARE_API_BASE}/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      const data = await readResponse(response);
      const token = String(data.token ?? data.sessionToken ?? data.session_token ?? "");
      const expiresAt = Number(data.expiresAt ?? data.expires_at ?? 0);
      if (!response.ok || data.success === false || !token) {
        throw new Error(String(data.error ?? data.message ?? "تعذر تسجيل الدخول. تحقق من كلمة المرور."));
      }
      onSessionChange({ token, expiresAt: expiresAt || Date.now() + 8 * 60 * 60 * 1000 });
      setPassphrase("");
      Alert.alert("تم تسجيل الدخول", "الجلسة مؤقتة، ورمزها محفوظ في الذاكرة فقط.");
    } catch (error) {
      Alert.alert("تعذر تسجيل الدخول", error instanceof Error ? error.message : "تحقق من الاتصال وكلمة المرور.");
    } finally {
      setAuthBusy(false);
    }
  };

  const authenticatedFetch = async (path: string, init: RequestInit = {}) => {
    if (!session || Date.now() >= session.expiresAt) {
      onSessionChange(null);
      throw new Error("انتهت جلسة المسؤول. سجّل الدخول مرة أخرى.");
    }
    const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${session.token}`,
      },
    });
    if (response.status === 401 || response.status === 403) {
      onSessionChange(null);
      throw new Error("انتهت صلاحية الجلسة أو لم تعد صالحة. سجّل الدخول مرة أخرى.");
    }
    return response;
  };

  const previewSheetImport = async () => {
    setSheetImportBusy(true);
    setSheetPreview(null);
    try {
      const response = await authenticatedFetch("/admin/import-google-sheet-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: sheetUrl.trim(), column: sheetColumn.trim(), preview: true }),
      });
      const data = await readResponse(response);
      if (!response.ok || data.success !== true) {
        const error = String(data.error || "");
        const messages: Record<string, string> = {
          google_sheet_not_public_or_unavailable: "تعذر قراءة الشيت. اجعله متاحًا للقراءة عبر الرابط ثم أعد المحاولة.",
          google_sheet_not_public_or_invalid_csv: "لم يرجع Google بيانات CSV صالحة. تحقق من رابط الشيت والورقة.",
          invalid_google_sheet_url: "رابط Google Sheets غير صالح.",
          invalid_google_sheet_url_or_column: "تحقق من الرابط ورمز الورقة (gid) وحرف العمود.",
        };
        throw new Error(messages[error] || error || "تعذرت معاينة الشيت.");
      }
      setSheetPreview({ validUnique: Number(data.validUnique || 0), invalid: Number(data.invalid || 0), duplicates: Number(data.duplicates || 0) });
    } catch (error) {
      Alert.alert("معاينة الاستيراد", error instanceof Error ? error.message : "تعذر الاتصال بـCloudflare.");
    } finally {
      setSheetImportBusy(false);
    }
  };

  const commitSheetImport = async () => {
    if (!sheetPreview || sheetPreview.validUnique < 1) return;
    Alert.alert("تأكيد استيراد التوكنات", `سيتم إضافة ${sheetPreview.validUnique} توكن صالح وفريد من العمود ${sheetColumn.toUpperCase()}. لن يتم تعطيل أو حذف أي سجل موجود.`, [
      { text: "إلغاء", style: "cancel" },
      { text: "استيراد", onPress: () => { void (async () => {
        setSheetImportBusy(true);
        try {
          const response = await authenticatedFetch("/admin/import-google-sheet-tokens", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sheetUrl: sheetUrl.trim(), column: sheetColumn.trim(), confirmImport: true, expectedValidUnique: sheetPreview.validUnique }),
          });
          const data = await readResponse(response);
          if (!response.ok || data.success !== true) throw new Error(data.error === "sheet_changed_after_preview" ? `تغيّر الشيت بعد المعاينة. أصبح عدد التوكنات الصالحة ${data.validUnique || 0}. أعد المعاينة قبل التأكيد.` : String(data.error || "فشل استيراد التوكنات."));
          Alert.alert("اكتمل الاستيراد", `أُضيف/أُعيد تفعيل ${data.addedOrReactivated || 0} · موجود مسبقًا ${data.alreadyPresent || 0} · مكرر ${data.duplicates || 0} · غير صالح/فارغ ${data.invalid || 0}`);
          setSheetPreview(null);
          void loadDevices();
        } catch (error) {
          Alert.alert("تعذر استيراد التوكنات", error instanceof Error ? error.message : "تحقق من الاتصال.");
        } finally {
          setSheetImportBusy(false);
        }
      })(); } },
    ]);
  };

  const loadDevices = async () => {
    setDevicesBusy(true);
    try {
      const collected: CloudflareDevice[] = [];
      let page = 1;
      let total: number | null = null;
      while (page <= 1000) {
        const response = await authenticatedFetch(`/admin/devices?page=${page}&limit=1000`);
        const data = await readResponse(response);
        if (!response.ok || data.success === false) {
          throw new Error(String(data.error ?? "تعذر تحميل قائمة الأجهزة."));
        }
        const pageDevices = normalizeDevices(data);
        collected.push(...pageDevices);
        const root = asObject(data);
        const nested = asObject(root.data);
        const reportedTotal = Number(root.total ?? root.totalDevices ?? nested.total);
        if (Number.isFinite(reportedTotal)) total = reportedTotal;
        if (!pageDevices.length || pageDevices.length < 1000 || (total !== null && collected.length >= total)) break;
        page++;
      }
      const uniqueDevices = Array.from(new Map(collected.map((device) => [device.deviceKey, device])).values());
      setDevices(uniqueDevices);
      setDeviceCount(total ?? uniqueDevices.length);
      setVisibleDeviceLimit(40);
      if (uniqueDevices.length === 0) {
        Alert.alert("قائمة الأجهزة", "لم تصل قائمة الأجهزة بصيغة متوقعة. يمكنك إدخال مفاتيح الأجهزة يدويًا.");
      } else if (total !== null && uniqueDevices.length < total) {
        Alert.alert("قائمة الأجهزة", `تم تحميل ${uniqueDevices.length} من ${total} جهازًا. أعد المحاولة لتحميل الباقي.`);
      }
    } catch (error) {
      Alert.alert("تعذر تحميل الأجهزة", error instanceof Error ? error.message : "تحقق من الاتصال.");
    } finally {
      setDevicesBusy(false);
    }
  };

  const toggleDevice = (deviceKey: string) => {
    setSelectedDeviceKeys((current) => {
      if (current.includes(deviceKey)) return current.filter((key) => key !== deviceKey);
      if (current.length >= MAX_DEVICE_KEYS) {
        Alert.alert("حد الأجهزة", `يمكن تحديد ${MAX_DEVICE_KEYS} جهازًا كحد أقصى في الإرسال الواحد.`);
        return current;
      }
      return [...current, deviceKey];
    });
  };

  const pickImage = async () => {
    setPickingImage(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      const asset = picked.assets[0];
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
      );
      setSelectedImage({ uri: compressed.uri, name: `notification-${Date.now()}.jpg` });
      setImageUrl("");
      setImageMode("upload");
    } catch (error) {
      Alert.alert("تعذر اختيار الصورة", error instanceof Error ? error.message : "اختر صورة بصيغة مدعومة ثم حاول مجددًا.");
    } finally {
      setPickingImage(false);
    }
  };

  const uploadSelectedImage = async (image: SelectedNotificationImage) => {
    const form = new FormData();
    form.append("file", { uri: image.uri, name: image.name, type: "image/jpeg" } as any);
    const response = await authenticatedFetch("/admin/media", { method: "POST", body: form });
    const data = await readResponse(response);
    const uploadedUrl = String(data.imageUrl || "");
    if (!response.ok || data.success !== true || !uploadedUrl) {
      const serverError = String(data.error || "");
      const messages: Record<string, string> = {
        r2_media_binding_not_configured: "تخزين الصور غير مفعّل على Cloudflare بعد.",
        image_too_large_max_5mb: "حجم الصورة بعد الضغط أكبر من 5 ميغابايت.",
        unsupported_or_invalid_image_type: "صيغة الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.",
        invalid_multipart_upload: "تعذر قراءة ملف الصورة. أعد اختياره وحاول مجددًا.",
      };
      throw new Error(messages[serverError] || serverError || "تعذر رفع الصورة إلى Cloudflare.");
    }
    return uploadedUrl;
  };

  const submitSend = async (scheduledAt: Date | null, deviceKeys: string[]) => {
    setSendBusy(true);
    try {
      let finalImageUrl = "";
      if (imageMode === "url") finalImageUrl = imageUrl.trim();
      if (imageMode === "upload") {
        finalImageUrl = selectedImage ? await uploadSelectedImage(selectedImage) : imageUrl.trim();
        if (!finalImageUrl) throw new Error("اختر صورة من الجهاز أولًا.");
        setImageUrl(finalImageUrl);
        setSelectedImage(null);
      }
      const targetFilter: Record<string, unknown> = { language };
      if (appVersion.trim()) targetFilter.appVersion = appVersion.trim();
      if (deviceKeys.length) targetFilter.deviceKeys = deviceKeys;
      const response = await authenticatedFetch("/admin/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          language,
          ...(finalImageUrl ? { imageUrl: finalImageUrl } : {}),
          targetFilter,
          ...(scheduledAt ? { scheduledAt: scheduledAt.toISOString() } : {}),
        }),
      });
      const data = await readResponse(response);
      if (!response.ok || data.success === false || data.ok === false) {
        const errorCode = String(data.error ?? data.message ?? "");
        throw new Error(errorCode === "notification_payload_too_large_with_image"
          ? "نص الإشعار طويل جدًا لإرفاق صورة. اختصر النص ثم حاول مجددًا."
          : errorCode || "فشل إرسال الإشعار.");
      }
      const count = Number(data.count ?? data.totalTargets ?? data.total_targets ?? data.targets ?? 0);
      setTitle("");
      setBody("");
      setImageMode("none");
      setImageUrl("");
      setSelectedImage(null);
      setScheduleMode("now");
      Alert.alert(
        scheduledAt ? "تمت الجدولة" : "تم الإرسال",
        scheduledAt
          ? `تمت جدولة الإشعار للوقت ${scheduledAt.toLocaleString("ar-EG")} ضمن الفلاتر المحددة.`
          : `اكتمل طلب الإرسال. عدد الأجهزة المستهدفة: ${Number.isFinite(count) ? count : 0}.`
      );
    } catch (error) {
      Alert.alert("تعذر تنفيذ الإشعار", error instanceof Error ? error.message : "تحقق من الاتصال ثم حاول مجددًا.");
    } finally {
      setSendBusy(false);
    }
  };

  const confirmSend = () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert("بيانات ناقصة", "أدخل عنوان الإشعار ونصه.");
      return;
    }
    if (imageMode === "url") {
      try {
        if (new URL(imageUrl.trim()).protocol !== "https:") throw new Error();
      } catch {
        Alert.alert("رابط غير صالح", "أدخل رابط صورة مباشرًا يبدأ بـ https://.");
        return;
      }
    }
    if (imageMode === "upload" && !selectedImage && !imageUrl.trim()) {
      Alert.alert("لم تُختر صورة", "اختر صورة من الجهاز أو عطّل خيار الصورة.");
      return;
    }
    const [year, month, day] = scheduleDate.split("-").map(Number);
    const scheduledAt = scheduleMode === "scheduled" ? new Date(year, month - 1, day, Number(scheduleHour), Number(scheduleMinute), 0, 0) : null;
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      Alert.alert("وقت غير صالح", "يجب أن يكون موعد الإرسال في المستقبل.");
      return;
    }

    const manual = manualDeviceKeys.split(/[\n,;]+/).map((key) => key.trim()).filter(Boolean);
    const deviceKeys = [...new Set([...selectedDeviceKeys, ...manual])];
    if (deviceKeys.length > MAX_DEVICE_KEYS) {
      Alert.alert("عدد كبير من الأجهزة", `اختر أو أدخل ${MAX_DEVICE_KEYS} مفتاحًا كحد أقصى.`);
      return;
    }
    const languageLabel = languageOptions.find((option) => option.value === language)?.label || "الكل";
    const audience = deviceKeys.length
      ? `${deviceKeys.length} جهاز محدد`
      : language === "all" && !appVersion.trim()
        ? "كل الأجهزة النشطة"
        : `الأجهزة المطابقة للغة ${languageLabel}${appVersion.trim() ? ` والإصدار ${appVersion.trim()}` : ""}`;
    const action = scheduledAt ? "جدولة" : "إرسال";
    Alert.alert(
      `تأكيد ${action} الإشعار`,
      `${audience}${scheduledAt ? `\nالموعد: ${scheduledAt.toLocaleString("ar-EG")}` : " الآن"}.\nهل تريد المتابعة؟`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: action, onPress: () => void submitSend(scheduledAt, deviceKeys) },
      ]
    );
  };

  if (!session) {
    return (
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Feather name="cloud" size={21} color={GOLD} />
          <Text style={styles.cardTitle}>إشعارات Cloudflare</Text>
        </View>
        <Text style={styles.help}>سجّل الدخول بكلمة مرور المسؤول للحصول على جلسة مؤقتة. لا يوجد مفتاح API داخل التطبيق ولا يُحفظ رمز الجلسة على الجهاز.</Text>
        <TextInput
          style={styles.input}
          placeholder="كلمة مرور المسؤول"
          placeholderTextColor="#64748B"
          value={passphrase}
          onChangeText={setPassphrase}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={login}
        />
        <TouchableOpacity style={[styles.primaryButton, authBusy && styles.disabled]} onPress={login} disabled={authBusy} activeOpacity={0.82}>
          {authBusy ? <ActivityIndicator color="#0F172A" /> : <Feather name="log-in" size={17} color="#0F172A" />}
          <Text style={styles.primaryButtonText}>{authBusy ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <Feather name="cloud" size={21} color={GOLD} />
            <Text style={styles.cardTitle}>إشعارات Cloudflare</Text>
          </View>
          <TouchableOpacity onPress={() => onSessionChange(null)} style={styles.logoutButton}>
            <Feather name="log-out" size={15} color="#FCA5A5" />
            <Text style={styles.logoutText}>خروج</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.help}>الجلسة تنتهي تلقائيًا بعد 8 ساعات. نظام Google Sheets يعمل بشكل مستقل ولم يتغير.</Text>

        <LocalNotificationTestPanel />

        <View style={styles.importCard}>
          <Text style={styles.cardTitle}>استيراد توكنات من Google Sheets</Text>
          <Text style={styles.smallHelp}>يقرأ الرابط العام المحدد من الخادم. أدخل رابط الورقة مع gid، وحرف العمود الذي يحتوي Expo Push Tokens. المعاينة لا تغيّر قاعدة البيانات؛ الاستيراد لا يعطّل السجلات الموجودة.</Text>
          <Text style={styles.label}>رابط الشيت</Text>
          <TextInput style={styles.input} value={sheetUrl} onChangeText={(value) => { setSheetUrl(value); setSheetPreview(null); }} placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..." placeholderTextColor="#64748B" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <Text style={styles.label}>عمود التوكنات</Text>
          <TextInput style={styles.input} value={sheetColumn} onChangeText={(value) => { setSheetColumn(value.toUpperCase()); setSheetPreview(null); }} placeholder="C" placeholderTextColor="#64748B" autoCapitalize="characters" autoCorrect={false} maxLength={3} />
          <TouchableOpacity style={[styles.loadButton, { justifyContent: "center", minHeight: 42 }, (sheetImportBusy || !session) && styles.disabled]} onPress={() => void previewSheetImport()} disabled={sheetImportBusy || !session}>
            {sheetImportBusy ? <ActivityIndicator size="small" color={GOLD} /> : <Feather name="search" size={15} color={GOLD} />}
            <Text style={styles.loadText}>{sheetImportBusy ? "جارٍ فحص الشيت…" : "معاينة التوكنات"}</Text>
          </TouchableOpacity>
          {sheetPreview && <>
            <Text style={styles.smallHelp}>صالح وفريد: {sheetPreview.validUnique} · مكرر: {sheetPreview.duplicates} · فارغ أو غير صالح: {sheetPreview.invalid}</Text>
            <TouchableOpacity style={[styles.primaryButton, (sheetImportBusy || sheetPreview.validUnique < 1) && styles.disabled]} onPress={() => void commitSheetImport()} disabled={sheetImportBusy || sheetPreview.validUnique < 1}>
              {sheetImportBusy ? <ActivityIndicator color="#0F172A" /> : <Feather name="download-cloud" size={17} color="#0F172A" />}
              <Text style={styles.primaryButtonText}>{sheetImportBusy ? "جارٍ الاستيراد…" : `استيراد ${sheetPreview.validUnique} توكن`}</Text>
            </TouchableOpacity>
          </>}
        </View>

        <Text style={styles.label}>عنوان الإشعار</Text>
        <TextInput style={styles.input} placeholder="عنوان قصير" placeholderTextColor="#64748B" value={title} onChangeText={setTitle} maxLength={120} />
        <Text style={styles.label}>نص الإشعار</Text>
        <TextInput style={[styles.input, styles.multiline]} placeholder="اكتب نص الإشعار" placeholderTextColor="#64748B" value={body} onChangeText={setBody} multiline maxLength={2000} />

        <Text style={styles.label}>صورة للإشعار (اختياري)</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity onPress={() => { setImageMode("none"); setImageUrl(""); setSelectedImage(null); }} style={[styles.chip, imageMode === "none" && styles.chipActive]}>
            <Text style={[styles.chipText, imageMode === "none" && styles.chipTextActive]}>بدون صورة</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setImageMode("upload"); setImageUrl(""); }} style={[styles.chip, imageMode === "upload" && styles.chipActive]}>
            <Text style={[styles.chipText, imageMode === "upload" && styles.chipTextActive]}>رفع من الجهاز</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setImageMode("url"); setSelectedImage(null); setImageUrl(""); }} style={[styles.chip, imageMode === "url" && styles.chipActive]}>
            <Text style={[styles.chipText, imageMode === "url" && styles.chipTextActive]}>رابط صورة</Text>
          </TouchableOpacity>
        </View>
        {imageMode === "upload" && (
          <>
            <TouchableOpacity style={[styles.loadButton, pickingImage && styles.disabled]} onPress={() => void pickImage()} disabled={pickingImage}>
              {pickingImage ? <ActivityIndicator size="small" color={GOLD} /> : <Feather name="image" size={15} color={GOLD} />}
              <Text style={styles.loadText}>{pickingImage ? "جارٍ تجهيز الصورة…" : selectedImage ? "اختيار صورة أخرى" : "اختيار صورة من الجهاز"}</Text>
            </TouchableOpacity>
            {selectedImage ? <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} resizeMode="cover" /> : imageUrl ? <Image source={{ uri: imageUrl }} style={styles.imagePreview} resizeMode="cover" /> : null}
            <Text style={styles.smallHelp}>تُضغط الصورة تلقائيًا إلى JPEG قبل الرفع. الحد الأقصى للملف 5 ميغابايت.</Text>
          </>
        )}
        {imageMode === "url" && (
          <>
            <TextInput style={styles.input} placeholder="https://example.com/image.jpg" placeholderTextColor="#64748B" value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={2048} />
            {imageUrl.trim().startsWith("https://") ? <Image source={{ uri: imageUrl.trim() }} style={styles.imagePreview} resizeMode="cover" /> : null}
            <Text style={styles.smallHelp}>استخدم رابط صورة مباشرًا وآمنًا يبدأ بـ https://، وستظهر معاينة قبل الإرسال.</Text>
          </>
        )}

        <Text style={styles.label}>اللغة</Text>
        <View style={styles.chipRow}>
          {languageOptions.map((option) => (
            <TouchableOpacity key={option.value} onPress={() => setLanguage(option.value)} style={[styles.chip, language === option.value && styles.chipActive]}>
              <Text style={[styles.chipText, language === option.value && styles.chipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <DropdownField
          label="إصدار التطبيق المستهدف"
          value={appVersion}
          placeholder={devices.length ? "اختر إصدارًا" : "حمّل قائمة الأجهزة أولًا"}
          options={versionOptions}
          onChange={setAppVersion}
        />
        <Text style={styles.smallHelp}>اختيار إصدار يقيّد الإرسال على أجهزته فقط. حمّل القائمة لتحديث الإصدارات المتاحة.</Text>

        <View style={styles.headerRow}>
          <Text style={styles.label}>أجهزة محددة (اختياري، حد 200)</Text>
          <TouchableOpacity onPress={loadDevices} disabled={devicesBusy} style={styles.loadButton}>
            {devicesBusy ? <ActivityIndicator size="small" color={GOLD} /> : <Feather name="refresh-cw" size={14} color={GOLD} />}
            <Text style={styles.loadText}>تحميل القائمة</Text>
          </TouchableOpacity>
        </View>
        {deviceCount !== null && <Text style={styles.smallHelp}>تم تحميل {devices.length} من {deviceCount} جهاز · النتائج المطابقة: {filteredDevices.length} · المحددة: {selectedDeviceKeys.length}</Text>}
        {devices.length > 0 && (
          <>
            <TextInput style={styles.input} placeholder="ابحث بالمعرّف أو الإصدار أو المنصة" placeholderTextColor="#64748B" value={deviceSearch} onChangeText={(value) => { setDeviceSearch(value); setVisibleDeviceLimit(40); }} autoCapitalize="none" />
            <ScrollView style={styles.deviceList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {visibleDevices.map((device) => {
                const selected = selectedDeviceKeys.includes(device.deviceKey);
                return (
                  <TouchableOpacity key={device.deviceKey} onPress={() => toggleDevice(device.deviceKey)} style={styles.deviceRow} activeOpacity={0.75}>
                    <Feather name={selected ? "check-square" : "square"} size={18} color={selected ? GOLD : MUTED} />
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceLabel} numberOfLines={1}>{device.label}</Text>
                      <Text style={styles.deviceMeta} numberOfLines={1}>{device.deviceKey} · {device.language}{device.platform ? ` · ${device.platform}` : ""}</Text>
                    </View>
                    {device.appVersion ? <Text style={styles.versionBadge}>{device.appVersion}</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {visibleDeviceLimit < filteredDevices.length && (
              <TouchableOpacity style={styles.showMoreButton} onPress={() => setVisibleDeviceLimit((limit) => limit + 40)}>
                <Text style={styles.showMoreText}>عرض المزيد ({Math.min(40, filteredDevices.length - visibleDeviceLimit)} من {filteredDevices.length - visibleDeviceLimit})</Text>
                <Feather name="chevron-down" size={15} color={GOLD} />
              </TouchableOpacity>
            )}
          </>
        )}
        <TextInput
          style={[styles.input, styles.multilineSmall]}
          placeholder="مفاتيح أجهزة يدويًا، مفصولة بفواصل (اختياري)"
          placeholderTextColor="#64748B"
          value={manualDeviceKeys}
          onChangeText={setManualDeviceKeys}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />

        <DropdownField label="طريقة الإرسال" value={scheduleMode} placeholder="اختر" options={scheduleModeOptions} onChange={(value) => setScheduleMode(value as "now" | "scheduled")} />
        {scheduleMode === "scheduled" && (
          <>
            <DropdownField label="اليوم" value={scheduleDate} placeholder="اختر اليوم" options={dateOptions} onChange={setScheduleDate} />
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <DropdownField label="الساعة" value={scheduleHour} placeholder="ساعة" options={hourOptions} onChange={setScheduleHour} />
              </View>
              <View style={styles.timeField}>
                <DropdownField label="الدقائق" value={scheduleMinute} placeholder="دقيقة" options={minuteOptions} onChange={setScheduleMinute} />
              </View>
            </View>
            <Text style={styles.smallHelp}>اختر الوقت المحلي؛ تُرسل الرسالة تلقائيًا عند حلول الموعد.</Text>
          </>
        )}

        <TouchableOpacity style={[styles.primaryButton, sendBusy && styles.disabled]} onPress={confirmSend} disabled={sendBusy} activeOpacity={0.82}>
          {sendBusy ? <ActivityIndicator color="#0F172A" /> : <Feather name={scheduleMode === "scheduled" ? "clock" : "send"} size={17} color="#0F172A" />}
          <Text style={styles.primaryButtonText}>{sendBusy ? "جارٍ التنفيذ…" : scheduleMode === "scheduled" ? "جدولة الإشعار" : "إرسال الإشعار"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 14 },
  card: { padding: 20, borderRadius: 24, backgroundColor: "#1E293B", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", gap: 12 },
  importCard: { padding: 14, borderRadius: 16, backgroundColor: "#0F172A", borderWidth: 1, borderColor: "rgba(200,169,81,0.25)", gap: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { color: "#FFF", fontSize: 17, fontFamily: "Cairo_700Bold", textAlign: "right" },
  help: { color: MUTED, fontSize: 12, lineHeight: 20, fontFamily: "Cairo_400Regular", textAlign: "right" },
  smallHelp: { color: MUTED, fontSize: 10, lineHeight: 17, fontFamily: "Cairo_400Regular", textAlign: "right" },
  label: { color: "#E2E8F0", fontSize: 12, fontFamily: "Cairo_600SemiBold", textAlign: "right", marginTop: 3 },
  input: { minHeight: 48, backgroundColor: "#0F172A", borderRadius: 13, paddingHorizontal: 13, paddingVertical: 11, color: "#FFF", borderWidth: 1, borderColor: "#334155", fontSize: 13, fontFamily: "Cairo_400Regular", textAlign: "right" },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  multilineSmall: { minHeight: 64, textAlignVertical: "top" },
  imagePreview: { width: "100%", height: 190, borderRadius: 15, backgroundColor: "#0F172A", marginTop: 6 },
  primaryButton: { minHeight: 50, borderRadius: 14, backgroundColor: GOLD, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 4 },
  primaryButtonText: { color: "#0F172A", fontSize: 14, fontFamily: "Cairo_700Bold" },
  disabled: { opacity: 0.55 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 7 },
  chip: { paddingHorizontal: 12, minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: "#475569", alignItems: "center", justifyContent: "center", backgroundColor: "#0F172A" },
  chipActive: { borderColor: GOLD, backgroundColor: "rgba(200,169,81,0.16)" },
  chipText: { color: MUTED, fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  chipTextActive: { color: GOLD },
  loadButton: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, borderRadius: 10, backgroundColor: "rgba(200,169,81,0.1)" },
  loadText: { color: GOLD, fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  deviceList: { maxHeight: 260, backgroundColor: "#0F172A", borderRadius: 12, paddingHorizontal: 10 },
  deviceRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", paddingVertical: 7 },
  deviceInfo: { flex: 1, minWidth: 0 },
  deviceLabel: { color: "#FFF", fontSize: 11, fontFamily: "Cairo_600SemiBold", textAlign: "right" },
  deviceMeta: { color: MUTED, fontSize: 9, fontFamily: "Cairo_400Regular", textAlign: "right", marginTop: 1 },
  versionBadge: { color: GOLD, fontSize: 9, fontFamily: "Inter_600SemiBold" },
  logoutButton: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, borderRadius: 10, backgroundColor: "rgba(239,68,68,0.1)" },
  logoutText: { color: "#FCA5A5", fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  dropdownField: { minHeight: 48, backgroundColor: "#0F172A", borderRadius: 13, paddingHorizontal: 13, borderWidth: 1, borderColor: "#334155", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dropdownValue: { color: "#FFF", fontSize: 13, fontFamily: "Cairo_600SemiBold", textAlign: "right", flex: 1 },
  dropdownPlaceholder: { color: MUTED },
  dropdownOverlay: { flex: 1, backgroundColor: "rgba(2,6,23,0.72)", justifyContent: "center", padding: 22 },
  dropdownSheet: { maxHeight: "75%", backgroundColor: "#1E293B", borderRadius: 20, borderWidth: 1, borderColor: "#475569", padding: 15 },
  dropdownHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#334155" },
  dropdownTitle: { color: "#FFF", fontSize: 15, fontFamily: "Cairo_700Bold" },
  dropdownOptions: { marginTop: 7 },
  dropdownOption: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)", paddingHorizontal: 5 },
  dropdownOptionText: { color: "#E2E8F0", fontSize: 13, fontFamily: "Cairo_600SemiBold", flex: 1, textAlign: "right" },
  showMoreButton: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, backgroundColor: "rgba(200,169,81,0.08)" },
  showMoreText: { color: GOLD, fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  timeRow: { flexDirection: "row", gap: 10 },
  timeField: { flex: 1 },
});
