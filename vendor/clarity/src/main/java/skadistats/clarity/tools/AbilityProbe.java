package skadistats.clarity.tools;

import skadistats.clarity.event.Insert;
import skadistats.clarity.model.Entity;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.MappedFileSource;

@UsesEntities
public class AbilityProbe {
    @Insert
    private Entities entities;

    public static void main(String[] args) throws Exception {
        var probe = new AbilityProbe();
        try (var source = new MappedFileSource(args[0])) {
            new SimpleRunner(source).runWith(probe);
        }
        probe.dump();
    }

    private void dump() {
        var heroes = entities.getAllByPredicate(e -> e.getDtClass().getDtName().startsWith("CDOTA_Unit_Hero_") && e.hasProperty("m_iPlayerID"));
        int hn = 0;
        while (heroes.hasNext() && hn < 3) {
            Entity e = heroes.next();
            System.out.println("===== HERO " + e.getDtClass().getDtName() + " idx=" + e.getIndex() + " handle=" + e.getHandle() + " =====");
            for (var line : e.toString().split("\\R")) {
                var lower = line.toLowerCase();
                if (lower.contains("abil") || lower.contains("playerid") || lower.contains("hero")) {
                    System.out.println(line);
                }
            }
            hn++;
        }
        var iter = entities.getAllByPredicate(e -> e.getDtClass().getDtName().contains("Ability"));
        int n = 0;
        while (iter.hasNext() && n < 80) {
            Entity e = iter.next();
            System.out.println("===== " + e.getDtClass().getDtName() + " idx=" + e.getIndex() + " handle=" + e.getHandle() + " =====");
            for (var line : e.toString().split("\\R")) {
                var lower = line.toLowerCase();
                if (lower.contains("level") || lower.contains("owner") || lower.contains("ability") || lower.contains("name")) {
                    System.out.println(line);
                }
            }
            n++;
        }
    }
}
