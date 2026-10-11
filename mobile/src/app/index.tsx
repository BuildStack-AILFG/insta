import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";

import { Button } from "@/components/ui";
import { ACCESS_TOKEN_KEY, currentSession, REFRESH_TOKEN_KEY, WEB_URL } from "@/lib/api";
import { onNotificationTap } from "@/lib/push";
import { useSession } from "@/lib/session";

const ORIGIN = new URL(WEB_URL).origin;
const BG = "#0a0508"; // the dashboard's dark background (frontend/src/app/globals.css), so the status bar strip matches

/**
 * Runs in the page before any of its scripts:
 *  1. hands the app's session to the website (same localStorage keys as frontend/src/lib/api.ts), unless the website already
 *     holds this generation of it — then its own copy may be newer (refresh tokens rotate, see src/lib/api.ts);
 *  2. reports every token change and sign-out back to the app.
 */
function bridgeScript(): string {
  const s = currentSession();
  return `(function () {
  try {
    if (location.origin !== ${JSON.stringify(ORIGIN)}) return;
    var A = ${JSON.stringify(ACCESS_TOKEN_KEY)}, R = ${JSON.stringify(REFRESH_TOKEN_KEY)}, G = "gfg_session_gen";
    var s = ${JSON.stringify(s)};
    if (s && localStorage.getItem(G) !== String(s.gen)) {
      localStorage.setItem(A, s.access);
      localStorage.setItem(R, s.refresh);
      localStorage.setItem(G, String(s.gen));
    }
    var post = function (m) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
    var set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (k, v) {
      set.call(this, k, v);
      if (this === localStorage && k === R) post({ type: "tokens", access_token: localStorage.getItem(A), refresh_token: v });
    };
    Storage.prototype.removeItem = function (k) {
      remove.call(this, k);
      if (this === localStorage && k === A) post({ type: "signed_out" });
    };
  } catch (e) {}
})();
true;`;
}

const isOwnSite = (url: string) => url.startsWith(ORIGIN + "/") || url === ORIGIN;
const isLoginPage = (url: string) => isOwnSite(url) && /^\/login(\/|\?|$)/.test(new URL(url).pathname);

export default function Dashboard() {
  const { adoptWebTokens, signedOutOnWeb } = useSession();
  const web = useRef<WebView>(null);
  const loaded = useRef(false);
  const canGoBack = useRef(false);
  const [uri, setUri] = useState(`${WEB_URL}/dashboard`);
  const [firstLoad, setFirstLoad] = useState(true);
  const [failed, setFailed] = useState(false);
  // Computed once per mount: later token changes come *from* the page, so it must not be re-injected with an older pair.
  const [injected] = useState(bridgeScript);

  // A tapped push opens its page: navigate in place once the dashboard is up, or start there on a cold launch.
  useEffect(
    () =>
      onNotificationTap((path) => {
        if (loaded.current) web.current?.injectJavaScript(`window.location.assign(${JSON.stringify(WEB_URL + path)}); true;`);
        else setUri(WEB_URL + path);
      }),
    [],
  );

  // Android back button walks back through the dashboard's pages before leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false;
      web.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === "tokens" && m.access_token && m.refresh_token) void adoptWebTokens({ access_token: m.access_token, refresh_token: m.refresh_token });
      if (m.type === "signed_out") void signedOutOnWeb();
    } catch {
      /* not ours */
    }
  };

  const onNavigation = (nav: WebViewNavigation) => {
    canGoBack.current = nav.canGoBack;
    // The website sent us to its login page (signed out, or the session died): sign in again natively instead.
    if (isLoginPage(nav.url)) void signedOutOnWeb();
  };

  // Our pages stay in the app; Instagram, payment pages, WhatsApp/mail links etc. open in their own apps.
  const onShouldStart = (req: ShouldStartLoadRequest) => {
    if (req.isTopFrame === false || isOwnSite(req.url) || req.url.startsWith("about:") || req.url.startsWith("blob:") || req.url.startsWith("data:")) return true;
    void Linking.openURL(req.url).catch(() => undefined);
    return false;
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      {failed ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Can&apos;t reach GramForGrow</Text>
          <Text style={styles.errorBody}>Check your internet connection and try again.</Text>
          <Button
            title="Try again"
            onPress={() => {
              setFailed(false);
              web.current?.reload();
            }}
          />
        </View>
      ) : null}
      <WebView
        ref={web}
        source={{ uri }}
        style={[styles.web, failed && styles.hidden]}
        injectedJavaScriptBeforeContentLoaded={injected}
        onMessage={onMessage}
        onNavigationStateChange={onNavigation}
        onShouldStartLoadWithRequest={onShouldStart}
        onLoadEnd={() => {
          loaded.current = true;
          setFirstLoad(false);
        }}
        onError={() => setFailed(true)}
        applicationNameForUserAgent="GramForGrowApp/1.0"
        domStorageEnabled
        javaScriptEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        textZoom={100}
        overScrollMode="never"
      />
      {firstLoad && !failed && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator color="#ec4899" size="large" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  web: { flex: 1, backgroundColor: BG },
  hidden: { display: "none" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: BG },
  errorTitle: { color: "#fdf2f8", fontSize: 18, fontWeight: "700" },
  errorBody: { color: "#b79aab", fontSize: 14, textAlign: "center" },
});
