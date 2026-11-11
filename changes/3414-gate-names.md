In detail:

- **The import gate refuses more names and XML encodings (#3414):** a name with a C1 control, an invisible or a
  direction character (a zero-width space, a bidi override that makes a name read as another, with its code point in
  the reason), `COM¹` … `LPT³` (reserved by Windows as `COM1`) and `__proto__` (lost by the browser's stores with no
  word); an XML that is not valid UTF-8 or declares another encoding (UTF-7's or EBCDIC's could hide a DTD from the
  gate from a parser that follows the declaration). A file written by `PUT /projects/:p/file` (the interface's saves,
  the MCP's `write_file`) and by the browser edition's store goes by the same name rules, `build/`'s by the rest of
  their path, where a backslash, a stream (`::$DATA`), a trailing dot or space and an invisible character were
  written as they were.
