In detail:

- **Silinx HLS DATAFLOW: no unused ap_ready signal (#2992):** the top of a `#pragma HLS DATAFLOW` region left each
  process's `ap_ready` open (the top reads its `ap_done`) instead of a signal that was never read, so Check Syntax's
  design checks no longer say `Signal <f_u0_ap_ready> is assigned but never used` once per process.
