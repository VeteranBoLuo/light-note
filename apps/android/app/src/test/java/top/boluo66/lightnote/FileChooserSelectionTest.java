package top.boluo66.lightnote;

import org.junit.Test;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class FileChooserSelectionTest {
    @Test public void acceptsExactlyOneHundredAndPreservesOrder() {
        List<Integer> files = FileChooserSelection.collect(100, index -> index);
        assertEquals(100, files.size());
        for (int i = 0; i < 100; i++) assertEquals(Integer.valueOf(i), files.get(i));
    }
    @Test public void rejectsOversizedSelectionsBeforeReadingAnyItem() {
        for (int count : new int[]{101, 3000, 10000}) {
            AtomicInteger reads = new AtomicInteger();
            assertNull(FileChooserSelection.collect(count, index -> { reads.incrementAndGet(); return index; }));
            assertEquals(0, reads.get());
        }
    }
    @Test public void emptyAndSingleSelectionsAreHandledWithoutExtraReads() {
        assertTrue(FileChooserSelection.collect(0, index -> { throw new AssertionError(); }).isEmpty());
        assertEquals("camera", FileChooserSelection.collect(1, index -> "camera").get(0));
    }
}
