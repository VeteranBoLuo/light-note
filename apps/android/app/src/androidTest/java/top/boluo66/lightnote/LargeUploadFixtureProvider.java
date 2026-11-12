package top.boluo66.lightnote;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.RandomAccessFile;

/** 测试 APK 专用：真实稀疏大文件，验证 WebView 不把整个原件复制到内存/缓存后才返回。 */
public final class LargeUploadFixtureProvider extends ContentProvider {
    static final long SIZE = 8L * 1024 * 1024 * 1024 + 123;
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return "application/octet-stream"; }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        MatrixCursor result = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        result.addRow(new Object[]{"large-sparse-test.bin", SIZE}); return result;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = new File(getContext().getCacheDir(), "large-upload-sparse-test.bin");
        try (RandomAccessFile out = new RandomAccessFile(file, "rw")) {
            // 读取不能更改 mtime，否则 Chromium 会把快照判为已变化并抛 NotReadableError。
            if (out.length() != SIZE) { out.setLength(SIZE); out.seek(SIZE / 2); out.write(73); }
        } catch (Exception error) { throw new FileNotFoundException("Fixture setup failed"); }
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Uri insert(Uri uri, ContentValues v) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String s, String[] a) {
        return new File(getContext().getCacheDir(), "large-upload-sparse-test.bin").delete() ? 1 : 0;
    }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
}
