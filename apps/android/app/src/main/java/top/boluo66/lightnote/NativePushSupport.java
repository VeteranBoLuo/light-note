package top.boluo66.lightnote;

/** Capability is separate from permission and from a successful server connection. */
final class NativePushSupport {
    static String resolve(boolean registered, Integer hmsAvailability) {
        // A real token is stronger evidence than HMS diagnostics in compatibility runtimes.
        if (registered) return "supported";
        if (hmsAvailability == null) return "unknown";
        switch (hmsAvailability) {
            case 0: return "supported"; // ConnectionResult.SUCCESS
            case 1: // SERVICE_MISSING
            case 9: // SERVICE_INVALID
            case 21: // SERVICE_UNSUPPORTED
            case 1000: return "unsupported"; // API_UNAVAILABLE
            // Updating, disabled, version too old, network and all unrecognized failures are recoverable.
            default: return "unknown";
        }
    }
}
