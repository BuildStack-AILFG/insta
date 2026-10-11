import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Muted, openWeb } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";

export default function Login() {
  const c = useColors();
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const input = [styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <View style={{ gap: space.xs, marginBottom: space.xl }}>
          <Text style={[styles.brand, { color: c.brand }]}>GramForGrow</Text>
          <Muted style={{ fontSize: 15 }}>Sign in to manage your Instagram DMs, automations and orders.</Muted>
        </View>
        <TextInput
          style={input}
          placeholder="Email"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={input}
          placeholder="Password"
          placeholderTextColor={c.muted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />
        {error && <Text style={{ color: c.danger, marginBottom: space.md }}>{error}</Text>}
        <Button title="Sign in" onPress={submit} busy={busy} />
        <Pressable onPress={() => openWeb("/forgot-password")} style={{ marginTop: space.lg, alignSelf: "center" }}>
          <Text style={{ color: c.brand, fontWeight: "600" }}>Forgot password?</Text>
        </Pressable>
        <Pressable onPress={() => openWeb("/signup")} style={{ marginTop: space.md, alignSelf: "center" }}>
          <Muted>New to GramForGrow? <Text style={{ color: c.brand, fontWeight: "600" }}>Create an account</Text></Muted>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: space.xl },
  brand: { fontSize: 32, fontWeight: "800" },
  input: { height: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.lg, fontSize: 16, marginBottom: space.md },
});
