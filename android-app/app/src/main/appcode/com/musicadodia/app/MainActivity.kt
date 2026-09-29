package com.musicadodia.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.CookieManager
import android.webkit.MimeTypeMap
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {

    companion object {
        private const val APP_HOST = "musicadodia.com"
        private const val MUSIC_URL = "https://musicadodia.com/"
        private const val TERMO_URL = "https://musicadodia.com/termo/"
    }

    private lateinit var root: FrameLayout
    private var webView: WebView? = null

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = Color.rgb(32, 36, 40)
        window.navigationBarColor = Color.rgb(32, 36, 40)

        root = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(32, 36, 40))
        }
        setContentView(root)

        showGameChooser()
    }

    private fun showGameChooser() {
        destroyWebView()
        root.removeAllViews()

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(48), dp(24), dp(32))
            setBackgroundColor(Color.rgb(32, 36, 40))
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }

        val spacerTop = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(1, 0, 1f)
        }
        container.addView(spacerTop)

        container.addView(TextView(this).apply {
            text = "♪"
            textSize = 54f
            setTextColor(Color.rgb(243, 244, 245))
            gravity = Gravity.CENTER
            typeface = Typeface.DEFAULT_BOLD
        })

        container.addView(TextView(this).apply {
            text = "Música do Dia"
            textSize = 28f
            setTextColor(Color.rgb(243, 244, 245))
            gravity = Gravity.CENTER
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, dp(8), 0, 0)
        })

        container.addView(TextView(this).apply {
            text = "Escolha um jogo"
            textSize = 14f
            setTextColor(Color.rgb(167, 173, 179))
            gravity = Gravity.CENTER
            setPadding(0, dp(5), 0, dp(28))
        })

        container.addView(gameChoiceCard(
            icon = "♪",
            title = "Música do Dia",
            subtitle = "Descubra a música por camadas"
        ) {
            showGame(MUSIC_URL)
        })

        container.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(1, dp(12))
        })

        container.addView(gameChoiceCard(
            icon = "T",
            title = "Termo do Dia",
            subtitle = "Descubra a palavra de 5 letras"
        ) {
            showGame(TERMO_URL)
        })

        val spacerBottom = View(this).apply {
            layoutParams = LinearLayout.LayoutParams(1, 0, 1f)
        }
        container.addView(spacerBottom)

        container.addView(TextView(this).apply {
            text = "Um novo desafio todos os dias"
            textSize = 11f
            setTextColor(Color.rgb(126, 133, 140))
            gravity = Gravity.CENTER
            setPadding(0, dp(18), 0, 0)
        })

        root.addView(container)
    }

    private fun gameChoiceCard(
        icon: String,
        title: String,
        subtitle: String,
        onClick: () -> Unit
    ): View {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(18), dp(17), dp(18), dp(17))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(16).toFloat()
                setColor(Color.rgb(41, 47, 52))
                setStroke(dp(1), Color.rgb(58, 65, 71))
            }
            isClickable = true
            isFocusable = true
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val iconBox = TextView(this).apply {
            text = icon
            textSize = if (icon == "T") 26f else 30f
            gravity = Gravity.CENTER
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(243, 244, 245))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(12).toFloat()
                setColor(Color.rgb(52, 59, 66))
            }
            layoutParams = LinearLayout.LayoutParams(dp(54), dp(54))
        }
        card.addView(iconBox)

        val textWrap = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(15), 0, dp(8), 0)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        textWrap.addView(TextView(this).apply {
            text = title
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.rgb(243, 244, 245))
        })

        textWrap.addView(TextView(this).apply {
            text = subtitle
            textSize = 11f
            setTextColor(Color.rgb(167, 173, 179))
            setPadding(0, dp(4), 0, 0)
        })

        card.addView(textWrap)

        card.addView(TextView(this).apply {
            text = "›"
            textSize = 32f
            setTextColor(Color.rgb(167, 173, 179))
            gravity = Gravity.CENTER
        })

        return card
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun showGame(url: String) {
        root.removeAllViews()
        destroyWebView()

        val view = WebView(this).apply {
            setBackgroundColor(Color.rgb(32, 36, 40))
            overScrollMode = View.OVER_SCROLL_NEVER
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
            settings.builtInZoomControls = false
            settings.displayZoomControls = false
            settings.userAgentString = settings.userAgentString + " MusicaDoDiaAndroid/0.3"

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
        webView = view
        root.addView(view)
        view.loadUrl(url)
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

    private fun destroyWebView() {
        webView?.apply {
            stopLoading()
            loadUrl("about:blank")
            removeAllViews()
            destroy()
        }
        webView = null
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    @Deprecated("Deprecated in Android")
    override fun onBackPressed() {
        val view = webView
        if (view == null) {
            super.onBackPressed()
            return
        }

        if (view.canGoBack()) {
            view.goBack()
        } else {
            showGameChooser()
        }
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
    }

    override fun onPause() {
        webView?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        destroyWebView()
        super.onDestroy()
    }
}
