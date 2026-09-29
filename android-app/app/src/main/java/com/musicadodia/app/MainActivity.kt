package com.musicadodia.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.MimeTypeMap
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

class MainActivity : Activity() {

    companion object {
        private const val APP_HOST = "musicadodia.com"
        private const val START_URL = "https://musicadodia.com/"
    }

    private lateinit var webView: WebView

    private val bundledFiles = mapOf(
        "/" to "www/index.html",
        "/index.html" to "www/index.html",
        "/styles.css" to "www/styles.css",
        "/app.js" to "www/app.js",
        "/logo.svg" to "www/logo.svg",
        "/site.webmanifest" to "www/site.webmanifest",
        "/termo" to "www/termo/index.html",
        "/termo/" to "www/termo/index.html",
        "/termo/index.html" to "www/termo/index.html",
        "/termo/termo.css" to "www/termo/termo.css",
        "/termo/termo.js" to "www/termo/termo.js"
    )

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = Color.rgb(32, 36, 40)
        window.navigationBarColor = Color.rgb(32, 36, 40)

        webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(32, 36, 40))
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )

            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.loadsImagesAutomatically = true
            settings.mediaPlaybackRequiresUserGesture = true
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.setSupportMultipleWindows(false)
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.userAgentString = settings.userAgentString + " MusicaDoDiaAndroid/0.2"

            CookieManager.getInstance().setAcceptCookie(true)

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): WebResourceResponse? {
                    val uri = request?.url ?: return null
                    if (isAppHost(uri.host)) {
                        val localPath = bundledFiles[uri.path ?: "/"]
                        if (localPath != null) {
                            return assetResponse(localPath)
                        }
                    }
                    return super.shouldInterceptRequest(view, request)
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?
                ): Boolean {
                    val uri = request?.url ?: return false
                    val scheme = uri.scheme?.lowercase()

                    if ((scheme == "https" || scheme == "http") && isAppHost(uri.host)) {
                        return false
                    }

                    if (scheme == "https" || scheme == "http" || scheme == "mailto" || scheme == "tel") {
                        return openExternal(uri)
                    }

                    return false
                }
            }
        }

        WebView.setWebContentsDebuggingEnabled(false)

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.rgb(32, 36, 40))
        root.addView(webView)
        setContentView(root)

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    private fun isAppHost(host: String?): Boolean {
        val value = host?.lowercase() ?: return false
        return value == APP_HOST || value == "www.$APP_HOST"
    }

    private fun assetResponse(assetPath: String): WebResourceResponse? {
        return try {
            val extension = assetPath.substringAfterLast('.', "")
            val mime = when (extension) {
                "html" -> "text/html"
                "css" -> "text/css"
                "js" -> "application/javascript"
                "svg" -> "image/svg+xml"
                "webmanifest" -> "application/manifest+json"
                else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
                    ?: "application/octet-stream"
            }

            WebResourceResponse(
                mime,
                "UTF-8",
                assets.open(assetPath)
            )
        } catch (_: Exception) {
            null
        }
    }

    private fun openExternal(uri: Uri): Boolean {
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
            true
        } catch (_: Exception) {
            false
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    @Deprecated("Deprecated in Android")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }
}
