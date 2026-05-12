package skadistats.clarity.tools;

import com.google.protobuf.GeneratedMessage;
import skadistats.clarity.Clarity;
import skadistats.clarity.event.Insert;
import skadistats.clarity.io.Util;
import skadistats.clarity.model.CombatLogEntry;
import skadistats.clarity.model.EngineId;
import skadistats.clarity.model.Entity;
import skadistats.clarity.model.GameEvent;
import skadistats.clarity.processor.entities.Entities;
import skadistats.clarity.processor.entities.UsesEntities;
import skadistats.clarity.processor.gameevents.OnCombatLogEntry;
import skadistats.clarity.processor.gameevents.OnGameEvent;
import skadistats.clarity.processor.reader.OnMessage;
import skadistats.clarity.processor.runner.Context;
import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.MappedFileSource;
import skadistats.clarity.wire.shared.demo.proto.Demo;
import skadistats.clarity.wire.shared.s2.proto.S2UserMessages;

import java.io.BufferedWriter;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

@UsesEntities
public class FullDemoDump implements AutoCloseable {

    @Insert
    private Context ctx;

    @Insert
    private Entities entities;

    private final BufferedWriter combatLog;
    private final BufferedWriter gameEvents;
    private final BufferedWriter chat;
    private final BufferedWriter userMessages;
    private final Map<String, Long> messageCounts = new TreeMap<>();
    private long combatLogCount;
    private long gameEventCount;
    private long chatCount;
    private long interestingUserMessageCount;

    public FullDemoDump(Path outputDir) throws IOException {
        Files.createDirectories(outputDir);
        combatLog = Files.newBufferedWriter(outputDir.resolve("combat_log.jsonl"));
        gameEvents = Files.newBufferedWriter(outputDir.resolve("game_events.jsonl"));
        chat = Files.newBufferedWriter(outputDir.resolve("chat.jsonl"));
        userMessages = Files.newBufferedWriter(outputDir.resolve("user_messages_interesting.jsonl"));
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("usage: FullDemoDump <demo-file> <output-dir>");
            System.exit(2);
        }

        var demoPath = args[0];
        var outputDir = Path.of(args[1]);
        Files.createDirectories(outputDir);
        writeSummary(demoPath, outputDir.resolve("summary.json"));

        long started = System.currentTimeMillis();
        try (var source = new MappedFileSource(demoPath);
             var dump = new FullDemoDump(outputDir)) {
            new SimpleRunner(source).runWith(dump);
            dump.writeScoreboard(outputDir.resolve("scoreboard.json"));
            dump.writeMessageCounts(outputDir.resolve("message_counts.json"));
            dump.writeReport(outputDir.resolve("run_report.json"), System.currentTimeMillis() - started);
        }
    }

    @OnMessage
    public void onAnyMessage(GeneratedMessage message) {
        messageCounts.merge(message.getClass().getName(), 1L, Long::sum);
        if (isInterestingUserMessage(message)) {
            var values = new LinkedHashMap<String, Object>();
            values.put("tick", tick());
            values.put("type", message.getClass().getName());
            values.put("shortType", message.getClass().getSimpleName());
            values.put("raw", message.toString());
            try {
                writeLine(userMessages, values);
                interestingUserMessageCount++;
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }
    }

    @OnMessage(S2UserMessages.CUserMessageSayText2.class)
    public void onChat(S2UserMessages.CUserMessageSayText2 message) throws IOException {
        var values = new LinkedHashMap<String, Object>();
        values.put("tick", tick());
        values.put("sender", message.hasParam1() ? message.getParam1() : null);
        values.put("text", message.hasParam2() ? message.getParam2() : null);
        values.put("raw", message.toString());
        writeLine(chat, values);
        chatCount++;
    }

    @OnCombatLogEntry
    public void onCombatLogEntry(CombatLogEntry entry) throws IOException {
        var values = new LinkedHashMap<String, Object>();
        values.put("tick", tick());
        values.put("type", entry.hasType() ? entry.getType().name() : null);
        values.putAll(combatLogProperties(entry));
        writeLine(combatLog, values);
        combatLogCount++;
    }

    @OnGameEvent
    public void onGameEvent(GameEvent event) throws IOException {
        var values = new LinkedHashMap<String, Object>();
        values.put("tick", tick());
        values.put("name", event.getName());
        values.put("eventId", event.getEventId());
        values.put("properties", gameEventProperties(event));
        values.put("raw", event.toString());
        writeLine(gameEvents, values);
        gameEventCount++;
    }

    private int tick() {
        return ctx == null ? -1 : ctx.getTick();
    }

    private Map<String, Object> combatLogProperties(CombatLogEntry entry) {
        var values = new TreeMap<String, Object>();
        for (var method : CombatLogEntry.class.getMethods()) {
            if (!method.getName().startsWith("has") || method.getParameterCount() != 0 || method.getReturnType() != boolean.class) {
                continue;
            }
            try {
                if (!Boolean.TRUE.equals(method.invoke(entry))) {
                    continue;
                }
                var property = method.getName().substring(3);
                var getter = findCombatLogGetter(property);
                if (getter != null) {
                    var key = Character.toLowerCase(property.charAt(0)) + property.substring(1);
                    var value = getter.invoke(entry);
                    values.put(key, value instanceof Enum<?> e ? e.name() : value);
                }
            } catch (ReflectiveOperationException ignored) {
                // Keep dumping even if Clarity adds a property with a non-standard accessor.
            }
        }
        if (entry.getValueName() != null) {
            values.put("valueName", entry.getValueName());
        }
        return values;
    }

    private Method findCombatLogGetter(String property) {
        for (var prefix : new String[]{"get", "is"}) {
            try {
                return CombatLogEntry.class.getMethod(prefix + property);
            } catch (NoSuchMethodException ignored) {
            }
        }
        return null;
    }

    private Map<String, Object> gameEventProperties(GameEvent event) {
        var values = new LinkedHashMap<String, Object>();
        try {
            Field descriptorField = GameEvent.class.getDeclaredField("descriptor");
            descriptorField.setAccessible(true);
            var descriptor = (skadistats.clarity.model.GameEventDescriptor) descriptorField.get(event);
            var keys = descriptor.getKeys();
            for (int i = 0; i < keys.length; i++) {
                values.put(keys[i], event.getProperty(i));
            }
        } catch (ReflectiveOperationException ignored) {
            values.put("text", event.toString());
        }
        return values;
    }

    private void writeScoreboard(Path path) throws IOException {
        try (var out = Files.newBufferedWriter(path)) {
            out.write("[\n");
            boolean first = true;
            boolean source1 = ctx.getEngineType().getId() == EngineId.DOTA_S1;
            boolean earlyBeta = !source1 && entity("PlayerResource").getDtClass().getFieldPathForName("m_vecPlayerData") == null;
            for (int idx = 0; idx < 256; idx++) {
                Map<String, Object> row = source1 || earlyBeta ? scoreboardRowLegacy(idx, source1) : scoreboardRowS2(idx);
                if (row == null) {
                    continue;
                }
                if (!first) {
                    out.write(",\n");
                }
                out.write("  " + jsonObject(row));
                first = false;
            }
            out.write("\n]\n");
        }
    }

    private Map<String, Object> scoreboardRowS2(int idx) {
        try {
            int team = value("PlayerResource", "m_vecPlayerData.%i.m_iPlayerTeam", idx, 0, 0);
            if (team != 2 && team != 3) {
                return null;
            }
            int fallbackPos = countPriorPlayersOnTeam(idx, team);
            int teamDataPos = teamDataPositionForPlayer(idx, team, fallbackPos);
            var row = new LinkedHashMap<String, Object>();
            row.put("index", idx);
            row.put("team", team);
            row.put("teamName", teamName(team));
            row.put("name", value("PlayerResource", "m_vecPlayerData.%i.m_iszPlayerName", idx, team, teamDataPos));
            row.put("level", value("PlayerResource", "m_vecPlayerTeamData.%i.m_iLevel", idx, team, teamDataPos));
            row.put("kills", value("PlayerResource", "m_vecPlayerTeamData.%i.m_iKills", idx, team, teamDataPos));
            row.put("deaths", value("PlayerResource", "m_vecPlayerTeamData.%i.m_iDeaths", idx, team, teamDataPos));
            row.put("assists", value("PlayerResource", "m_vecPlayerTeamData.%i.m_iAssists", idx, team, teamDataPos));
            row.put("gold", value("Data%n", "m_vecDataTeam.%p.m_iTotalEarnedGold", idx, team, teamDataPos));
            row.put("reliableGold", value("Data%n", "m_vecDataTeam.%p.m_iReliableGold", idx, team, teamDataPos));
            row.put("unreliableGold", value("Data%n", "m_vecDataTeam.%p.m_iUnreliableGold", idx, team, teamDataPos));
            row.put("netWorth", value("Data%n", "m_vecDataTeam.%p.m_iNetWorth", idx, team, teamDataPos));
            row.put("dataPlayerId", value("Data%n", "m_vecDataTeam.%p.m_nPlayerID", idx, team, teamDataPos));
            row.put("lastHits", value("Data%n", "m_vecDataTeam.%p.m_iLastHitCount", idx, team, teamDataPos));
            row.put("denies", value("Data%n", "m_vecDataTeam.%p.m_iDenyCount", idx, team, teamDataPos));
            return row;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private int teamDataPositionForPlayer(int idx, int team, int fallbackPos) {
        Object steamId = value("PlayerResource", "m_vecPlayerData.%i.m_iPlayerSteamID", idx, team, fallbackPos);
        if (!(steamId instanceof Number playerSteamId)) {
            return fallbackPos;
        }

        for (int pos = 0; pos < 24; pos++) {
            try {
                Object rowSteamId = value("Data%n", "m_vecDataTeam.%p.m_iPlayerSteamID", idx, team, pos);
                if (rowSteamId instanceof Number n && n.longValue() == playerSteamId.longValue()) {
                    return pos;
                }
            } catch (RuntimeException ignored) {
            }
        }

        return fallbackPos;
    }

    private int countPriorPlayersOnTeam(int idx, int team) {
        int pos = 0;
        for (int prior = 0; prior < idx; prior++) {
            try {
                int priorTeam = value("PlayerResource", "m_vecPlayerData.%i.m_iPlayerTeam", prior, 0, 0);
                if (priorTeam == team) {
                    pos++;
                }
            } catch (RuntimeException ignored) {
            }
        }
        return pos;
    }

    private Map<String, Object> scoreboardRowLegacy(int idx, boolean source1) {
        try {
            int team = value("PlayerResource", "m_iPlayerTeams.%i", idx, 0, 0);
            if (team != 2 && team != 3) {
                return null;
            }
            var row = new LinkedHashMap<String, Object>();
            row.put("index", idx);
            row.put("team", team);
            row.put("teamName", teamName(team));
            row.put("name", value("PlayerResource", "m_iszPlayerNames.%i", idx, team, 0));
            row.put("level", value("PlayerResource", "m_iLevel.%i", idx, team, 0));
            row.put("kills", value("PlayerResource", "m_iKills.%i", idx, team, 0));
            row.put("deaths", value("PlayerResource", "m_iDeaths.%i", idx, team, 0));
            row.put("assists", value("PlayerResource", "m_iAssists.%i", idx, team, 0));
            row.put("gold", value("PlayerResource", (source1 ? "EndScoreAndSpectatorStats." : "") + "m_iTotalEarnedGold.%i", idx, team, 0));
            row.put("lastHits", value("PlayerResource", "m_iLastHitCount.%i", idx, team, 0));
            row.put("denies", value("PlayerResource", "m_iDenyCount.%i", idx, team, 0));
            return row;
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private <V> V value(String entityName, String pattern, int index, int team, int pos) {
        String fieldPathString = pattern
                .replaceAll("%i", Util.arrayIdxToString(index))
                .replaceAll("%t", Util.arrayIdxToString(team))
                .replaceAll("%p", Util.arrayIdxToString(pos));
        var entity = entity(entityName.replaceAll("%n", teamName(team)));
        var fieldPath = entity.getDtClass().getFieldPathForName(fieldPathString);
        return (V) entity.getPropertyForFieldPath(fieldPath);
    }

    private Entity entity(String entityName) {
        return entities.getByDtName(switch (ctx.getEngineType().getId()) {
            case DOTA_S1 -> "DT_DOTA_" + entityName;
            case DOTA_S2 -> "CDOTA_" + entityName;
            default -> throw new IllegalStateException("not a Dota demo");
        });
    }

    private String teamName(int team) {
        return switch (team) {
            case 2 -> "Radiant";
            case 3 -> "Dire";
            default -> "";
        };
    }

    private void writeMessageCounts(Path path) throws IOException {
        try (var out = Files.newBufferedWriter(path)) {
            out.write("{\n");
            int index = 0;
            for (var entry : messageCounts.entrySet().stream().sorted(Comparator.comparing(Map.Entry::getKey)).toList()) {
                out.write("  " + json(entry.getKey()) + ": " + entry.getValue());
                out.write(index++ == messageCounts.size() - 1 ? "\n" : ",\n");
            }
            out.write("}\n");
        }
    }

    private void writeReport(Path path, long elapsedMillis) throws IOException {
        var values = new LinkedHashMap<String, Object>();
        values.put("elapsedMillis", elapsedMillis);
        values.put("combatLogEntries", combatLogCount);
        values.put("gameEvents", gameEventCount);
        values.put("chatMessages", chatCount);
        values.put("interestingUserMessages", interestingUserMessageCount);
        values.put("messageTypes", messageCounts.size());
        Files.writeString(path, jsonObject(values) + "\n");
    }

    private boolean isInterestingUserMessage(GeneratedMessage message) {
        var name = message.getClass().getName();
        return name.contains("DOTAUserMessages$CDOTAUserMsg_Chat")
                || name.contains("DOTAUserMessages$CDOTAUserMsg_LocationPing")
                || name.contains("DOTAUserMessages$CDOTAUserMsg_MapLine")
                || name.contains("DOTAUserMessages$CDOTAUserMsg_MinimapEvent")
                || name.contains("DOTAUserMessages$CDOTAUserMsg_CourierKilledAlert")
                || name.contains("DOTAUserMessages$CDOTAUserMsg_FoundNeutralItem")
                || name.contains("DOTAUserMessages$CDOTAUserMsg_PlayerDraft")
                || name.contains("DOTAUserMessages$CDOTAUserMsg_SelectPenaltyGold")
                || name.contains("DOTAUserMessages$CDOTAUserMsg_SendRoshanPopup")
                || name.contains("DOTAUserMessages$CDOTAUserMsg_OutpostCaptured")
                || name.contains("DOTAUserMessages$CDOTAUserMsg_HighFiveCompleted")
                || name.contains("DOTAUserMessages$CDOTAUserMsg_ProjectionEvent");
    }

    private static void writeSummary(String demoPath, Path path) throws IOException {
        var header = Clarity.headerForFile(demoPath);
        var info = Clarity.infoForFile(demoPath);
        var values = new LinkedHashMap<String, Object>();
        values.put("demoPath", demoPath);
        values.put("demoFileStamp", header.hasDemoFileStamp() ? header.getDemoFileStamp() : null);
        values.put("serverName", header.hasServerName() ? header.getServerName() : null);
        values.put("clientName", header.hasClientName() ? header.getClientName() : null);
        values.put("mapName", header.hasMapName() ? header.getMapName() : null);
        values.put("gameDirectory", header.hasGameDirectory() ? header.getGameDirectory() : null);
        values.put("networkProtocol", header.hasNetworkProtocol() ? header.getNetworkProtocol() : null);
        values.put("buildNum", header.hasBuildNum() ? header.getBuildNum() : null);
        values.put("serverStartTick", header.hasServerStartTick() ? header.getServerStartTick() : null);
        values.put("playbackTimeSeconds", info.hasPlaybackTime() ? info.getPlaybackTime() : null);
        values.put("playbackTicks", info.hasPlaybackTicks() ? info.getPlaybackTicks() : null);
        values.put("playbackFrames", info.hasPlaybackFrames() ? info.getPlaybackFrames() : null);
        if (info.hasGameInfo() && info.getGameInfo().hasDota()) {
            values.put("dota", dotaSummary(info.getGameInfo().getDota()));
        }
        values.put("rawHeaderText", header.toString());
        values.put("rawInfoText", info.toString());
        Files.writeString(path, jsonObject(values) + "\n");
    }

    private static Map<String, Object> dotaSummary(Demo.CGameInfo.CDotaGameInfo dota) {
        var values = new LinkedHashMap<String, Object>();
        values.put("matchId", dota.hasMatchId() ? dota.getMatchId() : null);
        values.put("gameMode", dota.hasGameMode() ? dota.getGameMode() : null);
        values.put("gameWinner", dota.hasGameWinner() ? dota.getGameWinner() : null);
        values.put("leagueId", dota.hasLeagueid() ? dota.getLeagueid() : null);
        values.put("radiantTeamId", dota.hasRadiantTeamId() ? dota.getRadiantTeamId() : null);
        values.put("radiantTeamTag", dota.hasRadiantTeamTag() ? dota.getRadiantTeamTag() : null);
        values.put("direTeamId", dota.hasDireTeamId() ? dota.getDireTeamId() : null);
        values.put("direTeamTag", dota.hasDireTeamTag() ? dota.getDireTeamTag() : null);
        values.put("endTime", dota.hasEndTime() ? dota.getEndTime() : null);
        values.put("endTimeIso", dota.hasEndTime() ? Instant.ofEpochSecond(dota.getEndTime()).toString() : null);
        var players = new java.util.ArrayList<Map<String, Object>>();
        for (var player : dota.getPlayerInfoList()) {
            var p = new LinkedHashMap<String, Object>();
            p.put("name", player.hasPlayerName() ? player.getPlayerName() : null);
            p.put("hero", player.hasHeroName() ? player.getHeroName() : null);
            p.put("steamId", player.hasSteamid() ? player.getSteamid() : null);
            p.put("gameTeam", player.hasGameTeam() ? player.getGameTeam() : null);
            p.put("fakeClient", player.hasIsFakeClient() ? player.getIsFakeClient() : null);
            players.add(p);
        }
        values.put("players", players);
        return values;
    }

    private static void writeLine(BufferedWriter writer, Map<String, Object> values) throws IOException {
        writer.write(jsonObject(values));
        writer.newLine();
    }

    private static String jsonObject(Map<String, Object> values) {
        var out = new StringBuilder();
        out.append('{');
        boolean first = true;
        for (var entry : values.entrySet()) {
            if (!first) {
                out.append(',');
            }
            first = false;
            out.append(json(entry.getKey())).append(':').append(jsonValue(entry.getValue()));
        }
        out.append('}');
        return out.toString();
    }

    private static String jsonValue(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof Number || value instanceof Boolean) {
            return value.toString();
        }
        if (value instanceof Map<?, ?> map) {
            var typed = new LinkedHashMap<String, Object>();
            for (var entry : map.entrySet()) {
                typed.put(String.valueOf(entry.getKey()), entry.getValue());
            }
            return jsonObject(typed);
        }
        if (value instanceof Iterable<?> iterable) {
            var out = new StringBuilder("[");
            boolean first = true;
            for (var item : iterable) {
                if (!first) {
                    out.append(',');
                }
                first = false;
                out.append(jsonValue(item));
            }
            out.append(']');
            return out.toString();
        }
        return json(value.toString());
    }

    private static String json(String value) {
        var out = new StringBuilder(value.length() + 16);
        out.append('"');
        for (int i = 0; i < value.length(); i++) {
            var c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        out.append('"');
        return out.toString();
    }

    @Override
    public void close() throws IOException {
        combatLog.close();
        gameEvents.close();
        chat.close();
        userMessages.close();
    }
}
