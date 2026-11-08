// Silinx design corpus, Basys2 board top: SERV, Olof Kindgren's bit-serial RISC-V CPU (serv_rf_top,
// RV32I, fetched, never committed), running a program of 8 instructions from a ROM written here: a
// counter shown on the LEDs. Part of Silinx (AGPL-3.0-only).
//   LD7..LD0: a binary counter, one step about every second (the CPU's delay loop)
//   BTN0: reset (the counter starts again from 1)
// The program (RV32I, hand-assembled):
//   0x00  lui  x1, 0x40000        x1 = 0x40000000, the LED port
//   0x04  addi x2, x0, 0          x2 = 0 (the counter)
//   0x08  addi x2, x2, 1          loop: x2 = x2 + 1
//   0x0c  sw   x2, 0(x1)          LEDs = x2[7:0]
//   0x10  lui  x3, 0x80           x3 = 0x80000 (DELAY_INSN: the delay)
//   0x14  addi x3, x3, -1         wait: x3 = x3 - 1
//   0x18  bne  x3, x0, -4         until x3 = 0
//   0x1c  jal  x0, -20            back to the loop
// Memory map: instructions from the ROM (addresses 0x00..0x1c); a data write to 0x4xxxxxxx sets
// the LEDs; data reads give 0.
module serv_basys2 #(parameter [31:0] DELAY_INSN = 32'h000801b7)   // lui x3, 0x80
  (input wire mclk, input wire reset, output reg [7:0] led = 8'h00);   // reset: BTN0
  wire rst = reset;
  wire [31:0] ibus_adr, dbus_adr, dbus_dat;
  wire [3:0] dbus_sel;
  wire ibus_cyc, dbus_we, dbus_cyc;
  reg ibus_ack = 1'b0, dbus_ack = 1'b0;
  reg [31:0] insn = 32'h0;
  // the ROM, read in the cycle after the request (Wishbone: ack one cycle later)
  always @(posedge mclk) begin
    case (ibus_adr[4:2])
      3'd0: insn <= 32'h400000b7;
      3'd1: insn <= 32'h00000113;
      3'd2: insn <= 32'h00110113;
      3'd3: insn <= 32'h0020a023;
      3'd4: insn <= DELAY_INSN;
      3'd5: insn <= 32'hfff18193;
      3'd6: insn <= 32'hfe019ee3;
      default: insn <= 32'hfedff06f;
    endcase
    ibus_ack <= ibus_cyc & ~ibus_ack & ~rst;
    dbus_ack <= dbus_cyc & ~dbus_ack & ~rst;
    if (dbus_cyc & dbus_we & ~dbus_ack & dbus_adr[30] & dbus_sel[0]) led <= dbus_dat[7:0];
  end
  serv_rf_top #(.RESET_PC(32'h0), .WITH_CSR(0)) cpu (
    .clk(mclk), .i_rst(rst), .i_timer_irq(1'b0),
    .o_ibus_adr(ibus_adr), .o_ibus_cyc(ibus_cyc), .i_ibus_rdt(insn), .i_ibus_ack(ibus_ack),
    .o_dbus_adr(dbus_adr), .o_dbus_dat(dbus_dat), .o_dbus_sel(dbus_sel), .o_dbus_we(dbus_we),
    .o_dbus_cyc(dbus_cyc), .i_dbus_rdt(32'h0), .i_dbus_ack(dbus_ack),
    .o_ext_rs1(), .o_ext_rs2(), .o_ext_funct3(), .i_ext_rd(32'h0), .i_ext_ready(1'b0), .o_mdu_valid());
endmodule
