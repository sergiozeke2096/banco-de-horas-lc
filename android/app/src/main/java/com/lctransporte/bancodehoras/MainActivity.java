package com.lctransporte.bancodehoras;

import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.app.DownloadManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.util.HashMap;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    private DownloadManager downloadManager;
    private long pendingApkDownloadId = -1L;
    private final Map<Long, String> pendingOpenDownloadMimeTypes = new HashMap<>();
    private View offlineView;
    private boolean currentLoadFailed = false;
    private boolean suppressOfflineErrorOnce = false;

    private class OfflineAwareWebViewClient extends BridgeWebViewClient {
        OfflineAwareWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            currentLoadFailed = false;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            super.onReceivedError(view, request, error);
            if (!request.isForMainFrame()) {
                return;
            }
            if (suppressOfflineErrorOnce) {
                suppressOfflineErrorOnce = false;
                return;
            }
            currentLoadFailed = true;
            showOfflineView();
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            super.onReceivedHttpError(view, request, errorResponse);
            if (!request.isForMainFrame()) {
                return;
            }
            if (suppressOfflineErrorOnce) {
                suppressOfflineErrorOnce = false;
                return;
            }
            currentLoadFailed = true;
            showOfflineView();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (!currentLoadFailed) {
                hideOfflineView();
            }
        }
    }

    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
                return;
            }

            long downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
            if (downloadId == -1L) {
                return;
            }

            if (downloadId == pendingApkDownloadId) {
                maybeInstallDownloadedApk(downloadId);
                return;
            }

            if (pendingOpenDownloadMimeTypes.containsKey(downloadId)) {
                maybeOpenDownloadedFile(downloadId);
            }
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        downloadManager = getSystemService(DownloadManager.class);
        registerDownloadReceiver();

        if (getBridge() == null) {
            return;
        }

        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }

        getBridge().setWebViewClient(new OfflineAwareWebViewClient(getBridge()));

        offlineView = findViewById(R.id.offlineView);
        View retryButton = findViewById(R.id.btnRetry);
        if (offlineView != null && retryButton != null) {
            retryButton.setOnClickListener(v -> {
                hideOfflineView();
                webView.reload();
            });
        }

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, _contentLength) -> {
            suppressOfflineErrorOnce = true;

            if (downloadManager == null) {
                Toast.makeText(this, "Nao foi possivel iniciar o download.", Toast.LENGTH_SHORT).show();
                return;
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            String cookies = CookieManager.getInstance().getCookie(url);
            boolean isApkDownload = isApkDownload(fileName, mimeType);

            request.setMimeType(mimeType);
            request.setTitle(fileName);
            request.setDescription(isApkDownload ? "Baixando atualizacao do aplicativo" : "Baixando arquivo");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);

            if (cookies != null && !cookies.isEmpty()) {
                request.addRequestHeader("Cookie", cookies);
            }
            if (userAgent != null && !userAgent.isEmpty()) {
                request.addRequestHeader("User-Agent", userAgent);
            }

            long downloadId = downloadManager.enqueue(request);
            if (isApkDownload) {
                pendingApkDownloadId = downloadId;
                Toast.makeText(this, "Download da atualizacao iniciado.", Toast.LENGTH_SHORT).show();
                return;
            }

            if (shouldOpenDownloadedFile(fileName, mimeType)) {
                pendingOpenDownloadMimeTypes.put(downloadId, mimeType);
            }

            Toast.makeText(this, "Download iniciado.", Toast.LENGTH_SHORT).show();
        });
    }

    private void showOfflineView() {
        if (offlineView != null) {
            offlineView.setVisibility(View.VISIBLE);
        }
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setVisibility(View.INVISIBLE);
        }
    }

    private void hideOfflineView() {
        if (offlineView != null) {
            offlineView.setVisibility(View.GONE);
        }
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setVisibility(View.VISIBLE);
        }
    }

    @Override
    public void onResume() {
        super.onResume();

        if (pendingApkDownloadId != -1L) {
            maybeInstallDownloadedApk(pendingApkDownloadId);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();

        try {
            unregisterReceiver(downloadReceiver);
        } catch (IllegalArgumentException _error) {
            // Receiver may not have been registered yet.
        }
    }

    private void registerDownloadReceiver() {
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            return;
        }

        registerReceiver(downloadReceiver, filter);
    }

    private boolean isApkDownload(String fileName, String mimeType) {
        String safeFileName = fileName == null ? "" : fileName.toLowerCase();
        String safeMimeType = mimeType == null ? "" : mimeType.toLowerCase();

        return safeFileName.endsWith(".apk")
            || safeMimeType.contains("application/vnd.android.package-archive")
            || safeMimeType.contains("application/octet-stream");
    }

    private boolean shouldOpenDownloadedFile(String fileName, String mimeType) {
        String safeFileName = fileName == null ? "" : fileName.toLowerCase();
        String safeMimeType = mimeType == null ? "" : mimeType.toLowerCase();

        return safeFileName.endsWith(".xlsx")
            || safeMimeType.contains("spreadsheetml")
            || safeMimeType.contains("ms-excel");
    }

    private void maybeInstallDownloadedApk(long downloadId) {
        if (downloadManager == null || downloadId == -1L) {
            return;
        }

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = downloadManager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                return;
            }

            int statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusColumn < 0) {
                return;
            }

            int status = cursor.getInt(statusColumn);
            if (status == DownloadManager.STATUS_PENDING || status == DownloadManager.STATUS_RUNNING) {
                return;
            }

            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                pendingApkDownloadId = -1L;
                Toast.makeText(this, "Falha ao baixar a atualizacao.", Toast.LENGTH_SHORT).show();
                return;
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            Intent settingsIntent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getPackageName())
            );
            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(settingsIntent);
            Toast.makeText(this, "Permita instalacao deste app para concluir a atualizacao.", Toast.LENGTH_LONG).show();
            return;
        }

        Uri apkUri = downloadManager.getUriForDownloadedFile(downloadId);
        if (apkUri == null) {
            Toast.makeText(this, "APK baixado, mas nao foi possivel abrir a instalacao.", Toast.LENGTH_SHORT).show();
            return;
        }

        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(installIntent);
        pendingApkDownloadId = -1L;
    }

    private void maybeOpenDownloadedFile(long downloadId) {
        if (downloadManager == null || downloadId == -1L) {
            return;
        }

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = downloadManager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                return;
            }

            int statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusColumn < 0) {
                return;
            }

            int status = cursor.getInt(statusColumn);
            if (status == DownloadManager.STATUS_PENDING || status == DownloadManager.STATUS_RUNNING) {
                return;
            }

            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                pendingOpenDownloadMimeTypes.remove(downloadId);
                Toast.makeText(this, "Falha ao baixar a planilha.", Toast.LENGTH_SHORT).show();
                return;
            }
        }

        Uri fileUri = downloadManager.getUriForDownloadedFile(downloadId);
        if (fileUri == null) {
            pendingOpenDownloadMimeTypes.remove(downloadId);
            Toast.makeText(this, "Planilha baixada, mas nao foi possivel abrir o arquivo.", Toast.LENGTH_SHORT).show();
            return;
        }

        String mimeType = pendingOpenDownloadMimeTypes.remove(downloadId);
        Intent openIntent = new Intent(Intent.ACTION_VIEW);
        openIntent.setDataAndType(
            fileUri,
            mimeType == null || mimeType.isEmpty()
                ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : mimeType
        );
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        openIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        try {
            startActivity(openIntent);
            Toast.makeText(this, "Planilha pronta para abrir.", Toast.LENGTH_SHORT).show();
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "Planilha baixada. Instale um app que abra XLSX para visualizar.", Toast.LENGTH_LONG).show();
        }
    }
}
