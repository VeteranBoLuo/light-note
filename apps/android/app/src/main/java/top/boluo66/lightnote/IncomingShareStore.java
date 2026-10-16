package top.boluo66.lightnote;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ProviderInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import androidx.core.content.IntentCompat;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 系统分享接收：把别的应用分享进来的文字和文件暂存在 App 私有缓存，等网页「快速添加」确认后再删除。
 *
 * 为什么先复制再交给网页：
 * - 分享方给的 content:// 读取授权跟着接收界面走，登录跳转、GitHub 授权回跳或进程被回收后可能失效；
 *   复制一份之后，只要用户还没保存或关闭，分享内容就不会丢。
 * - 网页通过同域地址 {@link #ROUTE_PREFIX} 读取文件流（见 {@link #serve}），不用 base64 过桥，
 *   大文件也只是流式传输；读到的 File 再走网页现有的托管上传，不在原生端重写上传协议。
 *
 * 只保留最近一次分享：新分享到达时直接替换旧的。网页保存成功或用户关闭弹窗后调用 {@link #complete}，
 * 超过 24 小时未处理的暂存会在下次查询时清掉。
 */
final class IncomingShareStore {
    static final String ROUTE_PREFIX = "/__native-share/";
    static final int MAX_FILES = 100;
    static final long MAX_TOTAL_BYTES = 500L * 1024L * 1024L;
    static final int MAX_TEXT_CHARS = 60_000;
    private static final int MAX_SUBJECT_CHARS = 500;
    private static final int MAX_NAME_CHARS = 120;
    private static final long TTL_MS = 24L * 60L * 60L * 1000L;
    private static final String ROOT_DIR = "incoming-share";
    private static final String MANIFEST = "manifest.json";
    private static final Pattern SHARE_ID = Pattern.compile("^[a-f0-9]{32}$");
    private static final Pattern FILE_INDEX = Pattern.compile("^(0|[1-9][0-9]?)$");
    private static final Pattern UNSAFE_NAME_CHARS = Pattern.compile("[\\\\/:*?\"<>|\\u0000-\\u001f\\u007f]");
    private static final Object LOCK = new Object();
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final AtomicLong GENERATION = new AtomicLong();
    private static final SecureRandom RANDOM = new SecureRandom();
    private static volatile long preparingGeneration = 0L;

    enum AcceptResult { NOT_SHARE, EMPTY, ACCEPTED }

    enum PrepareResult { READY, UNREADABLE, SUPERSEDED }

    interface PrepareListener {
        void onPrepared(PrepareResult result);
    }

    private IncomingShareStore() {}

    static boolean isShareIntent(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        return Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action);
    }

    /** 从最近任务恢复时系统会重放启动 Intent，那次分享早已处理过，不能再接收一遍。 */
    private static boolean isReplayedFromHistory(Intent intent) {
        return (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
    }

    /**
     * 把分享请求原样转交给下一个界面（主界面 → 隐私同意页 → 主界面）。
     *
     * 同意前不读取、不复制任何内容，只转交系统给的请求；文件的临时读取授权通过 ClipData +
     * FLAG_GRANT_READ_URI_PERMISSION 一起转交，否则下一个界面打不开分享方的 content:// 地址。
     * 只拷贝已知字段，不整包复制 extras，避免分享方塞入的未知 Parcelable 在本进程反序列化。
     */
    static void forward(Intent source, Intent target) {
        if (!isShareIntent(source) || isReplayedFromHistory(source)) return;
        Incoming incoming = read(source);
        if (incoming == null) return;
        target.setAction(source.getAction());
        if (source.getType() != null) target.setType(source.getType());
        if (!incoming.text.isEmpty()) target.putExtra(Intent.EXTRA_TEXT, incoming.text);
        if (!incoming.subject.isEmpty()) target.putExtra(Intent.EXTRA_SUBJECT, incoming.subject);
        if (incoming.uris.isEmpty()) return;
        if (Intent.ACTION_SEND_MULTIPLE.equals(source.getAction())) {
            target.putParcelableArrayListExtra(Intent.EXTRA_STREAM, new ArrayList<>(incoming.uris));
        } else {
            target.putExtra(Intent.EXTRA_STREAM, incoming.uris.get(0));
        }
        ClipData clip = ClipData.newRawUri("", incoming.uris.get(0));
        for (int index = 1; index < incoming.uris.size(); index += 1) {
            clip.addItem(new ClipData.Item(incoming.uris.get(index)));
        }
        target.setClipData(clip);
        target.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    }

    /**
     * 接收一次分享：解析后在后台线程复制到私有缓存，完成后在主线程回调。
     * 返回值只说明是否开始处理；真正能否读到内容看回调结果。
     */
    static AcceptResult accept(Context context, Intent intent, PrepareListener listener) {
        if (!isShareIntent(intent) || isReplayedFromHistory(intent)) return AcceptResult.NOT_SHARE;
        Incoming incoming = read(intent);
        if (incoming == null || incoming.isEmpty()) return AcceptResult.EMPTY;
        Context appContext = context.getApplicationContext();
        long generation = GENERATION.incrementAndGet();
        preparingGeneration = generation;
        EXECUTOR.execute(() -> {
            PrepareResult result;
            try {
                result = prepare(appContext, incoming, generation);
            } catch (RuntimeException error) {
                result = PrepareResult.UNREADABLE;
            }
            if (preparingGeneration == generation) preparingGeneration = 0L;
            PrepareResult finalResult = result;
            MAIN.post(() -> listener.onPrepared(finalResult));
        });
        return AcceptResult.ACCEPTED;
    }

    /** 网页查询当前待处理的分享；复制尚未完成时返回 preparing，完成后原生会再派发事件。 */
    static JSONObject peek(Context context) throws JSONException {
        JSONObject result = new JSONObject();
        if (preparingGeneration != 0L) return result.put("status", "preparing");
        synchronized (LOCK) {
            File dir = currentShareDir(context);
            JSONObject manifest = dir == null ? null : readManifest(dir);
            if (manifest == null) return result.put("status", "none");
            if (System.currentTimeMillis() - manifest.optLong("createdAt", 0L) > TTL_MS) {
                deleteRecursively(dir);
                return result.put("status", "none");
            }
            return result.put("status", "ready").put("share", manifest);
        }
    }

    /** 保存成功或用户关闭后删除暂存；只删除指定的那一次，避免误删刚到的新分享。 */
    static void complete(Context context, String shareId) {
        if (shareId == null || !SHARE_ID.matcher(shareId).matches()) return;
        Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            synchronized (LOCK) {
                deleteRecursively(new File(rootDir(appContext), shareId));
            }
        });
    }

    /**
     * 为网页提供分享文件的读取流。只响应受信任来源上的 GET {@link #ROUTE_PREFIX}{id}/{序号}，
     * 其他请求返回 null 交给 WebView 正常处理；不存在的分享明确返回 404，不把请求放到服务器。
     */
    static WebResourceResponse serve(Context context, WebResourceRequest request) {
        Uri url = request.getUrl();
        String path = url == null ? null : url.getPath();
        if (path == null || !path.startsWith(ROUTE_PREFIX)) return null;
        if (!WebViewSupport.isTrustedWebOrigin(url.toString())) return null;
        if (!"GET".equalsIgnoreCase(request.getMethod())) return notFound();
        String[] parts = path.substring(ROUTE_PREFIX.length()).split("/", -1);
        if (parts.length != 2 || !SHARE_ID.matcher(parts[0]).matches() || !FILE_INDEX.matcher(parts[1]).matches()) {
            return notFound();
        }
        synchronized (LOCK) {
            File dir = new File(rootDir(context), parts[0]);
            JSONObject manifest = readManifest(dir);
            JSONObject entry = manifest == null ? null : findFile(manifest, Integer.parseInt(parts[1]));
            File file = new File(dir, parts[1]);
            if (entry == null || !file.isFile()) return notFound();
            try {
                Map<String, String> headers = new HashMap<>();
                headers.put("Cache-Control", "no-store");
                headers.put("X-Content-Type-Options", "nosniff");
                headers.put("Content-Length", String.valueOf(file.length()));
                return new WebResourceResponse(
                    entry.optString("mimeType", "application/octet-stream"),
                    null,
                    200,
                    "OK",
                    headers,
                    new FileInputStream(file)
                );
            } catch (IOException error) {
                return notFound();
            }
        }
    }

    private static PrepareResult prepare(Context context, Incoming incoming, long generation) {
        File root = rootDir(context);
        String shareId = randomId();
        File dir = new File(root, shareId);
        synchronized (LOCK) {
            // 只保留最近一次分享：新分享到达即清掉旧暂存（含已过期和未完成的残留目录）。
            deleteChildren(root);
            if (!dir.mkdirs()) return PrepareResult.UNREADABLE;
        }
        ContentResolver resolver = context.getContentResolver();
        JSONArray files = new JSONArray();
        int skipped = 0;
        JSONObject skippedCounts = new JSONObject();
        JSONArray skippedDetails = new JSONArray();
        long totalBytes = 0L;
        try {
            for (Uri uri : incoming.uris) {
                if (generation != GENERATION.get()) {
                    deleteDir(dir);
                    return PrepareResult.SUPERSEDED;
                }
                if (files.length() >= MAX_FILES && skippedDetails.length() >= MAX_FILES) {
                    skipped += 1;
                    recordSkipped(skippedCounts, skippedDetails, "", "count_limit");
                    continue;
                }
                boolean readable = isReadableForeignContent(context, uri);
                FileMeta meta = readable ? describe(resolver, uri, incoming.mimeType, files.length())
                    : new FileMeta(safeFileName("", "application/octet-stream", files.length() + skipped), "application/octet-stream", -1L);
                if (files.length() >= MAX_FILES || !readable) {
                    skipped += 1;
                    recordSkipped(skippedCounts, skippedDetails, meta.name, files.length() >= MAX_FILES ? "count_limit" : "unreadable");
                    continue;
                }
                if (meta.size > 0L && totalBytes + meta.size > MAX_TOTAL_BYTES) {
                    skipped += 1;
                    recordSkipped(skippedCounts, skippedDetails, meta.name, "size_limit");
                    continue;
                }
                int index = files.length();
                File target = new File(dir, String.valueOf(index));
                long copied = copy(resolver, uri, target, MAX_TOTAL_BYTES - totalBytes);
                if (copied < 0L) {
                    // noinspection ResultOfMethodCallIgnored
                    target.delete();
                    skipped += 1;
                    recordSkipped(skippedCounts, skippedDetails, meta.name, copied == -2L ? "size_limit" : "unreadable");
                    continue;
                }
                totalBytes += copied;
                files.put(new JSONObject()
                    .put("index", index)
                    .put("name", meta.name)
                    .put("mimeType", meta.mimeType)
                    .put("size", copied));
            }
            String text = clip(incoming.text, MAX_TEXT_CHARS);
            String subject = clip(incoming.subject, MAX_SUBJECT_CHARS);
            if (text.trim().isEmpty() && subject.trim().isEmpty() && files.length() == 0 && skipped == 0) {
                deleteDir(dir);
                return PrepareResult.UNREADABLE;
            }
            JSONObject manifest = new JSONObject()
                .put("id", shareId)
                .put("limits", new JSONObject().put("files", MAX_FILES).put("bytes", MAX_TOTAL_BYTES))
                .put("text", text)
                .put("subject", subject)
                .put("textTruncated", incoming.text.length() > MAX_TEXT_CHARS)
                .put("files", files)
                .put("skippedFiles", skipped)
                .put("skippedFileCounts", skippedCounts)
                .put("skippedFileDetails", skippedDetails)
                .put("createdAt", System.currentTimeMillis());
            synchronized (LOCK) {
                if (generation != GENERATION.get()) {
                    deleteRecursively(dir);
                    return PrepareResult.SUPERSEDED;
                }
                writeManifest(dir, manifest);
            }
            return PrepareResult.READY;
        } catch (JSONException | IOException error) {
            deleteDir(dir);
            return PrepareResult.UNREADABLE;
        }
    }

    private static void recordSkipped(JSONObject counts, JSONArray details, String name, String reason) throws JSONException {
        counts.put(reason, counts.optInt(reason, 0) + 1);
        // 清单有读取预算；完整数量始终保留，文件名明细最多 100 项。
        if (details.length() < MAX_FILES) details.put(new JSONObject().put("name", name).put("reason", reason));
    }

    private static Incoming read(Intent intent) {
        try {
            String subject = textOf(intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT)).trim();
            return new Incoming(joinedText(intent), subject, streamUris(intent), intent.getType());
        } catch (RuntimeException error) {
            // 分享方的 extras 损坏或类型不符时，按「没有可保存内容」处理，不让主界面崩溃。
            return null;
        }
    }

    private static String joinedText(Intent intent) {
        CharSequence single = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (single != null) return single.toString();
        ArrayList<CharSequence> parts = intent.getCharSequenceArrayListExtra(Intent.EXTRA_TEXT);
        if (parts == null) return "";
        StringBuilder builder = new StringBuilder();
        for (CharSequence part : parts) {
            String value = textOf(part).trim();
            if (value.isEmpty()) continue;
            if (builder.length() > 0) builder.append("\n\n");
            builder.append(value);
        }
        return builder.toString();
    }

    private static List<Uri> streamUris(Intent intent) {
        LinkedHashSet<Uri> uris = new LinkedHashSet<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> streams = IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri.class);
            if (streams != null) {
                for (Uri uri : streams) if (uri != null) uris.add(uri);
            }
        } else {
            Uri stream = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri.class);
            if (stream != null) uris.add(stream);
        }
        ClipData clip = intent.getClipData();
        if (clip != null) {
            for (int index = 0; index < clip.getItemCount(); index += 1) {
                Uri uri = clip.getItemAt(index).getUri();
                if (uri != null) uris.add(uri);
            }
        }
        return new ArrayList<>(uris);
    }

    /**
     * 只接收其他应用提供的 content:// 地址。
     *
     * file:// 和本应用自己的 Provider 一律拒绝：恶意应用可以伪造分享，让轻笺把自己的私有文件
     * （Cookie、数据库等）当成「分享的文件」读出来再上传。解析不到 Provider 信息时（Android 11+
     * 的应用可见性限制）视为外部应用，读不到内容会在复制阶段失败并计入跳过数。
     */
    private static boolean isReadableForeignContent(Context context, Uri uri) {
        if (uri == null || !ContentResolver.SCHEME_CONTENT.equalsIgnoreCase(uri.getScheme())) return false;
        String authority = uri.getAuthority();
        if (authority == null || authority.isEmpty()) return false;
        for (String part : authority.split(";")) {
            ProviderInfo provider = context.getPackageManager().resolveContentProvider(part, 0);
            if (provider != null && context.getPackageName().equals(provider.packageName)) return false;
        }
        return true;
    }

    private static FileMeta describe(ContentResolver resolver, Uri uri, String intentType, int index) {
        String name = "";
        long size = -1L;
        try (Cursor cursor = resolver.query(
            uri,
            new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE},
            null,
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameColumn >= 0 && !cursor.isNull(nameColumn)) name = cursor.getString(nameColumn);
                if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) size = cursor.getLong(sizeColumn);
            }
        } catch (RuntimeException error) {
            // 部分提供方不支持查询元数据，名称和大小按兜底值处理，复制时仍受总量上限约束。
        }
        String mimeType = null;
        try {
            mimeType = resolver.getType(uri);
        } catch (RuntimeException error) {
            mimeType = null;
        }
        if (WebViewSupport.isBlank(mimeType) && !WebViewSupport.isBlank(intentType) && !intentType.contains("*")) {
            mimeType = intentType;
        }
        if (WebViewSupport.isBlank(mimeType)) mimeType = "application/octet-stream";
        return new FileMeta(safeFileName(name, mimeType, index), mimeType.toLowerCase(Locale.ROOT), size);
    }

    static String safeFileName(String raw, String mimeType, int index) {
        String name = raw == null ? "" : UNSAFE_NAME_CHARS.matcher(raw).replaceAll("_").trim();
        while (name.startsWith(".")) name = name.substring(1);
        if (name.isEmpty()) {
            String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
            name = "shared-" + (index + 1) + (WebViewSupport.isBlank(extension) ? "" : "." + extension);
        }
        if (name.length() <= MAX_NAME_CHARS) return name;
        int dot = name.lastIndexOf('.');
        String extension = dot > 0 && name.length() - dot <= 16 ? name.substring(dot) : "";
        return name.substring(0, MAX_NAME_CHARS - extension.length()) + extension;
    }

    /** 复制并强制剩余额度；超出额度返回 -2，读取失败返回 -1，调用方丢弃半截文件。 */
    private static long copy(ContentResolver resolver, Uri uri, File target, long remainingBytes) {
        try (InputStream input = resolver.openInputStream(uri);
             OutputStream output = new FileOutputStream(target)) {
            if (input == null) return -1L;
            byte[] buffer = new byte[64 * 1024];
            long copied = 0L;
            int read;
            while ((read = input.read(buffer)) != -1) {
                copied += read;
                if (copied > remainingBytes) return -2L;
                output.write(buffer, 0, read);
            }
            return copied;
        } catch (IOException | RuntimeException error) {
            return -1L;
        }
    }

    private static JSONObject findFile(JSONObject manifest, int index) {
        JSONArray files = manifest.optJSONArray("files");
        if (files == null) return null;
        for (int position = 0; position < files.length(); position += 1) {
            JSONObject entry = files.optJSONObject(position);
            if (entry != null && entry.optInt("index", -1) == index) return entry;
        }
        return null;
    }

    private static File currentShareDir(Context context) {
        File[] children = rootDir(context).listFiles();
        if (children == null) return null;
        File latest = null;
        for (File child : children) {
            if (!child.isDirectory() || !SHARE_ID.matcher(child.getName()).matches()) continue;
            if (!new File(child, MANIFEST).isFile()) continue;
            if (latest == null || child.lastModified() > latest.lastModified()) latest = child;
        }
        return latest;
    }

    private static JSONObject readManifest(File dir) {
        File file = new File(dir, MANIFEST);
        if (!file.isFile()) return null;
        try (InputStream input = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) Math.min(file.length(), 512L * 1024L)];
            int offset = 0;
            int read;
            while (offset < bytes.length && (read = input.read(bytes, offset, bytes.length - offset)) != -1) {
                offset += read;
            }
            return new JSONObject(new String(bytes, 0, offset, StandardCharsets.UTF_8));
        } catch (IOException | JSONException error) {
            return null;
        }
    }

    /** 先写临时文件再改名，进程中途被杀也不会留下半截清单被当成可用分享。 */
    private static void writeManifest(File dir, JSONObject manifest) throws IOException {
        File temp = new File(dir, MANIFEST + ".tmp");
        try (OutputStream output = new FileOutputStream(temp)) {
            output.write(manifest.toString().getBytes(StandardCharsets.UTF_8));
            output.flush();
        }
        if (!temp.renameTo(new File(dir, MANIFEST))) {
            // noinspection ResultOfMethodCallIgnored
            temp.delete();
            throw new IOException("manifest rename failed");
        }
    }

    private static File rootDir(Context context) {
        return new File(context.getCacheDir(), ROOT_DIR);
    }

    private static void deleteDir(File dir) {
        synchronized (LOCK) {
            deleteRecursively(dir);
        }
    }

    private static void deleteChildren(File dir) {
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File child : children) deleteRecursively(child);
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursively(child);
        }
        // noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    private static WebResourceResponse notFound() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse(
            "text/plain",
            "utf-8",
            404,
            "Not Found",
            headers,
            new ByteArrayInputStream(new byte[0])
        );
    }

    private static String randomId() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        StringBuilder builder = new StringBuilder(32);
        for (byte value : bytes) builder.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return builder.toString();
    }

    private static String clip(String value, int maxChars) {
        if (value == null) return "";
        return value.length() <= maxChars ? value : value.substring(0, maxChars);
    }

    private static String textOf(CharSequence value) {
        return value == null ? "" : value.toString();
    }

    private static final class Incoming {
        final String text;
        final String subject;
        final List<Uri> uris;
        final String mimeType;

        Incoming(String text, String subject, List<Uri> uris, String mimeType) {
            this.text = text == null ? "" : text;
            this.subject = subject == null ? "" : subject;
            this.uris = uris;
            this.mimeType = mimeType;
        }

        boolean isEmpty() {
            return text.trim().isEmpty() && subject.isEmpty() && uris.isEmpty();
        }
    }

    private static final class FileMeta {
        final String name;
        final String mimeType;
        final long size;

        FileMeta(String name, String mimeType, long size) {
            this.name = name;
            this.mimeType = mimeType;
            this.size = size;
        }
    }
}
