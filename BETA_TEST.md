# SOW Web App — Beta Test Procedure
### T1. Open the app

** Steps: **

1. Open `https://script.google.com/a/macros/asgllc.com/s/AKfycbzizEVp3t8FMF8Zo9dUyNsexztPGTNTJ49C-cbDHGPI9WW_ZQnJe6-KBoWGgGdHqkw/ exec`
in a private/incognito window while signed in with your org account.
2. Open it again while NOT signed in.

** Expected: ** - Signed in: app loads to the project chooser within a few seconds. - Not signed in:
you are prompted to sign in (Google login), then land on the chooser. - No permission/authorization
prompts appear for the tester (the app runs as the owner).

---

## 2. Chooser page

### T2. Chooser behavior

** Steps: **

1. Verify the project list loads existing projects (sorted, no duplicates).
2. Click ** New Project ** → verify you land on the create form.
3. Go back (Cancel) and click ** Edit This Project ** with nothing selected → verify a sensible error/warning.
4. Select a project → click ** Edit This Project ** → verify the edit page opens for that project.

** Expected: ** Navigation works; list is accurate; no blank rows or error text.

---

## 3. Create new SOW

Use this sample data consistently for the main run (use your own project title, e.g. append your
initials so you don't collide):

- Project Title: `Beta Create <YourInitials> - 2026-08`
- Customer: `Beta Test Co.`
- Quote #: `<<any number over 10000>>`

*** You'll be notified of any required fields you don't fill in
*** Executive Summary, Customer Installation Address, Pre-requisites, and Work Breakdown are all optional fields
(not required up front) so the SOW can be initially created without them but to be filled later as they are title
sections.

- Professional Services Quote Amount: `50000`
- Cost Breakdown: ** Yes **, items 1–3 = `50% / 30% / 20%`

### C1. Required-field validation

** Steps: **

1. Clear ** Project Title ** and ** Customer **.
2. Click ** Create/Submit **.

** Expected: ** Both fields highlight red, first error is focused and scrolled to, submit is blocked,
a toast says "Fix highlighted fields before submitting."

### C2. Field-type validation

** Steps: **

1. VAM Email: type `not-an-email` → blur.
2. VAM Phone: type `123` → blur.
3. Customer Contact Email: type `a@b` → blur.
4. Quote Amount: type `abc`.

** Expected: ** Email/phone show error messages on blur; invalid values are rejected at submit; valid
values auto-format (phone → `(555) 123-4567` [US only right now, international later, still working on
it], amount → `50,000.00`).

### C3. Multiple install sites

** Steps: **

1. Leave toggle ** No ** → verify Additional Customer Installation Address field is hidden.
2. Toggle ** Yes ** → field appears; enter `100 Beta Way, Denver CO`.
3. Toggle back to ** No ** → verify the address field is cleared.

** Expected: ** Toggle reveal/clear behavior matches; doc reflects final state.

### C4. Bill of Materials (BoM)

** Steps: **

1. Toggle BoM ** No ** → verify BoM block hidden.
2. Toggle ** Yes ** → verify only row 1 is visible; enter Service + Deliverable for rows 1–3 and verify 
rows progressively appear up to (highest filled)+1.
3. Try to submit with row 1 Service ** empty ** while BoM is Yes.

** Expected: ** Row 1 is required when Yes (error); rows 2–10 optional; progressive reveal shows one
empty row beyond the last filled one.

### C5. Work Breakdown

** Steps: **

1. Enter steps for 2.1, 2.2, 2.3, then skip to 2.7.
2. Verify fields 2.4–2.6 and 2.8–2.10 behavior (progressive reveal shows next empty; a gap is allowed).

** Expected: ** WB rows collect in order; the generated doc lists only non-empty rows in order 2.1 →
2.10.

### C6. Cost Breakdown percent logic

** Steps: **

1. Quote Amount = `50000`; set breakdown ** Yes **.
2. Enter `50 / 30 / 20` → verify amounts show `$25,000.00 / $15,000.00 / $10,000.00`.
3. Change item 3 to `25` (total 105) → verify over-100% modal appears immediately.
4. Try to submit with total over 100 → verify hard block (no submit).
5. Set `50 / 30 / 10` (total 90) → submit → verify soft-warn modal "under 100%" with ** Submit anyway ** option.
6. Verify item 4 appears only when earlier percents sum < 100 or it has data.

** Expected: ** Amounts always equal Quote Amount × %; live over-100% guard; submit-time >100 block;
<100 warn; =100 proceeds; items 4–5 reveal per the rule.

### C7. Duplicate title (client + server)

** Steps: **

1. Type a title that already exists in the list.
2. Blur the field → verify the duplicate warning.
3. Attempt submit anyway → verify server blocks it with the duplicate-title error.

** Expected: ** Duplicate titles are caught on blur and re-caught server-side on submit; form stays on
the page.

### C8. Submit → doc generation

** Steps: **

1. With all data filled (see sample), submit.
2. Note the result overlay and any doc link.

** Expected: ** Success overlay; a doc link is returned; you are redirected back to the chooser and
the new project appears in the list.

---

## 4. Doc verification — created doc (all testers)

> Open the generated doc from the success overlay. Filename should be `Beta Test Co. - Beta Create XX
> - 2026-08 SOW - Rev 1`.

### D1. Placeholders

** Steps: **

1. Check the header/first page: customer name, project title, quote number, contact
names/emails/phones, install address, exec summary, pre-reqs, quote amount.

** Expected: ** All populated from the form; no literal `{{...}}` remains anywhere (search the doc for
`{{`).

### D2. Bill of Materials (BoM) section

** Steps: **

1. Verify a 2-column table with header ** Service | Deliverable **.
2. Verify rows 1–3 match the form; verify header font is larger than body font.

** Expected: ** Table renders under the "Bill of Materials" heading; only non-empty rows appear; fonts
match the rest of the doc.

### D3. Work Breakdown section

** Steps: **

1. Verify a single-column table listing only the non-empty WB entries in order.

** Expected: ** Table renders under the template's own heading; only non-empty entries; content font
matches.

### D4. Additional Customer Installation Address

** Steps: **

1. Since you toggled multiple sites ** No **, verify this section is ** absent **.
2. Edit the same project, toggle multi-sites ** Yes ** with an address, save, and verify the section now
appears as a Heading 4 with the address.

** Expected: ** Section is present only when a second address exists; heading + address styled like
the rest of the doc.

### D5. Cost Breakdown verbiage — Yes

** Steps: **

1. Verify the block reads:

   > Professional Services for this engagement are $50,000.00 and will be invoiced according to the
   > following schedule:
   >
   >     1. Item Name - 50% ($25,000.00) - Explanation
   >     2. Item Name - 30% ($15,000.00) - Explanation
   >     3. Item Name - 20% ($10,000.00) - Explanation
   >
   > Travel and expenses are included in the Professional Services fee.

2. Verify the item lines are indented and use the same font as surrounding text.

** Expected: ** Exact verbiage; numbers match Quote Amount × %; lines indented; fonts consistent.

### D6. Cost Breakdown verbiage — No

** Steps: **

1. Create a second project with breakdown ** No ** and Quote Amount `25000`.

** Expected: ** Doc shows a single paragraph:

"Professional Services for this engagement are $25,000.00.  Travel and expenses are included in
the Professional Services fee."

---

## 5. Edit path (all testers)

Use a separate project for edits (each tester uses their own initials): Customer `Beta Edit Co.`,
Project Title `Beta Edit <YourInitials> - 2026-08-07`, Quote Amount `75000`.

### E1. Load & populate

** Steps: **

1. Open the project you just created in the edit page.
2. Verify every field repopulates exactly (including BoM rows, Work Breakdown rows, Quote
Breakdown 4/5 fields, toggles).

** Expected: ** All fields match the saved values; toggles are derived from content (BoM Yes if any
row has data, breakdown Yes if any item has data).

### E2. Rename + save

** Steps: **

1. Change the Project Title (e.g. append `- edited`).
2. Save.

** Expected: ** Save button enabled only after a change; doc regenerates with the new title; no
duplicate-title false-positive against itself.

### E3. No-change / cancel behaviors

** Steps: **

1. Open the edit page, make ** no ** changes, click Save → verify "No Changes to Save" modal →
"Return to Main Page".
2. Make changes, click Cancel → verify Discard Changes modal → confirm discards and returns.

** Expected: ** Dirty-tracking is correct; modals appear only when appropriate.

### E4. Breakdown Yes → No round-trip

** Steps: **

1. Open a project with breakdown ** Yes **; toggle to ** No ** → verify all item fields clear.
2. Save → regenerate → verify the doc shows the ** No ** one-liner and no breakdown items remain.
3. Re-open the project → toggle ** Yes ** again → verify items start blank and reveal
progressively.

** Expected: ** No stale breakdown data survives the round-trip; doc reflects No.

### E5. BoM Yes → No round-trip

** Steps: **

1. Same as E4 for BoM: clear rows on No, doc loses the BoM section, re-toggle shows empty row 1.

** Expected: ** BoM data is fully cleared on No and not resurrected on re-load.

### E6. Percent edit + server backstop

** Steps: **

1. In an edit, set breakdown percents totaling 110% and try to save.
2. Bypass the client UI if needed by saving directly (server-side guard).

** Expected: ** Client blocks >100%; server `validatePercents_` also throws with a friendly error
(soft failure shows "changes saved, document did NOT regenerate" only if the row write happened
first — verify which outcome occurs and that the sheet was/wasn't updated appropriately).

### E7. Regeneration + revision numbering

** Steps: **

1. Make a small change and save 3+ times.
2. Check the Drive folder after each save.

** Expected: ** Each save creates `... - Rev N` with N incrementing; only the 3 most recent revisions
exist (older ones trashed). The most recent doc reflects the latest data.

---

## 6. Edge cases (all testers)

### EDGE-1. BoM data in later rows only

** Steps: **

1. Create a project with BoM ** Yes ** but only rows 3–4 filled (rows 1–2 blank), plus
breakdown ** No **.

** Expected: ** On edit load, BoM toggle derives ** Yes ** (data found in any row); no data loss on
save.

### EDGE-2. Breakdown data starting at item 4

** Steps: **

1. Create a project where only bq4/bq5 have values (via direct manipulation or by filling then
clearing earlier items).

** Expected: ** On edit load, breakdown toggle derives ** Yes **; items 4–5 repopulate and reveal; doc
lists only those items.

### EDGE-3. Blank quote amount

** Steps: **

1. Create a project with no quote amount but breakdown ** Yes ** with percents.

** Expected: ** No crash; doc shows `$` with an empty amount; percents still listed. (Flag as cosmetic
issue, not blocking.)

### EDGE-4. Zero-percent items

**Steps:**

1. Create a project with an item at `0%`.

**Expected:** Item renders (`0% ($0.00)`); totals logic treats it as 0.

### EDGE-5. Percent decimals

**Steps:**

1. Enter `33.33 / 33.33 / 33.34` (total 100).

**Expected:** No false over-100% block (float epsilon); doc shows each percent as entered.

### EDGE-6. Concurrent testers

**Steps:**

1. Both testers create/edit different projects at the same time.

**Expected:** No cross-contamination; each project keeps its own row and doc; no duplicate-title
collisions with distinct titles.

---

## 7. Data integrity check (owner only, so, optional for testing)

### S1. Spreadsheet row check

**Steps:**

1. Open the sheet `Form Responses 2` and find the test rows.
2. Verify: - Columns B–AJ match the form fields (A = timestamp). - BoM/WB/bq4-5 extension columns (AP–BR) hold the expected
values. - Formula columns AM/AN/AO (Br1/2/3 Amount) still contain formulas (not clobbered).
3. Edit a row in the sheet directly, then open it in the edit page → verify it loads.

### S2. Drive folder check

**Steps:**

1. Confirm all generated test docs landed in the configured Drive folder with correct naming.
2. Confirm the 3-revision retention worked (older revs trashed).

---

## 8. Cleanup (each tester, then owner)

- [ ] Each tester: delete/trash the docs they created in Drive (or owner trashes them). - [ ] Owner:
delete the test rows from the sheet (keep at least one row as a reference if desired). - [ ] Owner:
remove any trashed test docs permanently or empty the trash. - [ ] Owner: note whether to keep the
beta deployment or replace it with a fresh one for the next round.

---

## 9. Bug reporting

For each issue found, report:

1. **Severity:** Blocker (stops the flow) / Major (wrong data or broken behavior) / Minor (cosmetic
or wording).
2. **Steps to reproduce** (which tester, which project data).
3. **Expected vs actual**
(include the exact text from the doc or screen).
4. **URL of the failing page** (create vs edit).
5. **Name of the generated doc** (helps trace revisions).

## 10. Sign-off

- [ ] **Tester 1:** full suite (create, doc verification, edit/regeneration, edge cases) passes.
- [ ] **Tester 2:** full suite (create, doc verification, edit/regeneration, edge cases) passes.
- [ ] Owner: data-integrity checks pass; blockers (if any) triaged.
