import groovy.json.JsonSlurper
import java.util.Properties
import org.gradle.api.tasks.Sync

plugins {
    id("com.android.application")
}

val debugHomeUrl = providers.gradleProperty("lightNoteHomeUrl")
    .orElse("https://boluo66.top/app")
    .get()

val notificationSmokeEnabled = providers.gradleProperty("lightNoteNotificationSmoke")
    .map(String::toBoolean).getOrElse(false)

val huaweiPushEnabled = providers.gradleProperty("lightNoteHuaweiPush")
    .map(String::toBoolean).getOrElse(false)
val huaweiPushReleaseEnabled = providers.gradleProperty("lightNoteHuaweiPushRelease")
    .map(String::toBoolean).getOrElse(false)
val publishedVersionCode = 10002
val publishedVersionName = "1.0.2"
val releaseVersionCodeOverride = providers.gradleProperty("lightNoteReleaseVersionCode").orNull
val releaseVersionNameOverride = providers.gradleProperty("lightNoteReleaseVersionName").orNull
check((releaseVersionCodeOverride == null) == (releaseVersionNameOverride == null)) {
    "Provide both lightNoteReleaseVersionCode and lightNoteReleaseVersionName"
}
if (huaweiPushReleaseEnabled) {
    check(releaseVersionCodeOverride != null) { "Provide explicit version for Huawei release candidate" }
}
val releaseVersionCode = releaseVersionCodeOverride?.let {
    requireNotNull(it.toIntOrNull()) { "lightNoteReleaseVersionCode must be an integer" }
        .also { code -> check(code > publishedVersionCode) { "Release version code must increase" } }
} ?: publishedVersionCode
val releaseVersionName = releaseVersionNameOverride?.also {
    check(it.isNotBlank()) { "lightNoteReleaseVersionName cannot be empty" }
} ?: publishedVersionName

val notificationSyncEnabled = providers.gradleProperty("lightNoteNotificationSync")
    .map(String::toBoolean).getOrElse(false) || huaweiPushEnabled

val huaweiPushProbeEnabled = providers.gradleProperty("lightNoteHuaweiPushProbe")
    .map(String::toBoolean).getOrElse(false)
val huaweiConfigFile = providers.gradleProperty("lightNoteHuaweiConfig").orNull?.let { file(it) }
val huaweiReleaseConfigFile = providers.gradleProperty("lightNoteHuaweiReleaseConfig").orNull?.let { file(it) }
fun huaweiAppId(configFile: java.io.File?, packageName: String, propertyName: String): String {
    check(configFile?.isFile == true) { "Provide -P$propertyName=/absolute/path/agconnect-services.json" }
    val config = JsonSlurper().parse(configFile!!) as Map<*, *>
    fun containsSecret(value: Any?): Boolean = when (value) {
        is Map<*, *> -> value.any { (key, child) ->
            ((key.toString().contains("secret", true) || key == "api_key") && !child?.toString().isNullOrBlank()) || containsSecret(child)
        }
        is List<*> -> value.any { containsSecret(it) }
        else -> false
    }
    check(!containsSecret(config)) { "Download client configuration with 'Exclude secrets' enabled" }
    val client = config["client"] as Map<*, *>
    check(client["package_name"] == packageName) { "Huawei configuration must match $packageName" }
    return client["app_id"].toString().also { check(it.matches(Regex("[0-9]+"))) }
}
val huaweiDebugAppId = if (huaweiPushProbeEnabled || huaweiPushEnabled)
    huaweiAppId(huaweiConfigFile, "top.boluo66.lightnote.preview", "lightNoteHuaweiConfig") else ""
val huaweiReleaseAppId = if (huaweiPushReleaseEnabled)
    huaweiAppId(huaweiReleaseConfigFile, "top.boluo66.lightnote", "lightNoteHuaweiReleaseConfig") else ""

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
        versionCode = releaseVersionCode
        versionName = releaseVersionName
        buildConfigField("boolean", "NOTIFICATION_SMOKE", "false")
        buildConfigField("boolean", "NOTIFICATION_SYNC", "false")
        buildConfigField("boolean", "HUAWEI_PUSH_PROBE", "false")
        buildConfigField("boolean", "HUAWEI_PUSH", "false")
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
            buildConfigField("boolean", "HUAWEI_PUSH_PROBE", huaweiPushProbeEnabled.toString())
            buildConfigField("boolean", "HUAWEI_PUSH", huaweiPushEnabled.toString())
            manifestPlaceholders["huaweiAppId"] = huaweiDebugAppId
            buildConfigField("boolean", "NOTIFICATION_SMOKE", notificationSmokeEnabled.toString())
            buildConfigField("boolean", "NOTIFICATION_SYNC", notificationSyncEnabled.toString())
            buildConfigField("String", "HOME_URL", "\"$debugHomeUrl\"")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("boolean", "HUAWEI_PUSH", huaweiPushReleaseEnabled.toString())
            buildConfigField("boolean", "NOTIFICATION_SYNC", huaweiPushReleaseEnabled.toString())
            manifestPlaceholders["huaweiAppId"] = huaweiReleaseAppId
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
        check(listOf(notificationSmokeEnabled, notificationSyncEnabled, huaweiPushProbeEnabled).count { it } <= 1) { "Choose one notification test mode" }
        if (huaweiPushProbeEnabled || huaweiPushEnabled) {
            getByName("debug").manifest.srcFile("src/huaweiPush/AndroidManifest.xml")
            getByName("debug").java.srcDir("src/huaweiPush/java")
            getByName("debug").assets.srcDir(layout.buildDirectory.dir("generated/huawei-debug-assets"))
        }
        if (huaweiPushProbeEnabled) {
            getByName("debug").manifest.srcFile("src/huaweiPushProbe/AndroidManifest.xml")
            getByName("debug").java.srcDir("src/huaweiPushProbe/java")
        }
        if (huaweiPushReleaseEnabled) {
            getByName("release").manifest.srcFile("src/huaweiPush/AndroidManifest.xml")
            getByName("release").java.srcDir("src/huaweiPush/java")
            getByName("release").assets.srcDir(layout.buildDirectory.dir("generated/huawei-release-assets"))
        }
        if (notificationSyncEnabled && !huaweiPushEnabled) {
            getByName("debug").manifest.srcFile("src/notificationSync/AndroidManifest.xml")
        }
        if (notificationSmokeEnabled) {
            getByName("debug").manifest.srcFile("src/notificationSmoke/AndroidManifest.xml")
            getByName("debug").java.srcDir("src/notificationSmoke/java")
        }
        getByName("main").assets.srcDir(
            layout.buildDirectory.dir("generated/legal-assets"),
        )
    }
}

dependencies {
    if (huaweiPushProbeEnabled || huaweiPushEnabled) {
        debugImplementation("com.huawei.hms:push:6.13.0.301")
        debugImplementation("com.huawei.agconnect:agconnect-core:1.9.6.300")
    }
    if (huaweiPushReleaseEnabled) {
        releaseImplementation("com.huawei.hms:push:6.13.0.301")
        releaseImplementation("com.huawei.agconnect:agconnect-core:1.9.6.300")
    }
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

val validateLauncherIconConsistency by tasks.registering {
    group = "verification"
    description = "Verifies that installers and launchers use the same published brand artwork."
    val launcherResources = listOf(
        "src/main/res/mipmap-anydpi/ic_launcher.xml",
        "src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
        "src/main/res/mipmap-anydpi-v33/ic_launcher.xml",
    )
    inputs.files(launcherResources.map(::file))
    doLast {
        launcherResources.forEach { resourcePath ->
            val document = javax.xml.parsers.DocumentBuilderFactory.newInstance()
                .newDocumentBuilder().parse(file(resourcePath))
            val root = document.documentElement
            val items = root.getElementsByTagName("item")
            check(root.tagName == "layer-list" && items.length == 1) {
                "$resourcePath must preserve the published single-layer brand icon."
            }
            val item = items.item(0) as org.w3c.dom.Element
            check(item.getAttribute("android:drawable") == "@drawable/ic_brand_tile") {
                "$resourcePath must use the same brand artwork as the installer."
            }
        }
    }
}

tasks.named("preBuild") {
    dependsOn(syncLegalDocuments)
    dependsOn(validateLauncherIconConsistency)
}

if (huaweiPushProbeEnabled || huaweiPushEnabled) {
    val syncHuaweiDebugConfig by tasks.registering(Sync::class) {
        from(huaweiConfigFile)
        rename { "agconnect-services.json" }
        into(layout.buildDirectory.dir("generated/huawei-debug-assets"))
    }
    tasks.matching { it.name == "preDebugBuild" }.configureEach { dependsOn(syncHuaweiDebugConfig) }
}
if (huaweiPushReleaseEnabled) {
    val syncHuaweiReleaseConfig by tasks.registering(Sync::class) {
        from(huaweiReleaseConfigFile)
        rename { "agconnect-services.json" }
        into(layout.buildDirectory.dir("generated/huawei-release-assets"))
    }
    tasks.matching { it.name == "preReleaseBuild" }.configureEach { dependsOn(syncHuaweiReleaseConfig) }
}
