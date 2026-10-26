// Preserve previous public Next.js chunks for clients open during a cutover.
// The new build always wins a filename collision. Never follow source links.
const fs = require("node:fs");
const path = require("node:path");
function retainNextStatic(source, destination) {
  source = path.resolve(source); destination = path.resolve(destination);
  if (source === destination || source.startsWith(destination + path.sep) || destination.startsWith(source + path.sep)) throw new Error("Use separate source and destination directories.");
  const counts = { copied: 0, retainedCurrent: 0, skippedLinks: 0 };
  function copy(from, to) {
    const entry = fs.lstatSync(from);
    if (entry.isSymbolicLink()) { counts.skippedLinks++; return; }
    if (entry.isDirectory()) {
      if (fs.existsSync(to) && (!fs.lstatSync(to).isDirectory() || fs.lstatSync(to).isSymbolicLink())) throw new Error("Destination directory is not a real directory.");
      fs.mkdirSync(to, { recursive: true });
      for (const name of fs.readdirSync(from).sort()) copy(path.join(from, name), path.join(to, name));
    } else if (entry.isFile()) {
      try { fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL); counts.copied++; }
      catch (error) { if (error.code !== "EEXIST") throw error; counts.retainedCurrent++; }
    }
  }
  copy(source, destination);
  return counts;
}
module.exports = { retainNextStatic };
if (require.main === module) {
  const [source, destination, extra] = process.argv.slice(2);
  if (!source || !destination || extra) throw new Error("Usage: node scripts/retain-next-static.cjs OLD_STATIC NEW_STATIC");
  console.log(JSON.stringify(retainNextStatic(source, destination)));
}
