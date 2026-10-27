package com.construecm.daos.registro;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;

/** Shell Android: cuenta y datos viven en el servidor DAOS, no dentro de la APK. */
public final class MainActivity extends Activity {
    private static final String DAOS_HOST = "daos-registro-obra.vercel.app";
    private static final String DAOS_URL = "https://" + DAOS_HOST + "/daos/andres/";
    private static final int PICK_EVIDENCE = 704;

    private WebView browser;
    private ValueCallback<Uri[]> pendingSelection;
    private Uri pendingCapture;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        browser = new WebView(this);
        browser.setBackgroundColor(0xFF132B48);
        setContentView(browser);

        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, false);
        WebView.setWebContentsDebuggingEnabled(false);

        browser.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri destination = request.getUrl();
                if ("https".equalsIgnoreCase(destination.getScheme())
                    && DAOS_HOST.equalsIgnoreCase(destination.getHost())) return false;

                if (request.isForMainFrame()) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, destination));
                    } catch (ActivityNotFoundException ignored) {
                        // No se abre una dirección desconocida dentro del acceso privado.
                    }
                }
                return true;
            }
        });

        browser.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingSelection != null) pendingSelection.onReceiveValue(null);
                pendingSelection = callback;
                pendingCapture = null;
                try {
                    Intent picker = params.createIntent();
                    Intent chooser = Intent.createChooser(picker, "Evidencia fotográfica DAOS");
                    if (acceptsImages(params)) {
                        Intent camera = cameraIntent();
                        if (camera != null) {
                            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                        }
                    }
                    startActivityForResult(chooser, PICK_EVIDENCE);
                    return true;
                } catch (Exception exception) {
                    pendingSelection = null;
                    pendingCapture = null;
                    callback.onReceiveValue(null);
                    return true;
                }
            }
        });

        if (savedInstanceState == null) browser.loadUrl(DAOS_URL);
        else browser.restoreState(savedInstanceState);
    }

    private boolean acceptsImages(WebChromeClient.FileChooserParams params) {
        String[] types = params.getAcceptTypes();
        if (types == null || types.length == 0) return true;
        for (String type : types) {
            if (type == null || type.isEmpty() || type.startsWith("image/") || type.equals("*/*")) return true;
        }
        return false;
    }

    private Intent cameraIntent() {
        try {
            File pictures = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
            if (pictures == null) return null;
            File temporary = File.createTempFile("daos_evidencia_", ".jpg", pictures);
            pendingCapture = FileProvider.getUriForFile(this,
                    getPackageName() + ".files", temporary);
            Intent camera = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            if (camera.resolveActivity(getPackageManager()) == null) return null;
            camera.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, pendingCapture);
            camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            return camera;
        } catch (IOException | IllegalArgumentException exception) {
            pendingCapture = null;
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_EVIDENCE || pendingSelection == null) return;
        Uri[] selected = null;
        if (resultCode == RESULT_OK) {
            selected = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            if ((selected == null || selected.length == 0) && pendingCapture != null)
                selected = new Uri[]{pendingCapture};
        }
        pendingSelection.onReceiveValue(selected);
        pendingSelection = null;
        pendingCapture = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        browser.saveState(state);
        super.onSaveInstanceState(state);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (browser != null) {
            browser.onResume();
            browser.evaluateJavascript("window.dispatchEvent(new Event('focus'))", null);
        }
    }

    @Override
    protected void onPause() {
        if (browser != null) browser.onPause();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (browser.canGoBack()) browser.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (pendingSelection != null) pendingSelection.onReceiveValue(null);
        browser.destroy();
        super.onDestroy();
    }
}
