package skadistats.clarity.tools;

import skadistats.clarity.event.Insert;
import skadistats.clarity.model.Entity;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.MappedFileSource;

@UsesEntities
public class EntityProbe {
    @Insert
    private Entities entities;

    public static void main(String[] args) throws Exception {
        var probe = new EntityProbe();
        try (var source = new MappedFileSource(args[0])) {
            new SimpleRunner(source).runWith(probe);
        }
        probe.dump();
    }

    private void dump() {
        var iter = entities.getAllByPredicate(e -> e.getDtClass().getDtName().contains("Hero"));
        while (iter.hasNext()) {
            Entity e = iter.next();
            var text = e.toString();
            if (!text.contains("m_iPlayerID") && !text.contains("m_hItems") && !text.contains("m_Inventory")) {
                continue;
            }
            System.out.println("===== " + e.getDtClass().getDtName() + " idx=" + e.getIndex() + " =====");
            for (var line : text.split("\\R")) {
                var lower = line.toLowerCase();
                if (lower.contains("item") || lower.contains("inventory") || lower.contains("playerid") || lower.contains("steam") || lower.contains("hero")) {
                    System.out.println(line);
                }
            }
        }
        var iterItems = entities.getAllByPredicate(e -> e.getDtClass().getDtName().contains("Item"));
        int n = 0;
        while (iterItems.hasNext() && n < 200) {
            Entity e = iterItems.next();
            System.out.println("===== ITEM " + e.getDtClass().getDtName() + " idx=" + e.getIndex() + " handle=" + e.getHandle() + " =====");
            for (var line : e.toString().split("\\R")) {
                var lower = line.toLowerCase();
                if (lower.contains("owner") || lower.contains("name") || lower.contains("item") || lower.contains("contained") || lower.contains("player")) {
                    System.out.println(line);
                }
            }
            n++;
        }
    }
}
