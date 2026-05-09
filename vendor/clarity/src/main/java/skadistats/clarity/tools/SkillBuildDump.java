package skadistats.clarity.tools;

import skadistats.clarity.event.Insert;
import skadistats.clarity.model.Entity;
import skadistats.clarity.model.FieldPath;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.OnEntityUpdated;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.MappedFileSource;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.HashMap;
import java.util.Map;

@UsesEntities
public class SkillBuildDump implements AutoCloseable {

    @Insert
    private Context ctx;

    @Insert
    private Entities entities;

    private final BufferedWriter out;
    private final Map<Integer, Integer> seenLevels = new HashMap<>();

    public SkillBuildDump(Path outputPath) throws IOException {
        Files.createDirectories(outputPath.getParent());
        out = Files.newBufferedWriter(outputPath);
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("usage: SkillBuildDump <demo-file> <output-jsonl>");
            System.exit(2);
        }

        try (var source = new MappedFileSource(args[0]);
             var dump = new SkillBuildDump(Path.of(args[1]))) {
            new SimpleRunner(source).runWith(dump);
        }
    }

    @OnEntityUpdated(classPattern = "CDOTA_Ability_.*")
    public void onAbilityUpdated(Entity ability, FieldPath[] fps, int n) throws IOException {
        if (!ability.hasProperty("m_iLevel")) {
            return;
        }
        var level = number(safeGet(ability, "m_iLevel"));
        if (level <= 0) {
            return;
        }
        var previous = seenLevels.getOrDefault(ability.getHandle(), 0);
        if (level <= previous) {
            return;
        }

        var owner = ownerHeroForAbility(ability.getHandle());
        if (owner == null || !owner.getDtClass().getDtName().startsWith("CDOTA_Unit_Hero_")) {
            return;
        }
        seenLevels.put(ability.getHandle(), level);

        var row = new LinkedHashMap<String, Object>();
        row.put("tick", ctx == null ? -1 : ctx.getTick());
        row.put("hero", heroName(owner));
        row.put("playerId", safeGet(owner, "m_iPlayerID"));
        row.put("ability", abilityName(ability));
        row.put("abilityLevel", level);
        row.put("ownerHandle", owner.getHandle());
        row.put("abilityHandle", ability.getHandle());
        row.put("abilityClassName", ability.getDtClass().getDtName());
        writeLine(row);
    }

    private Entity ownerHeroForAbility(int abilityHandle) {
        var iter = entities.getAllByPredicate(e -> e.getDtClass().getDtName().startsWith("CDOTA_Unit_Hero_") && e.hasProperty("m_iPlayerID"));
        while (iter.hasNext()) {
            var hero = iter.next();
            for (int slot = 0; slot < 32; slot++) {
                var value = safeGet(hero, "m_vecAbilities." + String.format("%04d", slot));
                if (number(value) == abilityHandle) {
                    return hero;
                }
            }
        }
        return null;
    }

    private Object safeGet(Entity entity, String property) {
        try {
            return entity.hasProperty(property) ? entity.getProperty(property) : null;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private int number(Object value) {
        return value instanceof Number n ? n.intValue() : 0;
    }

    private String heroName(Entity hero) {
        return "npc_dota_hero_" + camelToSnake(hero.getDtClass().getDtName().replace("CDOTA_Unit_Hero_", ""));
    }

    private String abilityName(Entity ability) {
        var raw = ability.getDtClass().getDtName().replace("CDOTA_Ability_", "");
        return camelToSnake(raw);
    }

    private String camelToSnake(String value) {
        return value
                .replaceAll("([a-z0-9])([A-Z])", "$1_$2")
                .replaceAll("__+", "_")
                .toLowerCase();
    }

    private void writeLine(Map<String, Object> values) throws IOException {
        out.write(jsonValue(values));
        out.write("\n");
    }

    private static String jsonValue(Object value) {
        if (value == null) return "null";
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        if (value instanceof Map<?, ?> map) {
            var out = new StringBuilder("{");
            var first = true;
            for (var entry : map.entrySet()) {
                if (!first) out.append(',');
                first = false;
                out.append(json(String.valueOf(entry.getKey()))).append(':').append(jsonValue(entry.getValue()));
            }
            return out.append('}').toString();
        }
        return json(value.toString());
    }

    private static String json(String value) {
        var out = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            var c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> out.append(c);
            }
        }
        return out.append('"').toString();
    }

    @Override
    public void close() throws IOException {
        out.close();
    }
}
