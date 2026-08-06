import type { CapacitorConfig } from "@capacitor/cli";
import "dotenv/config";

const androidAppUrl = String(process.env.ANDROID_APP_URL || "").trim();

function buildServerConfig() {
  if (!androidAppUrl) {
    return undefined;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(androidAppUrl);
  } catch (_error) {
    throw new Error("ANDROID_APP_URL deve ser uma URL absoluta valida, por exemplo https://seu-app.onrender.com");
  }

  return {
    url: parsedUrl.toString(),
    cleartext: parsedUrl.protocol === "http:",
    allowNavigation: [parsedUrl.host],
  };
}

const config: CapacitorConfig = {
  appId: "com.lctransporte.bancodehoras",
  appName: "LC Transporte",
  webDir: "capacitor-fallback",
  appendUserAgent: "LCAndroidShell/1.1.7",
  android: {
    allowMixedContent: false,
  },
  server: buildServerConfig(),
};

export default config;
