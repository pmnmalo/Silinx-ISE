// Feasibility test, step 3 (in context): the full switch -> LED design without one routing switch at
// a time; FULL xor (FULL without pip k) = the bits of pip k. Also both pads without the net.
import fs from 'node:fs';
const src = fs.readFileSync(process.env.REF_XDL || 'ref/top.xdl', 'utf8');
const pipLines = src.split('\n').filter(l => /^\s*pip /.test(l));
pipLines.forEach((line, k) => fs.writeFileSync(`e5/M${k}.xdl`, src.replace(`${line}\n`, '')));
const head = 'design "fuzz" xc3s250ecp132-4 v3.2 ,\n  cfg "";\n';
const inst = name => src.match(new RegExp(`^inst "${name}" [\\s\\S]*?;\\s*$`, 'm'))[0];
fs.writeFileSync('e5/PADS.xdl', head + inst('sw') + '\n' + inst('led') + '\n');
console.log(pipLines.length, 'pips');
