import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { build } from "vite";

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    root: __dirname,
    logLevel: "error",
    esbuild: { jsx: "automatic" },
    build: {
      write: false,
      minify: false,
      rollupOptions: {
        input: path.join(__dirname, "avatar.fixture.tsx"),
        output: { format: "iife", inlineDynamicImports: true },
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output)) throw new Error("Expected a static component bundle");
  const code = output.output.find((entry) => entry.type === "chunk")?.code;
  if (!code) throw new Error("Component bundle missing");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
    "base64",
  );
  server = createServer((request, response) => {
    const pathname = new URL(request.url!, "http://localhost").pathname;
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end(
        '<!doctype html><html lang="fr"><head><title>Avatar component fixture</title></head><body><div id="root"></div><script src="/avatar-test.js"></script></body></html>',
      );
    } else if (pathname === "/avatar-test.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end(code);
    } else if (pathname === "/avatar-good.png") {
      response.setHeader("Content-Type", "image/png");
      response.end(png);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  await page.goto(origin);
});

test("an image error does not hide a replacement source", async ({ page }) => {
  await expect(page.getByTestId("avatar")).toHaveText("JM");
  await page.getByRole("button", { name: "Nouvelle photo" }).click();
  const image = page.getByRole("img", { name: "JM" });
  await expect(image).toHaveAttribute("src", "/avatar-good.png");
  await expect
    .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBe(1);
});

test("a later failure falls back and a fresh upload can recover again", async ({ page }) => {
  await expect(page.getByTestId("avatar")).toHaveText("JM");
  await page.getByRole("button", { name: "Nouvelle photo" }).click();
  await expect(page.getByRole("img", { name: "JM" })).toBeVisible();
  await page.getByRole("button", { name: "Photo indisponible" }).click();
  await expect(page.getByTestId("avatar")).toHaveText("JM");
  await page.getByRole("button", { name: "Autre photo" }).click();
  const image = page.getByRole("img", { name: "JM" });
  await expect(image).toHaveAttribute("src", "/avatar-good.png?v=2");
  await expect
    .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBe(1);
});
