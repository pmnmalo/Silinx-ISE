// Silinx design corpus: behavioural models of the memory blocks the VTR benchmarks instantiate
// (single_port_ram, dual_port_ram: VTR's architecture files define them as hard blocks, its
// synthesis infers nothing), as VTR documents them: synchronous write, registered read (the old
// word when the same port writes). Part of Silinx (AGPL-3.0-only).
module single_port_ram #(parameter ADDR_WIDTH = 1, parameter DATA_WIDTH = 1) (
  input wire clk,
  input wire [ADDR_WIDTH-1:0] addr,
  input wire we,
  input wire [DATA_WIDTH-1:0] data,
  output reg [DATA_WIDTH-1:0] out
);
  reg [DATA_WIDTH-1:0] mem [0:(1 << ADDR_WIDTH) - 1];
  always @(posedge clk) begin
    if (we) mem[addr] <= data;
    out <= mem[addr];
  end
endmodule

module dual_port_ram #(parameter ADDR_WIDTH = 1, parameter DATA_WIDTH = 1) (
  input wire clk,
  input wire [ADDR_WIDTH-1:0] addr1,
  input wire [ADDR_WIDTH-1:0] addr2,
  input wire we1,
  input wire we2,
  input wire [DATA_WIDTH-1:0] data1,
  input wire [DATA_WIDTH-1:0] data2,
  output reg [DATA_WIDTH-1:0] out1,
  output reg [DATA_WIDTH-1:0] out2
);
  reg [DATA_WIDTH-1:0] mem [0:(1 << ADDR_WIDTH) - 1];
  always @(posedge clk) begin
    if (we1) mem[addr1] <= data1;
    if (we2) mem[addr2] <= data2;
    out1 <= mem[addr1];
    out2 <= mem[addr2];
  end
endmodule
