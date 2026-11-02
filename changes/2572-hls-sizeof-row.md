In detail:

- Silinx HLS C simulation: `sizeof` of a row or subarray of a multidimensional array (`sizeof u[0]`, `sizeof d[0][0]`) and of an array type (`sizeof(row_t)`) returns the byte size of the row or subarray rather than one element's (#2572).
