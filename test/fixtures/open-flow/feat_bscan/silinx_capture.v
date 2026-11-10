// silinx-wizard: {"wizard":"capture","version":1,"name":"silinx_capture","lang":"verilog","family":"spartan3e","depth":1024,"pre":64,"probes":[{"name":"count","width":16}],"trigger":{"combine":"and","conditions":[{"probe":"count","op":"=","value":1000}]}}
// Logic analyzer core (Silinx, #3176): 16 bit(s) of probes (count[16]),
// 1024 samples on clk, 64 before the trigger: count = 1000.
// The PC arms it and reads it through the JTAG (tck, sel, capture, shift, tdi, tdo: a BSCAN's user register).
// Do not edit: the module is generated from the line above.
`timescale 1ns / 1ps

module silinx_capture (
  input  wire clk,
  input  wire [15:0] probe,
  input  wire tck,
  input  wire sel,
  input  wire capture,
  input  wire shift,
  input  wire tdi,
  output wire tdo
);

  reg [15:0] mem [0:1023];
  integer i;
  initial for (i = 0; i < 1024; i = i + 1) mem[i] = 16'h0;
  // the capture clock's side: the state (0 idle, 1 filling the samples before the trigger, 2 waiting for it, 3 after it)
  reg [1:0] state = 2'd0;
  reg [9:0] wptr = 10'd0, cnt = 10'd0;
  reg [2:0] arm_s = 3'd0;
  reg ack = 1'b0, triggered = 1'b0, done = 1'b0;
  wire we = state != 2'd0;
  wire trig = (probe[15:0] == 16'b0000001111101000);
  // the JTAG side: the data register, the read address and word, the arm toggle, the flags crossed
  reg [17:0] sr = 18'h0;
  reg [9:0] raddr = 10'd0;
  reg [15:0] rdata = 16'h0;
  reg arm_t = 1'b0;
  reg [1:0] ack_s = 2'd0, armed_s = 2'd0, trig_s = 2'd0, done_s = 2'd0;
  wire [17:0] status = {8'd15, 5'd10, ack_s[1], arm_t, done_s[1], trig_s[1], armed_s[1]};

  always @(posedge clk) if (we) mem[wptr] <= probe;

  always @(posedge clk) begin
    arm_s <= {arm_s[1:0], arm_t};
    if (arm_s[2] != arm_s[1]) begin
      ack <= arm_s[1];
      triggered <= 1'b0;
      done <= 1'b0;
      cnt <= 0;
      state <= 2'd1;
    end else if (we) begin
      wptr <= wptr + 1;
      cnt <= cnt + 1;
      if (state == 2'd1) begin
        if (cnt == 10'd63) state <= 2'd2;
      end else if (state == 2'd2) begin
        if (trig) begin
          triggered <= 1'b1;
        state <= 2'd3;
        cnt <= 0;
        end
      end else begin
        if (cnt == 10'd958) begin
          done <= 1'b1;
          state <= 2'd0;
        end
      end
    end
  end

  always @(posedge tck) begin
    ack_s <= {ack_s[0], ack};
    armed_s <= {armed_s[0], we};
    trig_s <= {trig_s[0], triggered};
    done_s <= {done_s[0], done};
    rdata <= mem[raddr];
    if (sel && capture) begin
      if (sr[1:0] == 2'd1) begin
        arm_t <= ~arm_t;
        sr <= {status[17:4], ~arm_t, status[2:0]};
      end else if (sr[1:0] == 2'd2) begin
        sr <= {2'b0, rdata};
        raddr <= raddr + 1;
      end else if (sr[1:0] == 2'd3) begin
        raddr <= wptr;
        sr <= status;
      end else
        sr <= status;
    end else if (sel && shift)
      sr <= {tdi, sr[17:1]};
  end
  assign tdo = sr[0];

endmodule
