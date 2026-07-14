const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(file, "utf8");
source = source.replace(/\n\s*audio\.playsInline = true;/g, "");
fs.writeFileSync(file, source, "utf8");
console.log("[chirp3-audio-typing] compatible HTMLAudioElement output verified");
