In detail:

- Silinx HLS C simulation and synthesis: an unsized array of characters initialized by a string literal (`char b[] = "abc"`) takes its length from the string plus its trailing null terminator (`sizeof b == 4`) rather than having 0 elements (#2640).
