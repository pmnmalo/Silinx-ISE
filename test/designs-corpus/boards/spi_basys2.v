// Silinx design corpus, Basys2 board top: nandland's SPI master (spi-master, Verilog version,
// fetched, never committed) with MISO looped back to MOSI: a press of BTN1 sends the switches'
// byte, the byte received back is shown on the LEDs. Part of Silinx (AGPL-3.0-only).
//   SW7..SW0: the byte to send; BTN1: send; BTN0: reset
//   LD7..LD0: the last byte received (the switches at the last press of BTN1)
module spi_basys2 (input wire mclk, input wire [1:0] btn, input wire [7:0] sw, output reg [7:0] led = 8'h00);
  // the button synchronized, one pulse per press
  reg [2:0] b1 = 0;
  always @(posedge mclk) b1 <= {b1[1:0], btn[1]};
  wire send = b1[1] & ~b1[2];
  wire ready, rx_dv, sclk, mosi;
  wire [7:0] rx;
  SPI_Master #(.SPI_MODE(0), .CLKS_PER_HALF_BIT(4)) spi (
    .i_Rst_L(~btn[0]), .i_Clk(mclk),
    .i_TX_Byte(sw), .i_TX_DV(send & ready), .o_TX_Ready(ready),
    .o_RX_DV(rx_dv), .o_RX_Byte(rx),
    .o_SPI_Clk(sclk), .i_SPI_MISO(mosi), .o_SPI_MOSI(mosi));
  always @(posedge mclk) if (rx_dv) led <= rx;
endmodule
