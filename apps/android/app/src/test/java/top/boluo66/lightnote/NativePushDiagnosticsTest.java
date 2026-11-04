package top.boluo66.lightnote;

import static org.junit.Assert.*;
import java.io.IOException;
import java.security.NoSuchAlgorithmException;
import org.junit.Test;

public class NativePushDiagnosticsTest {
    @Test public void preservesTheOriginalFailureStageAcrossBridgeWrapping() {
        NativePushDiagnostics.Failure failure = NativePushDiagnostics.failure(
            NativePushDiagnostics.Stage.INSTALLATION_WRITE, new IOException("PUSH_STORAGE_FAILED"));
        assertEquals("LNP1-I4-STORE", failure.code);
        assertSame(failure, NativePushDiagnostics.failure(NativePushDiagnostics.Stage.BIND, failure));
        assertEquals(NativePushDiagnostics.Stage.INSTALLATION_WRITE, failure.stage);
    }

    @Test public void exposesOnlyAllowlistedReasonsAndNeverExceptionContents() {
        Exception[] errors = {
            new ClassCastException("private account and token"),
            new NullPointerException("private argument details"),
            new SecurityException("private path"),
            new IOException("private path and token"),
            new IOException("PUSH_STORAGE_FAILED private token"),
            new IllegalArgumentException("private provider response"),
            new IllegalStateException("private state"),
            new IllegalStateException(new NoSuchAlgorithmException("private crypto details")),
            new Exception("private account and token"),
        };
        String[] reasons = {"TYPE", "NULL", "PERM", "IO", "IO", "ARG", "STATE", "CRYPTO", "OTHER"};
        for (int i = 0; i < errors.length; i++) {
            NativePushDiagnostics.Failure failure = NativePushDiagnostics.failure(
                NativePushDiagnostics.Stage.INSTALLATION_READ, errors[i]);
            assertEquals("LNP1-I1-" + reasons[i], failure.code);
            assertEquals(failure.code, failure.getMessage());
            assertFalse(failure.code.contains("private"));
        }
        assertEquals("LNP1-I2-REV", NativePushDiagnostics.failure(
            NativePushDiagnostics.Stage.REVISION, new IOException("PUSH_REVISION_INVALID")).code);
        assertEquals("LNP1-P0-CONSENT", NativePushDiagnostics.failure(
            NativePushDiagnostics.Stage.PRIVACY, new IOException("PUSH_CONSENT_REQUIRED")).code);
        assertEquals("LNP1-R2-RECEIPT", NativePushDiagnostics.failure(
            NativePushDiagnostics.Stage.RECEIPT_SAVE, new IOException("PUSH_BINDING_INVALID")).code);
        assertEquals("LNP1-I3-APPID", NativePushDiagnostics.failure(
            NativePushDiagnostics.Stage.IDENTITY, new IOException("PUSH_APP_ID_UNAVAILABLE")).code);
    }

    @Test public void unknownBridgeActionsCannotBecomeDiagnosticText() {
        assertEquals(NativePushDiagnostics.Stage.RECEIPT_READ, NativePushDiagnostics.stageForAction("receiptRead"));
        assertEquals(NativePushDiagnostics.Stage.RECEIPT_SAVE, NativePushDiagnostics.stageForAction("receiptSave"));
        assertEquals(NativePushDiagnostics.Stage.BRIDGE, NativePushDiagnostics.stageForAction("private token"));
        assertEquals(NativePushDiagnostics.Stage.BRIDGE, NativePushDiagnostics.stageForAction(null));
    }
}
