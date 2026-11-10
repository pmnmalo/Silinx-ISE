In detail:

- **A follow link pasted into the page that shares a project warns again instead of reloading it (#3331):** #3316's hashchange handler loaded the page again for every `#follow=` link, before #3318's warning; link-hash.js now hands such a link to collab-follow.js's followPasted, the one handler.
