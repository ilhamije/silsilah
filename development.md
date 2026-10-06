PLAN

- Islamic Mawaris Law (find the source, hadist, quran sources, ulama fatwa) and find exsiting calculator or formula to adapt into the system
- Mapping the address, but only super admins can reveal the exact address. The map only shows the area / radius, but if radius, the center point is not the exact address of the person
- Phases still to build (docs/PROPOSAL.md §6): 5 merge detection + admin stats, 6 GEDCOM/JSON export, 7 sharing UI

IMPROVEMENTS (noted 2026-09-28)

Deploy and setup
- Run migrations on deploy: `npm run build` doesn't run `prisma migrate deploy`, so new code can reach production before its column does (as with TreeMember.personId). Add it to the build, or make it a required release step.
- Local .env points at the production Neon database. Use a Neon dev branch (or local Docker Postgres) for `npm run dev`, so testing and migrations don't touch real data.
- DB-backed tests (~49) are skipped locally because there's no test database. Set up DATABASE_URL_TEST and run them in CI.
- Server errors in production only show a digest number. Add an error page with a friendly message plus the digest, and check Vercel logs / an error tracker for the real cause.
- Remove the temporary password sign-in once email (Resend domain) works: anyone with the password can sign in as any user, admins included.
- `ADMIN_EMAILS =` in .env has a space before "="; check the Vercel value is set and read correctly.

Family chart
- Layout: each person appears once, so someone married into another branch sits away from their own parents, and the line across can cross other lines on big trees. Consider a proper layout engine (e.g. elkjs) or an option to "show this person's own family".
- Several marriages: children of all marriages hang from one stem. Group children per marriage (one stem per red line), and mark half-siblings.
- Add a small legend for the lines (red = married, green = parent–child, black = siblings). Also vary the line style (e.g. dashed for married), since red and green look alike to colour-blind users.
- Zoom: pinch-to-zoom and Ctrl+scroll, a "fit whole tree" button, and remember the zoom per tree.
- Open the chart centred on "me" when set, instead of the oldest couple.
- Big trees: collapse/expand branches, and a search box that finds a person and centres the chart on them.
- Show each person's relationship to "me" (father, cousin, uncle by marriage…). This also feeds the mawaris calculator.
- Print / download the chart as an image or PDF.
- Screen readers: the lines are hidden from them, so offer a text version of the family (the old outline list) next to the chart.
- No browser tests cover the chart: add Playwright screenshot tests for pyramid, upside down, zoom and a married-in branch.

People and sharing
- When someone accepts an invitation, ask "Which person are you?" so their "This is me" is set right away.
- Adding a second parent: offer to record the two parents as married in the same step.
