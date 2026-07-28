plugins {
    id("com.android.application")
}

val debugHomeUrl = providers.gradleProperty("lightNoteHomeUrl")
    .orElse("https://boluo66.top")
    .get()

android {
    namespace = "top.boluo66.lightnote"
    compileSdk = 35

    defaultConfig {
        applicationId = "top.boluo66.lightnote"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "0.1.2"
        buildConfigField("String", "HOME_URL", "\"https://boluo66.top\"")
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".preview"
            buildConfigField("String", "HOME_URL", "\"$debugHomeUrl\"")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    //noinspection GradleDependency
    implementation("androidx.core:core:1.15.0")
    //noinspection GradleDependency
    implementation("androidx.webkit:webkit:1.12.1")
}
