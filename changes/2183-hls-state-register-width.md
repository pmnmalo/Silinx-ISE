In short:

- **Silinx HLS:** a sequential module's state register is as wide as its states need, no longer about 920 bits.

In detail:

- **The state register of a sequential module (#2183):** the machine kept the schedule's states added in a field named as an inherited method, so every machine was made again with the method's text as its room for states; a 5-state loop had a 920-bit `ap_CS_fsm`.
