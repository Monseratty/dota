package skadistats.clarity.tools;

import skadistats.clarity.processor.runner.SimpleRunner;
import skadistats.clarity.source.MappedFileSource;

import java.nio.file.Files;
import java.nio.file.Path;

public class DashboardDump {

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("usage: DashboardDump <demo-file> <output-dir>");
            System.exit(2);
        }

        var demoPath = args[0];
        var outputDir = Path.of(args[1]);
        Files.createDirectories(outputDir);
        FullDemoDump.writeSummary(demoPath, outputDir.resolve("summary.json"));

        long started = System.currentTimeMillis();
        var inventory = new FinalInventoryDump();
        try (var source = new MappedFileSource(demoPath);
             var match = new FullDemoDump(outputDir, FullDemoDump.Mode.DASHBOARD);
             var skills = new SkillBuildDump(outputDir.resolve("skill_build.jsonl"))) {
            new SimpleRunner(source).runWith(match, inventory, skills);
            match.writeOutputs(outputDir, System.currentTimeMillis() - started);
            inventory.writeJson(outputDir.resolve("final_inventory.json"));
        }
    }
}
