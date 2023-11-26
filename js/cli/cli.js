#!/usr/bin/env node

// @ts-check

import { build } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

import { cwd } from "node:process";
import { join, relative } from "node:path";
import { copyFile, readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { build as esbuild } from "esbuild";
import glob from "fast-glob";
import merge from "deepmerge";

// TODO custom log output

/**
 * @typedef {import("../types").Config} Config
 */

async function main() {
    const { templateFile, componentMap, viteConfig, appPath } = await extract(await resolveConfig());

    await mkdir(".golte/generated", { recursive: true });

    await buildClient(componentMap, viteConfig, appPath);
    await rename("dist/client/manifest.json", ".golte/generated/clientManifest.json");

    await generateRenderfile(componentMap);
    await buildServer(viteConfig, appPath);
    await copyFile(templateFile, "dist/server/template.html");
}

/**
 * @returns {Promise<Config>}
 */
async function resolveConfig() {
    const defaultConfigFiles = [
        "golte.config.js",
        "golte.config.mjs",
        "golte.config.ts",
        "golte.config.mts",
    ];

    let resolvedPath = undefined;
    for (const filename of defaultConfigFiles) {
        const filepath = join(cwd(), filename);
        if (!existsSync(filepath)) continue;
        resolvedPath = filepath;
        break;
    }

    if (!resolvedPath) return {};

    const tempFile = `temp-${Date.now()}.js`;

    await esbuild({
        absWorkingDir: cwd(),
        entryPoints: [resolvedPath],
        outfile: tempFile,
        // write: false,
        platform: "node",
        // bundle: true,
        format: "esm",
        // mainFields: ["main"],
        sourcemap: "inline",
        // metafile: true,
    });

    try {
        /** @type {Config} */
        const configFile = (await import(join(cwd(), tempFile))).default
        return configFile;
    } finally {
        await unlink(tempFile);
    }
}

/**
 * @param {Config} inputConfig
 * @returns {Promise<{
 *  templateFile: string
 *  componentMap: Record<string, string>
 *  viteConfig: import("vite").UserConfig
 *  appPath: string
 * }>}
 */
async function extract(inputConfig) {
    /** @type {Required<Config>} */
    const defaultConfig = {
        template: "web/app.html",
        srcDir: "web/",
        ignore: ["lib/"],
        appPath: "_app",
        vite: {
            build: {
                cssCodeSplit: true,
            },
            plugins: [
                svelte({
                    compilerOptions: {
                        // css: "external",
                        hydratable: true,
                    }
                })
            ]
        },
    }

    const config = merge(defaultConfig, inputConfig);

    if (config.appPath.startsWith("/")) config.appPath = config.appPath.slice(1);
    if (config.appPath.endsWith("/")) config.appPath = config.appPath.slice(0, -1);

    return {
        templateFile: config.template,
        componentMap: Object.fromEntries(
            // (await glob(["**/*.svelte"], { cwd: config.srcDir, ignore: config.ignore }))
            (await glob([join(config.srcDir, "**/*.svelte")], { ignore: config.ignore.map((path) => join(config.srcDir, path)) }))
            .map((path) => [relative(config.srcDir, path).replace(/\.svelte$/, ""), path])
        ),
        viteConfig: config.vite,
        appPath: config.appPath,
    }
}

/**
 * @param {Record<string, string>} componentMap
 * @param {import("vite").UserConfig} viteConfig
 * @param {string} appPath 
 */
async function buildClient(componentMap, viteConfig, appPath) {
    /** @type {import("vite").UserConfig} */
    const config = {
        build: {
            ssr: false,
            outDir: "dist/client/",
            minify: false,
            manifest: true,
            // https://github.com/vitejs/vite/issues/4454
            // lib: {},
            rollupOptions: {
                // for some reason, vite sets this to false when using rollupOptions.input instead of lib.entry
                preserveEntrySignatures: "exports-only",
                input: [
                    "node_modules/golte/js/client/hydrate.js",
                    ...Object.values(componentMap),
                ],
                output: {
                    format: "es",
                    entryFileNames: `${appPath}/entries/[name]-[hash].js`,
                    chunkFileNames: `${appPath}/chunks/[name]-[hash].js`,
                    assetFileNames: `${appPath}/assets/[name]-[hash].[ext]`,
                }
            },
        },
        // appType: "custom",
    };

    await build(merge(viteConfig, config));
}

/**
 * @param {Record<string, string>} componentMap
 */
async function generateRenderfile(componentMap) {
    const idxComponentMap = Object.entries(componentMap);

    let renderfile = "";

    renderfile += `import { Renderer } from "golte/js/server";\n\n`;

    for (const i in idxComponentMap) {
        const [, srcpath] = idxComponentMap[i];
        renderfile += `import component_${i} from "../../${srcpath}";\n`
    }
    renderfile += `\n`;

    renderfile += `export const manifest = {\n`;
    const clientManifest = JSON.parse(await readFile(".golte/generated/clientManifest.json", "utf-8"));
    for (const i in idxComponentMap) {
        const [name, srcpath] = idxComponentMap[i];
        const component = clientManifest[srcpath];

        renderfile += `\t"${name}": {\n`;
        renderfile += `\t\tserver: component_${i},\n`;
        renderfile += `\t\tclient: "${component.file}",\n`;
        renderfile += `\t\tcss: [\n`;
        for (const css of traverseCSS(clientManifest, component)) {
            renderfile += `\t\t\t"${css}",\n`;
        }
        renderfile += `\t\t],\n`;
        renderfile += `\t},\n`;



    }
    renderfile += `};\n`;

    renderfile += `
const renderer = new Renderer(manifest);

export function render(components) {
    return renderer.render("${clientManifest["node_modules/golte/js/client/hydrate.js"].file}", components);
}\n`

    await mkdir(".golte/generated", { recursive: true });
    await writeFile(".golte/generated/renderfile.js", renderfile)
}

function traverseCSS(clientManifest, component) {
    const css = new Set(component.css);

    for (const i of component.imports ?? []) {
        if (!(i in clientManifest)) continue;
        const component = clientManifest[i];
        for (const c of traverseCSS(clientManifest, component)) {
            css.add(c);
        }
    }

    return css;
}

/**
 * @param {import("vite").UserConfig} viteConfig
 * @param {string} appPath
 */
async function buildServer(viteConfig, appPath) {
    /** @type {import("vite").UserConfig} */
    const config = {
        build: {
            ssr: true,
            outDir: "dist/server/",
            minify: false,
            // https://github.com/vitejs/vite/issues/4454
            // lib: {},
            rollupOptions: {
                input: [
                    ".golte/generated/renderfile.js",
                    "node_modules/golte/js/server/exports.js",
                ],
                output: {
                    format: "cjs",
                    entryFileNames: "[name].js",
                    chunkFileNames: "chunks/[name]-[hash].js",
                    assetFileNames: `${appPath}/assets/[name]-[hash].[ext]`,
                }
            }
        },
        // appType: "custom",
    };
    
    await build(merge(viteConfig, config));
}

await main();
