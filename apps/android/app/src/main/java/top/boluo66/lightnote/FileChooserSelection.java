package top.boluo66.lightnote;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntFunction;

/** 在向 WebView 投递 URI 之前检查数量，超量时不读取任一条目，也不静默截断。 */
final class FileChooserSelection {
    static final int MAX_FILES = 100;

    static <T> List<T> collect(int count, IntFunction<T> readItem) {
        if (count < 0 || count > MAX_FILES) return null;
        List<T> result = new ArrayList<>(count);
        for (int index = 0; index < count; index++) result.add(readItem.apply(index));
        return result;
    }
}
