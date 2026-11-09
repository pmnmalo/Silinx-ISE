// The Spartan-6's slice / hard block arcs of Silinx's timing model as a C++ header for the fork (spartan6/timing_model.h)
import { S6_SPEED_3 } from '../../src/fpga/s6/timing-model.js';
const a = S6_SPEED_3.arcs, num = v => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const map = o => `{${Object.entries(o).map(([k, v]) => `{"${k}", ${num(v)}}`).join(', ')}}`;
const base = Object.fromEntries(Object.entries(a).filter(([, v]) => typeof v === 'number'));
console.log(`// Generated from Silinx's packages/silinx-fpga/src/fpga/s6/timing-model.js (S6_SPEED_3.arcs, the -3 speed grade) by
// Silinx's research/nextpnr-s6/export-arcs.mjs: trce's arc types in ns (base: the defaults; types: each type's median;
// classes: by site class). Not edited by hand.
#ifndef SPARTAN6_TIMING_MODEL_H
#define SPARTAN6_TIMING_MODEL_H
#include <map>
#include <string>
namespace s6_model {
inline const std::map<std::string, double> &base() { static const std::map<std::string, double> m = ${map(base)}; return m; }
inline const std::map<std::string, double> &types() { static const std::map<std::string, double> m = ${map(a.types)}; return m; }
inline const std::map<std::string, std::map<std::string, double>> &classes() { static const std::map<std::string, std::map<std::string, double>> m = {${Object.entries(a.classes).map(([k, v]) => `{"${k}", ${map(v)}}`).join(', ')}}; return m; }
} // namespace s6_model
#endif`);
