import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { AcceptedPlugin, Plugin } from "postcss";
import postcss from "postcss";

export interface CssOptions {
  input?: string;
  mode?: "inline" | "external" | "auto";
}

export interface CssResult {
  code: string;
  mode: "inline" | "external";
}

interface InternalCssConfig {
  input: string;
  mode: "inline" | "external";
}

const cachedCss: Map<string, { code: string; timestamp: number }> = new Map();
let cssConfig: InternalCssConfig | null = null;

export function setCssConfig(options: CssOptions | undefined, dev: boolean): void {
  if (!options?.input) {
    cssConfig = null;
    return;
  }

  const configMode = options.mode ?? "auto";
  let effectiveMode: "inline" | "external";
  if (configMode === "auto") {
    effectiveMode = dev ? "inline" : "external";
  } else {
    effectiveMode = configMode;
  }

  cssConfig = {
    input: options.input,
    mode: effectiveMode,
  };
}

export function getCssConfig(): InternalCssConfig | null {
  return cssConfig;
}

export function invalidateCssCache(inputPath: string): void {
  cachedCss.delete(inputPath);
}

export async function getCachedCss(cwd: string): Promise<CssResult | null> {
  if (!cssConfig) {
    return null;
  }

  const absolutePath = resolve(cwd, cssConfig.input);
  const cached = cachedCss.get(absolutePath);

  if (cached) {
    return { code: cached.code, mode: cssConfig.mode };
  }

  const code = await processCssInternal(absolutePath, cwd);
  return { code, mode: cssConfig.mode };
}

async function processCssInternal(absolutePath: string, cwd: string): Promise<string> {
  if (!existsSync(absolutePath)) {
    throw new Error(`[elysion:css] CSS file not found: ${absolutePath}`);
  }

  const file = Bun.file(absolutePath);
  const source = await file.text();

  try {
    const postcssConfigPath = findPostcssConfig(cwd);
    let plugins: AcceptedPlugin[] = [];

    if (postcssConfigPath) {
      const config = await loadPostcssConfig(postcssConfigPath);
      plugins = await resolvePlugins(config.plugins || {}, cwd);
    }

    const result = await postcss(plugins).process(source, {
      from: absolutePath,
      to: absolutePath,
    });

    const code = result.css;

    cachedCss.set(absolutePath, {
      code,
      timestamp: Date.now(),
    });

    return code;
  } catch (error) {
    console.error(`[elysion:css] Error processing CSS: ${absolutePath}`);
    throw error;
  }
}

function findPostcssConfig(cwd: string): string | null {
  const configNames = [
    "postcss.config.mjs",
    "postcss.config.js",
    "postcss.config.cjs",
    ".postcssrc",
    ".postcssrc.json",
    ".postcssrc.js",
  ];

  for (const name of configNames) {
    const path = resolve(cwd, name);
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

async function loadPostcssConfig(configPath: string): Promise<{ plugins: Record<string, object> }> {
  try {
    const module = await import(configPath);
    const config = module.default || module;

    if (typeof config === "function") {
      return config({ env: process.env.NODE_ENV || "development" });
    }

    return config;
  } catch (error) {
    console.error(`[elysion:css] Error loading PostCSS config: ${configPath}`);
    throw error;
  }
}

async function resolvePlugins(
  pluginsConfig: Record<string, object>,
  cwd: string
): Promise<AcceptedPlugin[]> {
  const plugins: AcceptedPlugin[] = [];

  for (const [pluginName, options] of Object.entries(pluginsConfig)) {
    try {
      const pluginPath = require.resolve(pluginName, { paths: [cwd] });
      const pluginModule = await import(pluginPath);
      const plugin = pluginModule.default || pluginModule;

      if (typeof plugin === "function") {
        plugins.push(plugin(options));
      } else if (typeof plugin.postcss === "function") {
        plugins.push(plugin.postcss(options));
      } else if (plugin && typeof plugin === "object" && "postcssVersion" in plugin) {
        plugins.push(plugin as Plugin);
      } else {
        console.warn(`[elysion:css] Unknown plugin format: ${pluginName}`);
      }
    } catch (error) {
      console.warn(`[elysion:css] Failed to load PostCSS plugin: ${pluginName}`, error);
    }
  }

  return plugins;
}
