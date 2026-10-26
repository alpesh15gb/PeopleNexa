// Bundle local integration tests for the Linux Node runtime in the isolated lab.
// No .env files are read. Never use these session stubs to build the application.
const path = require("node:path");
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error("Pass an absolute output directory outside the application.");
const sessionBoundary = { name: "isolated-lab-session", setup(builder) {
  builder.onResolve({ filter: /(^@\/lib\/session$|^\.\/session$)/ }, () => ({ path: "lab-session", namespace: "lab" }));
  builder.onLoad({ filter: /.*/, namespace: "lab" }, () => ({ contents: "export async function requireActiveSession(){return globalThis.attendanceTestSession}; export const requireSession=requireActiveSession; export const getSession=requireActiveSession;", loader: "js" }));
} };
async function main() {
  for (const kind of ["recovery", "report", "automatic-boundary"]) await build({
    entryPoints: [`scripts/test-attendance-${kind}-integration.ts`],
    outfile: path.join(output, `${kind}-test.mjs`),
    bundle: true, platform: "node", format: "esm", external: ["pg-native"],
    banner: { js: "import {createRequire} from 'node:module'; import {fileURLToPath as labFileURLToPath} from 'node:url'; import {dirname as labDirname} from 'node:path'; const require=createRequire(import.meta.url); const __filename=labFileURLToPath(import.meta.url); const __dirname=labDirname(__filename);" },
    plugins: kind === "report" ? [sessionBoundary] : [],
  });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
