In short:

- Silinx HLS: `sizeof` of an array, of a row of it and of an array type is right in synthesis (it was one element's, or refused), and an array parameter's or a pointer's is a pointer's 8 bytes in the C simulation, as cc's.

In detail:

- Silinx HLS: `sizeof` of an array, of any of its rows or sub-arrays, of an array type (`sizeof(int[3][4])`, a typedef's), of a memory, of an array parameter and of a pointer in synthesis, made `sizeof` of its type before the arrays are flattened (`core/c-flatten.js`): it was one element's size with no message, or refused (`sizeof u`, `sizeof u[0]`); in the C simulation an array parameter (`int a[][8]`) and a pointer are a pointer's 8 bytes (they were the caller's array's); a C++ reference to an array, `T (&a)[N]`, the array's in both (#2641).
