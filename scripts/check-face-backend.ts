import { existsSync } from "node:fs";
import path from "node:path";
import { getFaceModelDir, loadFaceBackend } from "../lib/face";

async function main() {
  const directory = getFaceModelDir();
  const files = ["tiny_face_detector_model-weights_manifest.json", "tiny_face_detector_model.bin", "face_landmark_68_model-weights_manifest.json", "face_landmark_68_model.bin", "face_recognition_model-weights_manifest.json", "face_recognition_model.bin"];
  const missing = files.filter(file => !existsSync(path.join(directory, file)));
  if (missing.length) { console.log(JSON.stringify({ ready: false, directory, missing }, null, 2)); process.exitCode = 1; return; }
  await loadFaceBackend();
  console.log(JSON.stringify({ ready: true, directory, message: "Server face models loaded successfully. Real-phone capture and matching still require a live test." }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
