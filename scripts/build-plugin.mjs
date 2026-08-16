import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath, pathToFileURL} from "node:url";
import {build} from "esbuild";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const outputPath = path.join(root, "DiscordAITranslator.plugin.js");

function createMetadataBanner(metadata, buildId) {
	return [
		"/**",
		` * @name ${metadata.name}`,
		` * @author ${metadata.author}`,
		` * @authorLink ${metadata.authorLink}`,
		` * @version ${metadata.version}`,
		` * @buildId ${buildId}`,
		` * @description ${metadata.description}`,
		` * @source ${metadata.source}`,
		` * @license ${metadata.license}`,
		" */",
		""
	].join("\n");
}

async function bundleRuntime({debug, buildId}) {
	const result = await build({
		entryPoints: [path.join(root, "src/plugin/index.js")],
		bundle: true,
		platform: "node",
		format: "cjs",
		target: "es2020",
		charset: "utf8",
		legalComments: "none",
		keepNames: true,
		minify: false,
		minifySyntax: true,
		sourcemap: false,
		define: {
			__TRANSLATOR_DISPLAY_DEBUG__: debug ? "true" : "false",
			__TRANSLATOR_BUILD_ID__: JSON.stringify(buildId)
		},
		write: false
	});
	return result.outputFiles[0].text.replace(/\r\n/g, "\n").trimStart();
}

export async function createPluginBundle({debug = false} = {}) {
	const metadata = JSON.parse(fs.readFileSync(path.join(root, "src/plugin/metadata.json"), "utf8"));
	// Audit item 29: two bundles built from unchanged metadata must be distinguishable
	// at runtime. The id is a content hash of the placeholder pass, so it stays a pure
	// function of the source tree - the build remains byte-deterministic.
	const probeRuntime = await bundleRuntime({debug, buildId: "build-id-probe"});
	const buildId = crypto.createHash("sha256").update(probeRuntime).digest("hex").slice(0, 16);
	const runtime = await bundleRuntime({debug, buildId});
	return `${createMetadataBanner(metadata, buildId)}${runtime.trimEnd()}\n`;
}

export async function writePluginBundle({check = false, debug = false} = {}) {
	const generated = await createPluginBundle({debug});
	const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
	if (check && current !== generated) throw new Error("DiscordAITranslator.plugin.js is out of date. Run npm run build.");
	if (!check && !debug && current !== generated) fs.writeFileSync(outputPath, generated);
	return generated;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
	const debug = process.argv.includes("--debug");
	const check = process.argv.includes("--check");
	if (debug && check) {
		process.stderr.write("--debug and --check are mutually exclusive.\n");
		process.exitCode = 1;
	}
	else {
		const generated = await writePluginBundle({check, debug});
		if (debug) process.stdout.write(generated);
	}
}
