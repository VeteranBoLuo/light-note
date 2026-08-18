import java.util.Properties
import org.gradle.api.tasks.Sync

plugins {
    id("com.android.application")
}

val debugHomeUrl = providers.gradleProperty("lightNoteHomeUrl")
    .orElse("https://boluo66.top/app")
    .get()

val releaseSigningPropertiesFile = rootProject.file("keystore.properties")
val releaseSigningProperties = Properties()

if (releaseSigningPropertiesFile.isFile) {
    releaseSigningPropertiesFile.inputStream().use(releaseSigningProperties::load)
}

val releaseSigningSources = linkedMapOf(
    "storeFile" to "LIGHT_NOTE_ANDROID_STORE_FILE",
    "storePassword" to "LIGHT_NOTE_ANDROID_STORE_PASSWORD",
    "keyAlias" to "LIGHT_NOTE_ANDROID_KEY_ALIAS",
    "keyPassword" to "LIGHT_NOTE_ANDROID_KEY_PASSWORD",
)

fun readReleaseSigningProperties(): Pair<Map<String, String>?, String?> {
    val values = releaseSigningSources.mapValues { (propertyName, environmentName) ->
        System.getenv(environmentName)?.trim()?.takeIf(String::isNotEmpty)
            ?: releaseSigningProperties.getProperty(propertyName)
                ?.trim()
                ?.takeIf(String::isNotEmpty)
    }

    val missingProperties = values.filterValues {
        it == null
    }.keys
    if (missingProperties.isNotEmpty()) {
        val missingSources = missingProperties.map { propertyName ->
            "$propertyName (${releaseSigningSources.getValue(propertyName)})"
        }
        return null to
            "Incomplete Android release signing configuration. Missing: " +
            missingSources.joinToString()
    }

    val completeValues = values.mapValues { (_, value) ->
        requireNotNull(value)
    }
    val signingStoreFile = rootProject.file(completeValues.getValue("storeFile"))
    if (!signingStoreFile.isFile) {
        return null to
            "Android release signing keystore does not exist: $signingStoreFile"
    }

    return completeValues to null
}

val (releaseSigning, releaseSigningError) = readReleaseSigningProperties()

android {
    namespace = "top.boluo66.lightnote"
    compileSdk = 35

    defaultConfig {
        applicationId = "top.boluo66.lightnote"
        minSdk = 26
        targetSdk = 35
        versionCode = 10001
        versionName = "1.0.1"
        buildConfigField("String", "HOME_URL", "\"https://boluo66.top/app\"")
    }

    signingConfigs {
        if (releaseSigning != null) {
            create("release") {
                storeFile = rootProject.file(releaseSigning.getValue("storeFile"))
                storePassword = releaseSigning.getValue("storePassword")
                keyAlias = releaseSigning.getValue("keyAlias")
                keyPassword = releaseSigning.getValue("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".preview"
            buildConfigField("String", "HOME_URL", "\"$debugHomeUrl\"")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
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

    sourceSets {
        getByName("main").assets.srcDir(
            layout.buildDirectory.dir("generated/legal-assets"),
        )
    }
}

dependencies {
    //noinspection GradleDependency
    implementation("androidx.core:core:1.15.0")
    //noinspection GradleDependency
    implementation("androidx.webkit:webkit:1.12.1")
}

val validateLongTermReleaseSigning by tasks.registering {
    group = "verification"
    description = "Fails when the long-term Android release signing config is unavailable."

    doLast {
        if (releaseSigning == null) {
            throw GradleException(
                releaseSigningError ?: "Android release signing configuration is unavailable.",
            )
        }
    }
}

tasks.matching {
    it.name == "packageRelease" || it.name == "bundleRelease"
}.configureEach {
    dependsOn(validateLongTermReleaseSigning)
}

val syncLegalDocuments by tasks.registering(Sync::class) {
    val legalDocumentsSource = rootProject.layout.projectDirectory.dir("../web/public/legal")
    from(legalDocumentsSource)
    into(layout.buildDirectory.dir("generated/legal-assets/legal"))

    doFirst {
        if (!legalDocumentsSource.asFile.isDirectory) {
            throw GradleException(
                "Shared legal documents are missing: ${legalDocumentsSource.asFile}",
            )
        }
    }
}

val validateAdaptiveLauncherIcons by tasks.registering {
    group = "verification"
    description = "Verifies that supported Android versions use adaptive launcher icons."

    val launcherResources = linkedMapOf(
        "src/main/res/mipmap-anydpi-v26/ic_launcher.xml" to listOf(
            "<adaptive-icon",
            "<background",
            "<foreground",
        ),
        "src/main/res/mipmap-anydpi-v33/ic_launcher.xml" to listOf(
            "<adaptive-icon",
            "<background",
            "<foreground",
            "<monochrome",
        ),
    )

    inputs.files(launcherResources.keys.map(::file))

    doLast {
        launcherResources.forEach { (resourcePath, requiredElements) ->
            val resourceFile = file(resourcePath)
            check(resourceFile.isFile) {
                "Android launcher icon resource is missing: $resourcePath"
            }

            val resourceText = resourceFile.readText()
            requiredElements.forEach { requiredElement ->
                check(requiredElement in resourceText) {
                    "$resourcePath must contain $requiredElement"
                }
            }
            check("<layer-list" !in resourceText) {
                "$resourcePath must remain an adaptive icon; a layer-list breaks launcher transitions."
            }
        }
    }
}

tasks.named("preBuild") {
    dependsOn(syncLegalDocuments)
    dependsOn(validateAdaptiveLauncherIcons)
}
