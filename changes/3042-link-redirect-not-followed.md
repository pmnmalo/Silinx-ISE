In short:

- **A link's zip, never through a redirection:** a zip at an address that redirects elsewhere is refused (said in the
  console); the link must give the zip's own address.

In detail:

- **Open from a link: a redirection is not followed (#3042):** the zip of an `#open=https://…` link is fetched with
  `redirect: 'manual'` (`web/js/link-open.js`): a redirection was followed before its address was checked (#2962), the
  request sent to an address of this computer or of a local network before the refusal; now an opaque redirection
  is refused (`ERROR: Open from a link: … redirects to another address, not followed: the link must give the zip's own
  address.`), the link's own address checked before the fetch as before. A GitHub release's download (redirected to
  another site that sends no CORS header) could not be fetched before either; test: `test/ui/design-link.test.js`
  (fetched with `redirect: 'manual'`, an opaque redirection and a followed one refused, no warnings).
