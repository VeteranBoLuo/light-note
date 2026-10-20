package top.boluo66.lightnote;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class NativePushSupportTest {
    @Test public void availableRuntimeDoesNotRequireNotificationPermissionOrNetwork() {
        assertEquals("supported", NativePushSupport.resolve(false, 0));
    }
    @Test public void absentInvalidOrUnsupportedServiceIsExplicitlyUnsupported() {
        for (int code : new int[]{1, 9, 21, 1000})
            assertEquals("unsupported", NativePushSupport.resolve(false, code));
    }
    @Test public void updatesDisabledServicesAndTransientErrorsRemainRetryable() {
        for (int code : new int[]{2, 3, 8, 10, 14, 9000, 9004, -1, 99999})
            assertEquals("unknown", NativePushSupport.resolve(false, code));
        assertEquals("unknown", NativePushSupport.resolve(false, null));
    }
    @Test public void actualRegistrationOverridesMisleadingCompatibilityDiagnostics() {
        for (Integer code : new Integer[]{0, 1, 9, 21, 1000, 9000, null})
            assertEquals("supported", NativePushSupport.resolve(true, code));
    }
}
