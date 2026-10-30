// Silinx - open synthesis: the Spartan-6's inferred block RAMs whole (#2130). synth_xilinx -family xc6s maps a memory
// that fits half a block RAM onto a RAMB8BWER (Yosys's rule, brams_xc3sda.txt with IS_SPARTAN6: its MODE "HALF" and its
// simple dual-port $__XILINX_BLOCKRAM_SDP_), and ISE's DRC warns of every one: "9K Block RAM initialization data, both
// user defined and default, may be incorrect and should not be used" (PhysDesignRules:2410; the stopwatch's lap memory,
// 512 x 14). Its memory step is run here with the same rule without the halves (BRAMS_S6: Yosys's, ISC licence, the
// HALF option and the SDP block left out), so a block RAM it infers is a whole RAMB16BWER; the other steps are
// synth_xilinx's own (the same netlist as synth_xilinx whole for a design with no such memory). A RAMB8BWER the design
// instantiates stays as it is.
export const BRAMS_S6_FILE = 'silinx_brams_xc6s.txt';
export const BRAMS_S6 = `# Block RAMs for Spartan 6 (Yosys's brams_xc3sda.txt without the 9K halves, RAMB8BWER: Silinx, #2130).
# The corresponding mapping file is brams_xc3sda_map.v

ram block $__XILINX_BLOCKRAM_TDP_ {
	byte 9;
	option "MODE" "FULL" {
		abits 14;
		widths 1 2 4 9 18 36 per_port;
		cost 129;
	}
	init any;
	port srsw "A" "B" {
		# Spartan 6 and Virtex 6 have a bug where READ_FIRST is not usable with asynchronous clocks.
		ifdef IS_SPARTAN6 {
			option "HAS_RDFIRST" 1 {
				clock posedge "C";
			}
			option "HAS_RDFIRST" 0 {
				clock posedge;
			}
		} else {
			clock posedge;
		}
		clken;
		option "RSTTYPE" "SYNC" {
			portoption "RST_PRIORITY" "CE" {
				rdsrst any gated_clken;
			}
			ifdef IS_SPARTAN6 {
				portoption "RST_PRIORITY" "SR" {
					rdsrst any ungated;
				}
			}
		}
		ifdef IS_SPARTAN6 {
			option "RSTTYPE" "ASYNC" {
				portoption "RST_PRIORITY" "SR" {
					rdarst any;
				}
			}
		}
		rdinit any;
		portoption "WRITE_MODE" "NO_CHANGE" {
			rdwr no_change;
		}
		portoption "WRITE_MODE" "WRITE_FIRST" {
			rdwr new;
		}
		ifdef IS_SPARTAN6 {
			option "HAS_RDFIRST" 1 {
				portoption "WRITE_MODE" "READ_FIRST" {
					rdwr old;
					wrtrans all old;
				}
			}
		} else {
			portoption "WRITE_MODE" "READ_FIRST" {
				rdwr old;
				wrtrans all old;
			}
		}
		optional;
	}
}
`;

/** synth_xilinx -family xc6s (`synth`, its command) with its memory step on BRAMS_S6: the step's commands as
 *  synth_xilinx runs them for the family (Yosys 0.70: its LUT RAMs, its ROMs' logic cost), the rule file swapped. */
export const s6SynthCommands = synth => `${synth} -run :map_memory; `
  + `memory_libmap -lib +/xilinx/lutrams_xc5v.txt -lib ${BRAMS_S6_FILE} -D IS_SPARTAN6 -logic-cost-rom 0.015625; `
  + `techmap -map +/xilinx/lutrams_xc5v_map.v; techmap -map +/xilinx/brams_xc3sda_map.v; ${synth} -run map_ffram:`;
