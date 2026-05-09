package skadistats.clarity.tools;

import skadistats.clarity.Clarity;
import skadistats.clarity.wire.shared.demo.proto.Demo;

import java.io.IOException;
import java.time.Instant;

public class DemoSummary {

    public static void main(String[] args) throws IOException {
        if (args.length != 1) {
            System.err.println("usage: DemoSummary <demo-file>");
            System.exit(2);
        }

        var demoPath = args[0];
        var header = Clarity.headerForFile(demoPath);
        var info = Clarity.infoForFile(demoPath);

        System.out.println("{");
        field("demoPath", demoPath, true);
        field("demoFileStamp", header.hasDemoFileStamp() ? header.getDemoFileStamp() : null, true);
        field("serverName", header.hasServerName() ? header.getServerName() : null, true);
        field("clientName", header.hasClientName() ? header.getClientName() : null, true);
        field("mapName", header.hasMapName() ? header.getMapName() : null, true);
        field("gameDirectory", header.hasGameDirectory() ? header.getGameDirectory() : null, true);
        field("networkProtocol", header.hasNetworkProtocol() ? header.getNetworkProtocol() : null, true);
        field("buildNum", header.hasBuildNum() ? header.getBuildNum() : null, true);
        field("serverStartTick", header.hasServerStartTick() ? header.getServerStartTick() : null, true);
        field("playbackTimeSeconds", info.hasPlaybackTime() ? info.getPlaybackTime() : null, true);
        field("playbackTicks", info.hasPlaybackTicks() ? info.getPlaybackTicks() : null, true);
        field("playbackFrames", info.hasPlaybackFrames() ? info.getPlaybackFrames() : null, true);

        if (info.hasGameInfo() && info.getGameInfo().hasDota()) {
            var dota = info.getGameInfo().getDota();
            System.out.println("  \"dota\": {");
            field("matchId", dota.hasMatchId() ? dota.getMatchId() : null, true, 4);
            field("gameMode", dota.hasGameMode() ? dota.getGameMode() : null, true, 4);
            field("gameWinner", dota.hasGameWinner() ? dota.getGameWinner() : null, true, 4);
            field("leagueId", dota.hasLeagueid() ? dota.getLeagueid() : null, true, 4);
            field("radiantTeamId", dota.hasRadiantTeamId() ? dota.getRadiantTeamId() : null, true, 4);
            field("radiantTeamTag", dota.hasRadiantTeamTag() ? dota.getRadiantTeamTag() : null, true, 4);
            field("direTeamId", dota.hasDireTeamId() ? dota.getDireTeamId() : null, true, 4);
            field("direTeamTag", dota.hasDireTeamTag() ? dota.getDireTeamTag() : null, true, 4);
            field("endTime", dota.hasEndTime() ? dota.getEndTime() : null, true, 4);
            field("endTimeIso", dota.hasEndTime() ? Instant.ofEpochSecond(dota.getEndTime()).toString() : null, true, 4);
            System.out.println("    \"players\": [");
            for (int i = 0; i < dota.getPlayerInfoCount(); i++) {
                var player = dota.getPlayerInfo(i);
                System.out.println("      {");
                field("name", player.hasPlayerName() ? player.getPlayerName() : null, true, 8);
                field("hero", player.hasHeroName() ? player.getHeroName() : null, true, 8);
                field("steamId", player.hasSteamid() ? player.getSteamid() : null, true, 8);
                field("gameTeam", player.hasGameTeam() ? player.getGameTeam() : null, true, 8);
                field("fakeClient", player.hasIsFakeClient() ? player.getIsFakeClient() : null, false, 8);
                System.out.printf("      }%s%n", i == dota.getPlayerInfoCount() - 1 ? "" : ",");
            }
            System.out.println("    ]");
            System.out.println("  },");
        }

        System.out.println("  \"rawHeaderText\": " + json(header.toString()) + ",");
        System.out.println("  \"rawInfoText\": " + json(info.toString()));
        System.out.println("}");
    }

    private static void field(String name, Object value, boolean comma) {
        field(name, value, comma, 2);
    }

    private static void field(String name, Object value, boolean comma, int indent) {
        System.out.printf("%s\"%s\": %s%s%n", " ".repeat(indent), name, jsonValue(value), comma ? "," : "");
    }

    private static String jsonValue(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof Number || value instanceof Boolean) {
            return value.toString();
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
}
