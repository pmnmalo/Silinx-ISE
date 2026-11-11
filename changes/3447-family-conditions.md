In detail:

- The Process Properties' Map (Spartan-6) field and the logic analyzer's block RAM count ask the family's profile (core/family-profile.js: its `mapChoice`, its `blockRam`) instead of testing the family's name, and so does the MCP tool set_process_properties: test/family-conditions.test.js failed on main (#3447).
