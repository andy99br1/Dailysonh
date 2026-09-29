plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.musicadodia.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.musicadodia.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

val syncGameUi by tasks.registering(Copy::class) {
    into(layout.projectDirectory.dir("src/main/assets/www"))

    from(rootProject.file("../index.html"))
    from(rootProject.file("../styles.css"))
    from(rootProject.file("../app.js"))
    from(rootProject.file("../logo.svg"))
    from(rootProject.file("../site.webmanifest"))

    from(rootProject.file("../termo")) {
        include("index.html", "termo.css", "termo.js")
        into("termo")
    }
}

tasks.named("preBuild").configure {
    dependsOn(syncGameUi)
}

dependencies {
}
