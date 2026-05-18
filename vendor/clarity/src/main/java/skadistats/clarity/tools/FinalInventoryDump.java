package skadistats.clarity.tools;

import skadistats.clarity.event.Insert;
import skadistats.clarity.model.Entity;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.MappedFileSource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@UsesEntities
public class FinalInventoryDump {
    private static final int EMPTY_HANDLE = 16777215;

    @Insert
    private Entities entities;

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("usage: FinalInventoryDump <demo-file> <output-json>");
            System.exit(2);
        }
        var dump = new FinalInventoryDump();
        try (var source = new MappedFileSource(args[0])) {
            new SimpleRunner(source).runWith(dump);
        }
        dump.writeJson(Path.of(args[1]));
    }

    void writeJson(Path outputPath) throws Exception {
        Files.createDirectories(outputPath.getParent());
        Files.writeString(outputPath, toJson() + "\n");
    }

    private String toJson() {
        var itemByHandle = itemEntitiesByHandle();
        var heroes = new ArrayList<Map<String, Object>>();
        var iter = entities.getAllByPredicate(this::isPlayerHero);
        while (iter.hasNext()) {
            var hero = iter.next();
            var row = new LinkedHashMap<String, Object>();
            row.put("hero", heroName(hero));
            row.put("playerId", safeGet(hero, "m_iPlayerID"));
            row.put("main", slots(hero, itemByHandle, 0, 6));
            row.put("backpack", slots(hero, itemByHandle, 6, 3));
            row.put("tp", slots(hero, itemByHandle, 15, 1));
            row.put("neutral", slots(hero, itemByHandle, 16, 1));
            row.put("enhancement", slots(hero, itemByHandle, 17, 1));
            heroes.add(row);
        }
        heroes.sort(Comparator.comparing(row -> String.valueOf(row.get("hero"))));
        return jsonValue(heroes);
    }

    private boolean isPlayerHero(Entity e) {
        var name = e.getDtClass().getDtName();
        return name.startsWith("CDOTA_Unit_Hero_")
                && !name.contains("_Hawk")
                && !name.contains("_Boar")
                && !name.contains("_SpiritBear")
                && e.hasProperty("m_iPlayerID");
    }

    private Map<Integer, Entity> itemEntitiesByHandle() {
        var result = new HashMap<Integer, Entity>();
        var iter = entities.getAllByPredicate(e -> e.getDtClass().getDtName().startsWith("CDOTA_Item_"));
        while (iter.hasNext()) {
            var item = iter.next();
            result.put(item.getHandle(), item);
        }
        return result;
    }

    private List<Map<String, Object>> slots(Entity hero, Map<Integer, Entity> itemByHandle, int start, int count) {
        var result = new ArrayList<Map<String, Object>>();
        for (int slot = start; slot < start + count; slot++) {
            var value = safeGet(hero, "m_hItems." + String.format("%04d", slot));
            var handle = value instanceof Number n ? n.intValue() : EMPTY_HANDLE;
            result.add(itemForSlot(slot, handle, itemByHandle.get(handle)));
        }
        return result;
    }

    private Map<String, Object> itemForSlot(int slot, int handle, Entity item) {
        var row = new LinkedHashMap<String, Object>();
        row.put("slot", slot);
        row.put("handle", handle == EMPTY_HANDLE ? null : handle);
        if (item == null || handle == EMPTY_HANDLE) {
            row.put("key", null);
            row.put("name", null);
            return row;
        }
        var key = itemKey(item.getDtClass().getDtName());
        row.put("key", key);
        row.put("name", displayName(key));
        row.put("className", item.getDtClass().getDtName());
        return row;
    }

    private Object safeGet(Entity entity, String property) {
        try {
            return entity.hasProperty(property) ? entity.getProperty(property) : null;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private String heroName(Entity hero) {
        return "npc_dota_hero_" + camelToSnake(hero.getDtClass().getDtName().replace("CDOTA_Unit_Hero_", ""));
    }

    private String itemKey(String dtName) {
        var raw = dtName.replace("CDOTA_Item_", "");
        var snake = camelToSnake(raw);
        var aliases = Map.ofEntries(
                Map.entry("manta_style", "manta"),
                Map.entry("boots_of_speed", "boots"),
                Map.entry("power_treads", "power_treads"),
                Map.entry("arcane_boots", "arcane_boots"),
                Map.entry("phase_boots", "phase_boots"),
                Map.entry("tranquil_boots", "tranquil_boots"),
                Map.entry("black_king_bar", "black_king_bar"),
                Map.entry("ultimate_scepter", "ultimate_scepter"),
                Map.entry("greater_critical", "greater_crit"),
                Map.entry("lesser_critical", "lesser_crit"),
                Map.entry("dustof_appearance", "dust"),
                Map.entry("ward_dispenser", "ward_dispenser"),
                Map.entry("ward_observer", "ward_observer"),
                Map.entry("ward_sentry", "ward_sentry"),
                Map.entry("teleport_scroll", "tpscroll"),
                Map.entry("aghanims_shard", "aghanims_shard"),
                Map.entry("gunpowder_gauntlets", "gunpowder_gauntlets"),
                Map.entry("enhancement_alert", "enhancement_alert"),
                Map.entry("enhancement_greedy", "enhancement_greedy"),
                Map.entry("enhancement_keen_eyed", "enhancement_keen_eyed")
        );
        return aliases.getOrDefault(snake, snake);
    }

    private String camelToSnake(String value) {
        return value
                .replaceAll("([a-z0-9])([A-Z])", "$1_$2")
                .replaceAll("__+", "_")
                .toLowerCase();
    }

    private String displayName(String key) {
        if (key == null) return null;
        return switch (key) {
            case "tpscroll" -> "TP Scroll";
            case "black_king_bar" -> "Black King Bar";
            case "ultimate_scepter" -> "Aghanim's Scepter";
            case "aghanims_shard" -> "Aghanim's Shard";
            case "greater_crit" -> "Daedalus";
            case "lesser_crit" -> "Crystalys";
            default -> {
                var words = key.split("_");
                var out = new StringBuilder();
                for (var word : words) {
                    if (!out.isEmpty()) out.append(' ');
                    out.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
                }
                yield out.toString();
            }
        };
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
        if (value instanceof Iterable<?> iterable) {
            var out = new StringBuilder("[");
            var first = true;
            for (var item : iterable) {
                if (!first) out.append(',');
                first = false;
                out.append(jsonValue(item));
            }
            return out.append(']').toString();
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
}
