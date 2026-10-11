import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";

import { Loading } from "@/components/ui";
import { SessionProvider, useSession } from "@/lib/session";
import { useColors } from "@/lib/theme";

function RootStack() {
  const { ready, me } = useSession();
  const c = useColors();
  const scheme = useColorScheme();

  if (!ready) return <Loading />;

  const base = scheme === "light" ? DefaultTheme : DarkTheme;
  const theme = { ...base, colors: { ...base.colors, primary: c.brand, background: c.background, card: c.surface, text: c.text, border: c.border } };
  return (
    <ThemeProvider value={theme}>
      {/* Signed in, the screen is the web dashboard (dark), so the status bar text stays light there. */}
      <StatusBar style={me || scheme !== "light" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
        <Stack.Protected guard={!!me}>
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Protected guard={!me}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootStack />
    </SessionProvider>
  );
}
