package top.boluo66.lightnote;

final class LegalDocuments {
    static final String PRIVACY_POLICY_VERSION = "draft-2026-07-28";
    static final String PRIVACY_POLICY_FILE = "privacy-policy.html";
    static final String USER_AGREEMENT_FILE = "user-agreement.html";

    private LegalDocuments() {
    }

    static boolean isAllowedDocument(String fileName) {
        return PRIVACY_POLICY_FILE.equals(fileName)
            || USER_AGREEMENT_FILE.equals(fileName);
    }
}
