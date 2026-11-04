In detail:

- **The Spartan-6 with the nextpnr engine (#2788):** a placement that nextpnr cannot route no longer stops Place &
  Route: the next seed is tried, and the error, when no seed routes, gives nextpnr's reason instead of "undefined".
