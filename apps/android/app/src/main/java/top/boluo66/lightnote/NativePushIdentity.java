package top.boluo66.lightnote;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/** Account- and application-scoped push identity. Never returns the platform identifier. */
final class NativePushIdentity {
    private NativePushIdentity() {}
    static boolean usablePlatformId(String value) {
        if (value == null || !value.matches("[a-fA-F0-9]{16}")) return false;
        String normalized = value.toLowerCase(Locale.ROOT);
        return !normalized.equals("0000000000000000") && !normalized.equals("ffffffffffffffff")
            && !normalized.equals("9774d56d682e549c");
    }
    static String digest(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(64);
            for (byte item : bytes) result.append(String.format(Locale.ROOT, "%02x", item & 0xff));
            return result.toString();
        } catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
    static String key(String platformId, String installationId, String owner, String packageName, String appId) {
        String source = usablePlatformId(platformId) ? platformId.toLowerCase(Locale.ROOT) : installationId;
        return digest("light-note-push-v2\n" + owner + "\n" + packageName + "\n" + appId + "\n" + source);
    }
}
