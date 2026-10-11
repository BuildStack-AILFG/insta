import * as WebBrowser from "expo-web-browser";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { WEB_URL } from "@/lib/api";
import { radius, space, useColors } from "@/lib/theme";

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return <Text style={[styles.muted, { color: c.muted }, style]}>{children}</Text>;
}

export function Button({ title, onPress, busy, disabled, style }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.button, { backgroundColor: c.brand, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {busy ? <ActivityIndicator color={c.onBrand} /> : <Text style={[styles.buttonText, { color: c.onBrand }]}>{title}</Text>}
    </Pressable>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={[styles.center, { backgroundColor: c.background }]}>
      <ActivityIndicator color={c.brand} size="large" />
    </View>
  );
}

/** Pages the app doesn't show itself before sign-in (sign-up, password reset) open in the in-app browser. */
export const openWeb = (path: string) => WebBrowser.openBrowserAsync(`${WEB_URL}${path}`);

const styles = StyleSheet.create({
  muted: { fontSize: 13 },
  button: { height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
  buttonText: { fontSize: 15, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
});
