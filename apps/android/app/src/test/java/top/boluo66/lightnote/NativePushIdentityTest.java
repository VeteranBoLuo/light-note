package top.boluo66.lightnote;

import static org.junit.Assert.*;
import org.junit.Test;

public class NativePushIdentityTest {
    @Test public void stableAcrossReinstallsButScopedToAccountAndApplication() {
        String first = NativePushIdentity.key("abcdef0123456789", "install-a", "alice", "app.release", "123");
        assertEquals(first, NativePushIdentity.key("ABCDEF0123456789", "install-b", "alice", "app.release", "123"));
        assertNotEquals(first, NativePushIdentity.key("abcdef0123456789", "install-b", "bob", "app.release", "123"));
        assertNotEquals(first, NativePushIdentity.key("abcdef0123456789", "install-b", "alice", "app.preview", "123"));
        assertNotEquals(first, NativePushIdentity.key("abcdef0123456788", "install-b", "alice", "app.release", "123"));
        assertEquals(64, first.length());
    }
    @Test public void invalidPlatformIdsUseIndependentInstallationKeys() {
        for (String value : new String[] {null, "", "0000000000000000", "9774d56d682e549c", "ffffffffffffffff", "bad"}) {
            assertFalse(NativePushIdentity.usablePlatformId(value));
            assertNotEquals(NativePushIdentity.key(value, "a", "alice", "app", "1"), NativePushIdentity.key(value, "b", "alice", "app", "1"));
        }
    }
}
