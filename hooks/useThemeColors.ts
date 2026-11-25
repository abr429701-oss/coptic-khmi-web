import Colors from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

export function useThemeColors() {
  const { isDark } = useTheme();
  return isDark ? Colors.dark : Colors.light;
}
