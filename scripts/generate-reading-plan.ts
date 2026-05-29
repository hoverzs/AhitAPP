/**
 * Gemini API-val generálja a 30 napos olvasási tervet és menti:
 * src/config/readingPlan.json
 *
 * Futtatás: npm run generate:reading-plan
 */
import {
  generateReadingPlanWithGemini,
  saveReadingPlan,
} from "../src/lib/generate-reading-plan";

async function main() {
  console.log("📖 30 napos olvasási terv generálása (Gemini)…\n");

  const plan = await generateReadingPlanWithGemini();
  const filePath = await saveReadingPlan(plan);

  console.log(`✓ Mentve: ${filePath}`);
  console.log(`✓ Cím: ${plan.title}`);
  console.log(`✓ Hetek: ${plan.weeks.length}`);
  console.log(`✓ Napok: ${plan.days.length}\n`);

  for (const week of plan.weeks) {
    console.log(
      `  ${week.weekNumber}. hét — ${week.theme} (${week.themeEn}): ${week.days.length} nap`
    );
  }
}

main().catch((err) => {
  console.error("✗ Hiba:", err instanceof Error ? err.message : err);
  process.exit(1);
});
