import type { CapacitorConfig } from "@capacitor/cli";
import "dotenv/config";

// IOS_APP_URL e opcional: por padrao os dois apps (Android e iOS) carregam a
// mesma URL de producao. So defina IOS_APP_URL separado se um dia precisar
// que o iOS aponte pra outro ambiente (ex.: um canal de beta).
const androidAppUrl = String(process.env.ANDROID_APP_URL || "").trim();
const iosAppUrl = String(process.env.IOS_APP_URL || androidAppUrl || "").trim();

function buildServerConfig(appUrl: string, envVarName: string) {
  if (!appUrl) {
    return undefined;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(appUrl);
  } catch (_error) {
    throw new Error(`${envVarName} deve ser uma URL absoluta valida, por exemplo https://seu-app.onrender.com`);
  }

  return {
    url: parsedUrl.toString(),
    cleartext: parsedUrl.protocol === "http:",
    allowNavigation: [parsedUrl.host],
  };
}

if (iosAppUrl && androidAppUrl && iosAppUrl !== androidAppUrl) {
  // O Capacitor nao suporta uma URL de servidor diferente por plataforma no
  // mesmo config (so appendUserAgent e overridavel por ios/android). Se um
  // dia isso for realmente necessario, vai precisar de dois arquivos de
  // config separados (um por build), nao so uma env var.
  throw new Error(
    "IOS_APP_URL diferente de ANDROID_APP_URL nao e suportado neste config. Configure os dois com a mesma URL."
  );
}

const config: CapacitorConfig = {
  appId: "com.lctransporte.bancodehoras",
  appName: "LC Transporte",
  webDir: "capacitor-fallback",
  android: {
    allowMixedContent: false,
    appendUserAgent: "LCAndroidShell/1.1.11",
  },
  ios: {
    // Versao propria, independente da versao do Android — o iOS nunca tem
    // um mecanismo de auto-update (proibido pela Apple fora da App Store),
    // entao esse numero e so informativo/diagnostico.
    appendUserAgent: "LCiOSShell/1.0.0",
  },
  server: buildServerConfig(androidAppUrl, "ANDROID_APP_URL"),
};

export default config;
