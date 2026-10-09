package top.boluo66.lightnote;

import com.huawei.hms.push.HmsMessageService;
import com.huawei.hms.push.RemoteMessage;

public final class HuaweiPushProbeService extends HmsMessageService {
    @Override public void onNewToken(String token) { HuaweiPushProbe.saveToken(this, token); }
    @Override public void onTokenError(Exception error) {
        if (HuaweiPushProbe.allowed(this)) HuaweiPushProbe.status(this, "Token 回调失败：" + HuaweiPushProbe.errorCode(error));
    }
    @Override public void onMessageReceived(RemoteMessage message) {
        if (HuaweiPushProbe.allowed(this)) HuaweiPushProbe.status(this,
            "收到远程数据消息回调；未生成本地通知。请用华为控制台的通知消息验证进程关闭后的展示。");
    }
}
