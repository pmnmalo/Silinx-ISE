// Feasibility test, steps 3-4: the switch -> LED design taken apart (empty, each pad, each routing
// switch alone) and whole, to rebuild ISE's bitstream from the separately measured bits.
import fs from 'node:fs';
const src = fs.readFileSync(process.env.REF_XDL || 'ref/top.xdl', 'utf8');
const head = 'design "fuzz" xc3s250ecp132-4 v3.2 ,\n  cfg "";\n';
const inst = name => src.match(new RegExp(`^inst "${name}" [\\s\\S]*?;\\s*$`, 'm'))[0];
const pips = [...src.matchAll(/^\s*pip (\S+) (\S+) (\S+) (\S+) ,/gm)].map(m => m.slice(1, 5));
fs.writeFileSync('e4/E.xdl', head);
fs.writeFileSync('e4/Isw.xdl', head + inst('sw') + '\n');
fs.writeFileSync('e4/Iled.xdl', head + inst('led') + '\n');
pips.forEach((p, k) => fs.writeFileSync(`e4/P${k}.xdl`, `${head}net "t${k}" ,\n  pip ${p.join(' ')} ,\n  ;\n`));
fs.writeFileSync('e4/FULL.xdl', src);
console.log(pips.map(p => p.join(' ')).join('\n'));
