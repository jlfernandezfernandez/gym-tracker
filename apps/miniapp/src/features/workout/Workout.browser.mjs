/*
 * Optional standalone smoke test; Playwright is not a project dependency.
 * Prerequisite: install Mini App dependencies, then run from the repo root:
 *   npm install --prefix /tmp/gym-browser-check playwright
 *   node /tmp/gym-browser-check/node_modules/playwright/cli.js install chromium
 * In a separate terminal, from the repo root (use a free port):
 *   npm --prefix apps/miniapp run dev -- --host 127.0.0.1 --port 4325
 * Then, from the repo root:
 *   PLAYWRIGHT_MODULE=/tmp/gym-browser-check/node_modules/playwright/index.mjs BASE_URL=http://127.0.0.1:4325 node apps/miniapp/src/features/workout/Workout.browser.mjs
 * PLAYWRIGHT_MODULE must point to the absolute module file, not its directory.
 * Screenshots are written to /tmp/gym-workout-{picker,exercise}-{320,1280}.png.
 */
import assert from "node:assert/strict";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4325";

async function assertFits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator("dialog[open] input").evaluateAll(inputs => inputs.some(input => {
    const bounds = input.getBoundingClientRect();
    const parent = input.closest("dialog").getBoundingClientRect();
    return bounds.left < parent.left || bounds.right > parent.right;
  })), false);
}

try {
  for (const width of [320, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${baseUrl}/demo/`);
    await page.addStyleTag({ content: "astro-dev-toolbar { display: none !important; }" });
    await page.getByRole("button", { name: "Ver plan completo", exact: true }).click();
    assert.equal(await page.getByRole("region", { name: "Espalda alta", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: /^(Subir|Bajar)/ }).count(), 0);
    const add = page.getByRole("button", { name: "+ Añadir ejercicio", exact: true });
    await add.click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByRole("button", { name: /Remo ergómetro/ }).click();
    assert.equal(await dialog.getByLabel("Minutos para todas las series", { exact: true }).inputValue(), "20");
    await dialog.getByRole("button", { name: /Sentadilla con barra/ }).click();
    assert.equal(await dialog.getByLabel("Reps para todas las series", { exact: true }).inputValue(), "10");
    assert.equal(await dialog.getByLabel("Minutos para todas las series", { exact: true }).count(), 0);
    const choice = dialog.getByRole("button", { name: /Sentadilla con barra/ });
    await page.keyboard.press("Tab");
    await choice.focus();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const focus = await choice.evaluate(element => {
      const style = getComputedStyle(element);
      return { width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset) };
    });
    assert.ok(focus.width >= 2 && focus.offset <= -focus.width);
    await dialog.getByLabel("Series", { exact: true }).fill("2");
    await dialog.getByLabel("Peso para todas las series (kg)", { exact: true }).fill("30");
    await dialog.getByLabel("Personalizar por serie", { exact: true }).check();
    assert.equal(await dialog.getByLabel("Peso serie 1 (kg)", { exact: true }).inputValue(), "30");
    await dialog.getByLabel("Peso serie 2 (kg)", { exact: true }).fill("40");
    await dialog.getByLabel("Reps serie 2", { exact: true }).fill("8");
    await assertFits(page);
    await page.screenshot({ path: `/tmp/gym-workout-picker-${width}.png` });
    await dialog.getByRole("button", { name: "Añadir", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: /Sentadilla con barra/ }).click();
    await page.getByRole("heading", { name: "Sentadilla con barra", exact: true }).waitFor();
    assert.match(await page.locator("main").innerText(), /40 kg.*8/);
    await page.getByText("Opciones de Sentadilla con barra", { exact: true }).click();
    await page.getByRole("button", { name: "Saltar", exact: true }).click();
    await page.getByRole("button", { name: "Desmarcar skip", exact: true }).click();
    await page.getByRole("button", { name: "Reemplazar", exact: true }).click();
    await dialog.getByRole("button", { name: /Curl con barra/ }).click();
    await dialog.getByLabel("Por tiempo", { exact: true }).check();
    await dialog.getByLabel("Personalizar por serie", { exact: true }).check();
    await dialog.getByLabel("Segundos serie 2", { exact: true }).fill("45");
    await dialog.getByRole("button", { name: "Reemplazar", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("heading", { name: "Curl con barra", exact: true }).waitFor();
    assert.match(await page.locator("main").innerText(), /45s/);
    assert.equal(await page.locator("#set-reps").inputValue(), "30");
    await assertFits(page);
    await page.screenshot({ path: `/tmp/gym-workout-exercise-${width}.png` });
    const exerciseOptions = page.locator("details").filter({ hasText: "Opciones de Curl con barra" });
    if (!await exerciseOptions.evaluate(element => element.open)) await exerciseOptions.locator("summary").click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await dialog.getByRole("button", { name: "Eliminar", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await add.waitFor();
    await page.getByRole("button", { name: /Curl con barra/ }).waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("button", { name: /Curl con barra/ }).count(), 0);

    let planOptions = page.locator("details").filter({ hasText: "Opciones de Remo ergómetro" });
    await planOptions.locator("summary").click();
    await planOptions.getByRole("button", { name: "Saltar", exact: true }).click();
    await planOptions.getByRole("button", { name: "Desmarcar skip", exact: true }).click();
    await planOptions.getByRole("button", { name: "Reemplazar", exact: true }).click();
    await dialog.getByRole("button", { name: /Peso muerto/ }).click();
    assert.equal(await dialog.getByLabel("Reps para todas las series", { exact: true }).inputValue(), "10");
    await dialog.getByRole("button", { name: "Reemplazar", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    planOptions = page.locator("details").filter({ hasText: "Opciones de Peso muerto" });
    if (!await planOptions.evaluate(element => element.open)) await planOptions.locator("summary").click();
    await planOptions.getByRole("button", { name: "Eliminar", exact: true }).click();
    await dialog.getByRole("button", { name: "Eliminar", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: /Peso muerto/ }).waitFor({ state: "hidden" });
    assert.equal(await page.getByRole("button", { name: /Peso muerto/ }).count(), 0);
    await add.click();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await add.evaluate(element => element === document.activeElement), true);
    await assertFits(page);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, result: "passed", flows: "add, cardio-to-strength, per-set targets, timed replacement, skip/restore/replace/delete in Plan and Exercise, picker focus and cancel" }));
    await page.close();
  }
} finally {
  await browser.close();
}