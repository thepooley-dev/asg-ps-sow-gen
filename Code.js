/**
 * Reads an HTML file's raw content so it can be embedded inside another
 * template via <?!= include('filename') ?>. Filename has no extension.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
/**
 * Shared configuration: spreadsheet, doc template, and archive folder.
 * Keep IDs in one place so create/update/doc-gen can't drift apart.
 */
const CONFIG = {
  SPREADSHEET_ID: "1hqPT5nBRnN85Iz__8i6uJkrsLBktcQ38xNSE-VMfft4",
  SHEET_NAME: "Form Responses 2",
  DOC_TEMPLATE_ID: "1bJW6i4t5NR4Lub055CGRgzk14USX_fExN6BRfklBqhM",
  DOC_FOLDER_ID: "1jTj8ngBPk5FUP9W7ZQj8Opja7uRihefi",
  // Column positions for the quote-breakdown derived amounts. These are
  // formula cells in the sheet (cols AM/AN/AO) that recalc on their own;
  // kept for reference — doc-gen now computes amounts from Quote × %.
  BR_AMOUNT_COLS: [39, 40, 41],
  // COMMENTED OUT — BoM removal: Bill of Materials storage is disabled.
  // The legacy bom textarea column (S) is now BoM row-1 Service.
  // Deliverable for row 1 plus Service+Deliverable for rows 2-10 live
  // in the extension columns, two per row, starting at col AP (42).
  // Columns are 1-indexed sheet positions.
  // BOM_START_COL: 42,
  // Start of the extension columns written after the formula block (col BI).
  // Was BOM_START_COL (42) when BoM occupied AP-BH; now points directly
  // at the WB 2.7 column since BoM columns are unused.
  BOM_START_COL: 61,
  // First of the Work Breakdown 2.7-2.10 columns (col BI). 1-indexed.
  WB7_START_COL: 61,
  // Last of the extension columns (bq5Pct, col BR). 1-indexed.
  LAST_EXT_COL: 70
};
/**
 * Opens the data sheet. Single access point so callers never hardcode
 * the spreadsheet ID or sheet name.
 */
function getDataSheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
}
/**
 * Builds the full column values for a project row from the form payload.
 * Index 0 = Timestamp (col A), indices 1..35 = form fields (cols B..AJ).
 * Shared by createRow (appendRow) and updateRow (batch write).
 */
function buildRowValues_(formData) {
  const columnValues = [
    new Date(),                 // A  Timestamp / LastModifiedDate
    formData.projectTitle,      // B
    formData.customer,          // C
    formData.quoteNum,          // D
    formData.vamName,           // E
    formData.vamEmail,          // F
    formData.vamPhone,          // G
    formData.asgPmName,         // H
    formData.asgPmEmail,        // I
    formData.asgPmPhone,        // J
    formData.ccName,            // K
    formData.ccTitle,           // L
    formData.ccEmail,           // M
    formData.ccPhone,           // N
    formData.installAddr,       // O
    formData.multiSites,        // P
    formData.addAddr,           // Q
    formData.execSummary,       // R
    // COMMENTED OUT — BoM removal: bom1Service was col S
    // formData.bom1Service,    // S
    "",                         // S (BoM disabled)
    formData.prereqs,           // T
    formData.wb21,              // U
    formData.wb22,              // V
    formData.wb23,              // W
    formData.wb24,              // X
    formData.wb25,              // Y
    formData.wb26,              // Z
    formData.quoteAmt,          // AA
    formData.bq1,               // AB
    formData.bq1Summary,        // AC
    formData.bq1Pct,            // AD
    formData.bq2,               // AE
    formData.bq2Summary,        // AF
    formData.bq2Pct,            // AG
    formData.bq3,               // AH
    formData.bq3Summary,        // AI
    formData.bq3Pct             // AJ
  ];
  // Normalize undefineds so blank fields land as empty strings, not "undefined"
  return columnValues.map(function(v) {
    return (v === undefined || v === null) ? "" : v;
  });
}
/**
 * Builds the values for the extension columns that live AFTER the formula
 * columns (AK..AO). Written starting at CONFIG.BOM_START_COL (61 / BI).
 * Kept separate from buildRowValues_ so createRow and updateRow can write
 * them with their own range and never clobber the formula cells in between.
 */
function buildRowExtensions_(formData) {
  // COMMENTED OUT — BoM removal: BoM columns (AP..BH) are no longer written.
  // Extension columns now start at BI (BOM_START_COL = 61) with WB 2.7-2.10
  // followed by bq4/bq5.
  var extValues = [
    formData.wb27,             // BI (61)
    formData.wb28,             // BJ (62)
    formData.wb29,             // BK (63)
    formData.wb210,            // BL (64)
    formData.bq4,              // BM (65)
    formData.bq4Summary,       // BN (66)
    formData.bq4Pct,           // BO (67)
    formData.bq5,              // BP (68)
    formData.bq5Summary,       // BQ (69)
    formData.bq5Pct            // BR (70)
  ];
  return extValues.map(function(v) {
    return (v === undefined || v === null) ? "" : v;
  });
}
/**
 * Makes sure the sheet has enough columns for the extension columns.
 * A no-op once the columns exist (the common case), but protects against
 * writing past the sheet's current column capacity on first use.
 */
function ensureColumns_(sheet) {
  const needed = CONFIG.LAST_EXT_COL; // last extension column (BR)
  if (sheet.getMaxColumns() < needed) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), needed - sheet.getMaxColumns());
  }
}
/**
 * Creates a new row from the New Project form payload, then generates its doc.
 * Column layout mirrors updateRow(): index 0 = Timestamp (col A),
 * indices 1..35 = form fields (cols B..AJ). Formula columns AM/AN/AO
 * (Br1/2/3 Amount) recalculate automatically after the row is written.
 * Revision numbering is handled by generateDocForRow via the Drive folder scan.
 *
 * @param {Object} formData - keyed the same as updateRow's formData argument.
 * @return {Object} { rowIndex }
 */
function createRow(formData) {
  const sheet = getDataSheet_();
  // Reject blank or duplicate project titles before writing anything.
  // Project Title is the implicit unique key everywhere else in this app
  // (dropdown, updateRow, getRawRowData), so it must stay unique.
  const submittedTitle = (formData.projectTitle || "").toString().trim();
  if (!submittedTitle) {
    throw new Error("Project Title is required.");
  }
  if (projectTitleExists_(sheet, submittedTitle)) {
    throw new Error(
      "A project titled \"" + submittedTitle + "\" already exists. " +
      "Please choose a different title, or go back and edit the existing project."
    );
  }
  // NEW: server-side backstop for the client-side percent rules.
  validatePercents_(formData);
  ensureColumns_(sheet);
  const rowToWrite = buildRowValues_(formData);
  const rowExtensions = buildRowExtensions_(formData);
  // Append in one shot — preserves the formula columns AM/AN/AO downstream
  sheet.appendRow(rowToWrite);
  const newRow = sheet.getLastRow();
  // Write the extension columns (AP..BR) with a separate range so the
  // formula columns between (AK..AO) are never touched. Writing past
  // the current last column expands the sheet.
  sheet.getRange(newRow, CONFIG.BOM_START_COL, 1, rowExtensions.length)
    .setValues([rowExtensions]);
  SpreadsheetApp.flush(); // let the Br1/2/3 Amount formula cells settle before doc gen
  // Same result shape as updateRow — sheet write is done and can't be rolled
  // back at this point, so doc-gen failure is soft, not hard.
  const result = {
    ok: true,
    savedToSheet: true,
    docGenerated: false,
    docUrl: null,
    docError: null,
    rowIndex: newRow
  };
  try {
    const docInfo = generateDocForRow(newRow);
    result.docGenerated = true;
    result.docUrl = (docInfo && docInfo.docUrl) ? docInfo.docUrl : null;
  } catch (docErr) {
    Logger.log('createRow: doc generation failed for row ' + newRow + ': ' + docErr);
    result.docError = (docErr && docErr.message) ? docErr.message : String(docErr);
  }
  return result;
}
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page)
    ? String(e.parameter.page).toLowerCase()
    : '';
  if (page === 'new') {
    return HtmlService.createTemplateFromFile('NewDataPage').evaluate()
      .setTitle('New Project')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (page === 'edit') {
    const template = HtmlService.createTemplateFromFile('EditDataPage');
    template.projectName = (e && e.parameter && e.parameter.project)
      ? String(e.parameter.project)
      : '';
    return template.evaluate()
      .setTitle('Edit Project')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createTemplateFromFile('ChooserPage').evaluate()
    .setTitle('Edit an Existing Project')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function getProjectList() {
  const sheet = getDataSheet_();
  // Guard against an empty sheet (only the header row, or nothing at all).
  // getRange(..., 0) throws, so we bail out with an empty list instead.
  if (sheet.getLastRow() < 2) {
    return [];
  }
  const values = sheet.getRange(2, 2, sheet.getLastRow() - 1).getValues();
  return values.flat().filter(String);
}
/**
 * Helper function that returns raw array values for a project title,
 * indexed by column position (0 = col A). Matches the layout in
 * buildRowValues_() so the edit page can populate its fields.
 */
function getRawRowData(projectTitle) {
  const sheet = getDataSheet_();
  const data = sheet.getDataRange().getValues();
  const target = (projectTitle || "").toString().trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    const cellValue = (data[i][1] || "").toString().trim().toLowerCase();
    if (cellValue === target) {
      // Convert every cell to a plain string — strips out Date objects,
      // formula errors, or anything else that might fail to serialize.
      return data[i].map(function(cell) {
        return (cell === null || cell === undefined) ? "" : cell.toString();
      });
    }
  }
  return null;
}
function updateRow(originalProjectTitle, formData) {
  const sheet = getDataSheet_();
  const data = sheet.getDataRange().getValues();
  const target = (originalProjectTitle || "").toString().trim().toLowerCase();
  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    const cellValue = (data[i][1] || "").toString().trim().toLowerCase();
    if (cellValue === target) {
      targetRow = i + 1; // sheet rows are 1-indexed
      break;
    }
  }
  if (targetRow === -1) {
    throw new Error("Could not find a row for project: " + originalProjectTitle);
  }
  // Reject blank titles and duplicates that collide with a DIFFERENT row.
  // Mirrors createRow's guard, but excludes the row being edited so renaming
  // a project to its own current title doesn't false-positive.
  const submittedTitle = (formData.projectTitle || "").toString().trim();
  if (!submittedTitle) {
    throw new Error("Project Title is required.");
  }
  if (projectTitleExists_(sheet, submittedTitle, targetRow)) {
    throw new Error(
      "A project titled \"" + submittedTitle + "\" already exists. " +
      "Please choose a different title."
    );
  }
  // Server-side backstop for the client-side percent rules. Throws BEFORE we write.
  validatePercents_(formData);
  ensureColumns_(sheet);
  const columnValues = buildRowValues_(formData);
  const rowExtensions = buildRowExtensions_(formData);
  // One batched write instead of one call per cell. Index 0 = col A, which
  // also refreshes the Timestamp / {{LastModifiedDate}}. The extension
  // columns (AP..BR) are written separately so the formula columns
  // between (AK..AO) are never touched.
  sheet.getRange(targetRow, 1, 1, columnValues.length).setValues([columnValues]);
  sheet.getRange(targetRow, CONFIG.BOM_START_COL, 1, rowExtensions.length)
    .setValues([rowExtensions]);
  SpreadsheetApp.flush(); // make sure formula cells (Br1/2/3 Amount) settle before doc gen
  // Sheet write succeeded. From here on, doc-gen failure is a SOFT failure
  // (row is safely saved) — surface it to the client instead of lying.
  const result = {
    ok: true,
    savedToSheet: true,
    docGenerated: false,
    docUrl: null,
    docError: null,
    rowIndex: targetRow
  };
  try {
    const docInfo = generateDocForRow(targetRow);
    result.docGenerated = true;
    result.docUrl = (docInfo && docInfo.docUrl) ? docInfo.docUrl : null;
  } catch (docErr) {
    Logger.log("updateRow: doc generation failed for row " + targetRow + ": " + docErr);
    result.docError = (docErr && docErr.message) ? docErr.message : String(docErr);
  }
  return result;
}
function trimTrailing(value) {
  if (value === null || value === undefined) return "";
  // Convert to string, then strip trailing whitespace of any kind:
  // spaces, tabs, newlines, carriage returns, non-breaking spaces (\u00A0),
  // zero-width spaces (\u200B), and other unicode whitespace.
  return String(value).replace(/[\s\u00A0\u200B]+$/g, "");
}
function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  var num = Number(String(value).replace(/[^0-9.\-]/g, ""));
  if (isNaN(num)) return "";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
function generateDocForRow(rowNumber) {
  // throw new Error("simulated doc-gen failure");
  var sheet = getDataSheet_();
  var lastCol = sheet.getLastColumn();
  var row = sheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];
  // COMMENTED OUT — BoM removal: Bill of Materials rows disabled.
  // var bomRows = [];
  // for (var b = 1; b <= 10; b++) {
  //   var bomServiceCol = (b === 1) ? 19 : CONFIG.BOM_START_COL + (b - 2) * 2 + 1;
  //   var bomDeliverableCol = (b === 1) ? CONFIG.BOM_START_COL : CONFIG.BOM_START_COL + (b - 2) * 2 + 2;
  //   var bomService = trimTrailing(row[bomServiceCol - 1]);
  //   var bomDeliverable = trimTrailing(row[bomDeliverableCol - 1]);
  //   if (bomService || bomDeliverable) {
  //     bomRows.push({ service: bomService, deliverable: bomDeliverable });
  //   }
  // }
  // Work Breakdown rows in display order: wb21-wb26 live in the base row
  // (indices 20-25), wb27-wb210 in the extension columns (BI..BL).
  var wbRows = [];
  for (var w = 1; w <= 10; w++) {
    var wbIdx = (w <= 6) ? (w + 19) : (CONFIG.WB7_START_COL - 1 + (w - 7));
    var wbVal = trimTrailing(row[wbIdx]);
    if (wbVal) wbRows.push(wbVal);
  }
  // Cost breakdown items. Items 1-3 live in the base row (indices 27/30/33),
  // items 4-5 in the extension columns (indices 64/67). Each item is included
  // when any of its Item / Summary / % fields has content. The rendered amount
  // is Quote Amount × % so the doc always matches the form preview.
  var quoteAmt = Number(String(row[26] || "").replace(/[^0-9.\-]/g, "")) || 0;
  var costBases = [27, 30, 33, 64, 67];
  var costItems = [];
  for (var q = 0; q < costBases.length; q++) {
    var costName = trimTrailing(row[costBases[q]]);
    var costExplanation = trimTrailing(row[costBases[q] + 1]);
    var costPct = trimTrailing(row[costBases[q] + 2]).replace(/%$/, "").trim();
    if (costName || costExplanation || costPct) {
      var costPctNum = parseFloat(costPct);
      if (isNaN(costPctNum)) costPctNum = 0;
      costItems.push({
        name: costName,
        explanation: costExplanation,
        pct: costPct,
        amount: formatMoney(quoteAmt * (costPctNum / 100))
      });
    }
  }
  var customerName = row[2] || "";
  var projectTitle = row[1] || "";
  var baseFileName = customerName + " - " + projectTitle + " SOW";
  var targetFolder = DriveApp.getFolderById(CONFIG.DOC_FOLDER_ID);
  // Find the highest existing revision, collecting matching files as we go
  // so the purge step below can reuse this list instead of re-scanning the
  // folder a second time.
  var revPattern = new RegExp(
    "^" + baseFileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " - Rev (\\d+)$"
  );
  var existingFiles = targetFolder.getFiles();
  var maxRev = 0;
  var matchingFiles = []; // { file, rev } for this baseFileName only
  while (existingFiles.hasNext()) {
    var f = existingFiles.next();
    var match = f.getName().match(revPattern);
    if (match) {
      var n = parseInt(match[1], 10);
      matchingFiles.push({ file: f, rev: n });
      if (n > maxRev) maxRev = n;
    }
  }
  var revisionNumber = maxRev + 1;
  var finalFileName = baseFileName + " - Rev " + revisionNumber;
  // Make the copy. If THIS step throws, there is no stale file to clean up.
  var templateFile = DriveApp.getFileById(CONFIG.DOC_TEMPLATE_ID);
  var copyFile = templateFile.makeCopy(finalFileName, targetFolder);
  var targetDocId = copyFile.getId();
  var data = {
    "{{LastModifiedDate}}": row[0] ? Utilities.formatDate(new Date(row[0]), "America/Denver", "MMMM d, yyyy") : "",
    "{{ProjectTitle}}": trimTrailing(projectTitle),
    "{{CustomerAccountName}}": trimTrailing(customerName),
    "{{QuoteNumber}}": trimTrailing(row[3]),
    "{{VendorAccountManager}}": trimTrailing(row[4]),
    "{{VAMEmail}}": trimTrailing(row[5]),
    "{{VAMPhone}}": trimTrailing(row[6]),
    "{{ASGPMName}}": trimTrailing(row[7]),
    "{{ASGPMEmail}}": trimTrailing(row[8]),
    "{{ASGPMPhone}}": trimTrailing(row[9]),
    "{{CustomerContactName}}": trimTrailing(row[10]),
    "{{CustomerContactTitle}}": trimTrailing(row[11]),
    "{{CCEmail}}": trimTrailing(row[12]),
    "{{CCPhone}}": trimTrailing(row[13]),
    "{{InstallAddress}}": trimTrailing(row[14]),
    "{{ExecSummary}}": trimTrailing(row[17]),
    "{{PreReqs}}": trimTrailing(row[19]),
    "{{ProSvcsQuoteAmt}}": formatMoney(row[26]),
    // {{CostBreakdown}} is consumed by renderCostBreakdown_ (the marker is
    // replaced with the conditional verbiage, not with text from this map),
    // so it is intentionally NOT replaced in the loop below. The legacy
    // per-item placeholders map to empty strings so a template that hasn't
    // been updated yet degrades to a blank section instead of showing literal
    // {{...}} text.
    "{{CostBreakdown1}}": "",
    "{{CostExplanation1}}": "",
    "{{Br1Pct}}": "",
    "{{CostBreakdown2}}": "",
    "{{CostExplanation2}}": "",
    "{{Br2Pct}}": "",
    "{{CostBreakdown3}}": "",
    "{{CostExplanation3}}": "",
    "{{Br3Pct}}": "",
    "{{Br1Amount}}": "",
    "{{Br2Amount}}": "",
    "{{Br3Amount}}": "",
    "{{RevNumber}}": revisionNumber.toString()
  };
  // If placeholder replacement fails midway, throw — but first trash the
  // half-populated copy so we don't leave a stale doc sitting in Drive with
  // {{...}} placeholders showing.
  try {
    var newDoc = DocumentApp.openById(targetDocId);
    var body = newDoc.getBody();
    var header = newDoc.getHeader();
    var footer = newDoc.getFooter();
    // COMMENTED OUT — BoM removal: Bill of Materials rendering disabled.
    // if (bomRows.length) {
    //   renderBomTable_(body, bomRows);
    // } else {
    //   removeBomSection_(body);
    // }
    // Additional installation address: rendered as a Heading 4 title plus the
    // address only when the project has a second install address; the whole
    // section is removed otherwise.
    var additionalAddress = trimTrailing(row[16]);
    if (additionalAddress) {
      renderAdditionalAddress_(body, additionalAddress);
    } else {
      removeAdditionalAddress_(body);
    }
    // Work Breakdown: required section, rendered as a single-column table
    // (one row per non-empty wb entry). Always renders when there is at
    // least one entry; the placeholder is dropped if there are none.
    if (wbRows.length) {
      renderWorkBreakdownTable_(body, wbRows);
    } else {
      removeWorkBreakdown_(body);
    }
    // Cost breakdown: rendered as conditional verbiage under the
    // {{CostBreakdown}} placeholder — the single-sentence "No" wording when
    // the project has no items, or the "Yes" wording (schedule intro, item
    // lines, closing sentence) when it does. The section always renders.
    renderCostBreakdown_(body, costItems, quoteAmt);
    for (var placeholder in data) {
      if (body) body.replaceText(placeholder, data[placeholder]);
      if (header) header.replaceText(placeholder, data[placeholder]);
      if (footer) footer.replaceText(placeholder, data[placeholder]);
    }
    newDoc.saveAndClose();
    Logger.log("Successfully generated document: " + finalFileName);
  } catch (error) {
    Logger.log("generateDocForRow error during replacement: " + error.toString());
    try {
      copyFile.setTrashed(true);
      Logger.log("Trashed incomplete copy: " + finalFileName);
    } catch (cleanupErr) {
      Logger.log("Could not trash incomplete copy '" + finalFileName + "': " + cleanupErr);
    }
    // RETHROW so the caller (createRow / updateRow) can surface it.
    throw error;
  }
  // Purge everything older than the 3 most recent revisions, reusing the
  // matchingFiles list from the scan above instead of re-scanning the
  // folder. If this fails, don't let it poison an otherwise-successful doc
  // generation.
  try {
    var cutoff = revisionNumber - 3;
    if (cutoff > 0) {
      for (var mi = 0; mi < matchingFiles.length; mi++) {
        if (matchingFiles[mi].rev <= cutoff) {
          matchingFiles[mi].file.setTrashed(true);
          Logger.log("Purged old archive file: " + matchingFiles[mi].file.getName());
        }
      }
    }
  } catch (purgeErr) {
    Logger.log("Old-revision purge failed (non-fatal): " + purgeErr);
  }
  return {
    docUrl: copyFile.getUrl(),
    fileName: finalFileName,
    revisionNumber: revisionNumber
  };
}
/**
 * COMMENTED OUT — BoM removal: renderBomTable_ is disabled.
 * Inserts the Bill of Materials table into the copied doc, directly after
 * the {{BoM}} placeholder paragraph, then removes that (now empty)
 * paragraph. The template already provides the "Bill of Materials" heading.
 *
 * @param {Body} body - the copied document's body
 * @param {Array<{service: string, deliverable: string}>} rows - BoM rows
 */
// function renderBomTable_(body, rows) {
//   var search = body.findText("{{BoM}}");
//   if (!search) return;
//   var para = search.getElement();
//   while (para && para.getType() !== DocumentApp.ElementType.PARAGRAPH) {
//     para = para.getParent();
//   }
//   if (!para) return;
//   var idx = body.getChildIndex(para);
//   var leftover = para.getText().replace("{{BoM}}", "").trim();
//   if (leftover) {
//     var clone = para.copy();
//     body.insertParagraph(idx, clone);
//     var found = clone.findText("{{BoM}}");
//     if (found) {
//       clone.asText().deleteText(found.getStartOffset(), found.getEndOffsetInclusive());
//     }
//     clone.setHeading(DocumentApp.ParagraphHeading.HEADING4);
//     idx = body.getChildIndex(para);
//   } else if (!hasHeading_(body, "Bill of Materials")) {
//     body.insertParagraph(idx, "Bill of Materials")
//       .setHeading(DocumentApp.ParagraphHeading.HEADING4);
//     idx = body.getChildIndex(para);
//   }
//   var cells = [["Service", "Deliverable"]];
//   for (var i = 0; i < rows.length; i++) {
//     cells.push([rows[i].service, rows[i].deliverable]);
//   }
//   var table = body.insertTable(idx, cells);
//   table.setColumnWidth(0, 140);
//   table.setColumnWidth(1, 320);
//   var normal = normalTextFont_(body);
//   for (var r = 0; r < table.getNumRows(); r++) {
//     var row = table.getRow(r);
//     for (var c = 0; c < row.getNumCells(); c++) {
//       var cellText = row.getCell(c).editAsText();
//       if (normal.family) cellText.setFontFamily(normal.family);
//       if (normal.size) cellText.setFontSize(normal.size);
//     }
//   }
//   var headerRow = table.getRow(0);
//   for (var c = 0; c < headerRow.getNumCells(); c++) {
//     var headerText = headerRow.getCell(c).editAsText();
//     headerText.setBold(true);
//     if (normal.size) headerText.setFontSize(normal.size + 1);
//   }
//   para.removeFromParent();
// }
/**
 * Reads the font (family + size) that the doc's body content uses, taken
 * from an existing content placeholder paragraph (Exec Summary, Pre-reqs,
 * or Work Breakdown). This matches the actual font of those sections rather
 * than the body's default attributes, which Apps Script often reports
 * without a font family. Falls back to the body defaults if none of the
 * content paragraphs are found.
 *
 * @param {Body} body - the copied document's body
 * @returns {{family: string, size: number}}
 */
function normalTextFont_(body) {
  var markers = ["{{ExecSummary}}", "{{PreReqs}}", "{{WorkBreakdown}}", "{{CostBreakdown}}"];
  for (var i = 0; i < markers.length; i++) {
    var search = body.findText(markers[i]);
    if (!search) continue;
    var el = search.getElement();
    while (el && el.getType() !== DocumentApp.ElementType.PARAGRAPH) {
      el = el.getParent();
    }
    if (!el) continue;
    var attrs = el.getAttributes();
    return {
      family: attrs[DocumentApp.Attribute.FONT_FAMILY],
      size: attrs[DocumentApp.Attribute.FONT_SIZE]
    };
  }
  var defaults = body.getAttributes();
  return {
    family: defaults[DocumentApp.Attribute.FONT_FAMILY],
    size: defaults[DocumentApp.Attribute.FONT_SIZE]
  };
}
/**
 * Normalizes heading text for comparison: lowercases, trims trailing
 * punctuation, and collapses inner whitespace so "Bill of Materials:"
 * and "Bill   of Materials" still match the expected heading text.
 *
 * @param {string} text - raw paragraph text
 * @returns {string}
 */
function normalizeHeadingText_(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s:;.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
/**
 * Returns true if the given paragraph text reads as the expected heading
 * (after normalizeHeadingText_).
 *
 * @param {string} text - raw paragraph text
 * @param {string} expected - the expected heading text
 * @returns {boolean}
 */
function isHeadingText_(text, expected) {
  return normalizeHeadingText_(text) === normalizeHeadingText_(expected);
}
/**
 * Returns true if the template already contains a paragraph matching the
 * given heading text. Used by the render* functions to avoid inserting a
 * duplicate title when the template author supplied their own.
 *
 * @param {Body} body - the copied document's body
 * @param {string} expected - the heading text to look for
 * @returns {boolean}
 */
function hasHeading_(body, expected) {
  var paragraphs = body.getParagraphs();
  for (var i = 0; i < paragraphs.length; i++) {
    if (isHeadingText_(paragraphs[i].getText(), expected)) {
      return true;
    }
  }
  return false;
}
/**
 * COMMENTED OUT — BoM removal: removeBomSection_ is disabled.
 * Removes the Bill of Materials section from the doc: the heading paragraph
 * ("Bill of Materials") plus the {{BoM}} placeholder paragraph. Used when a
 * project does not include a BoM so no empty section shows in the doc.
 *
 * @param {Body} body - the copied document's body
 */
// function removeBomSection_(body) {
//   var paragraphs = body.getParagraphs();
//   for (var i = 0; i < paragraphs.length; i++) {
//     if (isHeadingText_(paragraphs[i].getText(), "Bill of Materials")) {
//       paragraphs[i].removeFromParent();
//       break;
//     }
//   }
//   var search = body.findText("{{BoM}}");
//   if (search) {
//     var para = search.getElement();
//     while (para && para.getType() !== DocumentApp.ElementType.PARAGRAPH) {
//       para = para.getParent();
//     }
//     if (para) para.removeFromParent();
//   }
// }
/**
 * Renders the "Additional Customer Installation Address:" section. Only called when
 * the project has a second install address, so the title and address always
 * appear together. Mirrors the former renderBomTable_: an inline template
 * placeholder paragraph is promoted (Heading 4), a standalone heading is kept,
 * and a missing heading is inserted; then the address text is placed under it.
 *
 * @param {Body} body - the copied document's body
 * @param {string} address - the additional installation address text
 */
function renderAdditionalAddress_(body, address) {
  var search = body.findText("{{AdditionalInstallAddress}}");
  if (!search) return;
  var para = search.getElement();
  while (para && para.getType() !== DocumentApp.ElementType.PARAGRAPH) {
    para = para.getParent();
  }
  if (!para) return;
  var idx = body.getChildIndex(para);
  var leftover = para.getText().replace("{{AdditionalInstallAddress}}", "").trim();
  if (leftover) {
    var clone = para.copy();
    body.insertParagraph(idx, clone);
    var found = clone.findText("{{AdditionalInstallAddress}}");
    if (found) {
      clone.asText().deleteText(found.getStartOffset(), found.getEndOffsetInclusive());
    }
    clone.setHeading(DocumentApp.ParagraphHeading.HEADING4);
    idx = body.getChildIndex(para);
  } else if (!hasHeading_(body, "Additional Customer Installation Address:")) {
    body.insertParagraph(idx, "Additional Customer Installation Address:")
      .setHeading(DocumentApp.ParagraphHeading.HEADING4);
    idx = body.getChildIndex(para);
  }
  if (address) {
    var addressPara = body.insertParagraph(idx, address);
    var normal = normalTextFont_(body);
    if (normal.family) addressPara.setFontFamily(normal.family);
    if (normal.size) addressPara.setFontSize(normal.size);
    idx = body.getChildIndex(para);
  }
  para.removeFromParent();
}
/**
 * Removes the Additional Customer Installation Address section: the heading paragraph
 * plus the {{AdditionalInstallAddress}} placeholder paragraph. Used when the
 * project has no second install address so no empty section shows.
 *
 * @param {Body} body - the copied document's body
 */
function removeAdditionalAddress_(body) {
  var paragraphs = body.getParagraphs();
  for (var i = 0; i < paragraphs.length; i++) {
    if (isHeadingText_(paragraphs[i].getText(), "Additional Customer Installation Address:")) {
      paragraphs[i].removeFromParent();
      break;
    }
  }
  var search = body.findText("{{AdditionalInstallAddress}}");
  if (search) {
    var para = search.getElement();
    while (para && para.getType() !== DocumentApp.ElementType.PARAGRAPH) {
      para = para.getParent();
    }
    if (para) para.removeFromParent();
  }
}
/**
 * Renders the Work Breakdown section as a single-column table, one row per
 * non-empty wb entry, in display order (2.1..2.10). No title is inserted —
 * the template provides its own section heading. A blank spacer paragraph
 * adds vertical separation between that heading and the table. Cell text
 * uses the doc's content font. The section is required, so it renders
 * whenever at least one wb entry exists.
 *
 * @param {Body} body - the copied document's body
 * @param {Array<string>} rows - non-empty wb values in display order
 */
function renderWorkBreakdownTable_(body, rows) {
  var search = body.findText("{{WorkBreakdown}}");
  if (!search) return;
  var para = search.getElement();
  while (para && para.getType() !== DocumentApp.ElementType.PARAGRAPH) {
    para = para.getParent();
  }
  if (!para) return;
  var idx = body.getChildIndex(para);
  body.insertParagraph(idx, "");
  idx = body.getChildIndex(para);
  var cells = [];
  for (var i = 0; i < rows.length; i++) {
    cells.push([rows[i]]);
  }
  var table = body.insertTable(idx, cells);
  table.setBorderWidth(0);
  table.setColumnWidth(0, 460);
  var normal = normalTextFont_(body);
  for (var r = 0; r < table.getNumRows(); r++) {
    var row = table.getRow(r);
    for (var c = 0; c < row.getNumCells(); c++) {
      var cellText = row.getCell(c).editAsText();
      if (normal.family) cellText.setFontFamily(normal.family);
      if (normal.size) cellText.setFontSize(normal.size);
    }
  }
  para.removeFromParent();
}
/**
 * Drops the {{WorkBreakdown}} placeholder paragraph when the project has no
 * wb entries, so no stray marker is left in the doc.
 *
 * @param {Body} body - the copied document's body
 */
function removeWorkBreakdown_(body) {
  var search = body.findText("{{WorkBreakdown}}");
  if (search) {
    var para = search.getElement();
    while (para && para.getType() !== DocumentApp.ElementType.PARAGRAPH) {
      para = para.getParent();
    }
    if (para) para.removeFromParent();
  }
}
/**
 * Renders the Cost Breakdown verbiage at the {{CostBreakdown}} marker.
 * When the project has no breakdown items the marker becomes the single
 * "No" sentence; when items exist it becomes the "Yes" wording: an intro
 * sentence, the numbered item lines ("1. Item - 50% ($25,000.00) -
 * Explanation"), and a closing sentence, separated by blank paragraphs.
 * The verbiage is code-owned (the amount is formatted inline), so the
 * template only needs to place the marker where the block should go. An
 * inline template heading on the placeholder paragraph is promoted to a
 * Heading 4 (mirrors renderAdditionalAddress_); {{Breakdown}} is matched
 * as a fallback for older templates.
 *
 * @param {Body} body - the copied document's body
 * @param {Array<{name: string, pct: string, amount: string, explanation: string}>} items
 * @param {number} quoteAmount - raw quote amount; formatted inline as $X
 */
function renderCostBreakdown_(body, items, quoteAmount) {
  var search = body.findText("{{CostBreakdown}}");
  if (!search) search = body.findText("{{Breakdown}}");
  if (!search) return;
  var para = search.getElement();
  while (para && para.getType() !== DocumentApp.ElementType.PARAGRAPH) {
    para = para.getParent();
  }
  if (!para) return;
  var idx = body.getChildIndex(para);
  var leftover = para.getText().replace(/{{CostBreakdown}}|{{Breakdown}}/g, "").trim();
  if (leftover) {
    var clone = para.copy();
    body.insertParagraph(idx, clone);
    var found = clone.findText("{{CostBreakdown}}");
    if (!found) found = clone.findText("{{Breakdown}}");
    if (found) {
      clone.asText().deleteText(found.getStartOffset(), found.getEndOffsetInclusive());
    }
    clone.setHeading(DocumentApp.ParagraphHeading.HEADING4);
    idx = body.getChildIndex(para);
  }
  var normal = normalTextFont_(body);
  var money = formatMoney(quoteAmount);
  function insertParagraph_(text) {
    var p = body.insertParagraph(idx, text);
    if (normal.family) p.setFontFamily(normal.family);
    if (normal.size) p.setFontSize(normal.size);
    idx = body.getChildIndex(para);
    return p;
  }
  if (items.length) {
    insertParagraph_(
      "Professional Services for this engagement are $" + money +
      " and will be invoiced according to the following schedule:"
    );
    insertParagraph_("");
    for (var i = 0; i < items.length; i++) {
      var parts = [];
      if (items[i].name) parts.push(items[i].name);
      if (items[i].pct) parts.push(items[i].pct + "% ($" + items[i].amount + ")");
      if (items[i].explanation) parts.push(items[i].explanation);
      // Indent via leading spaces (matches the "    {{CostBreakdown}}" slot in
      // the template spec). Paragraph indent attributes don't reliably render
      // in this template, and leading spaces always display in Google Docs.
      insertParagraph_("    " + (i + 1) + ".\t" + parts.join(" - "));
    }
    insertParagraph_("");
    insertParagraph_("Travel and expenses are included in the Professional Services fee.");
  } else {
    insertParagraph_(
      "Professional Services for this engagement are $" + money +
      ".  Travel and expenses are included in the Professional Services fee."
    );
  }
  para.removeFromParent();
}
/**
 * Returns true if the sheet already has a row whose Project Title (col B)
 * matches the given title (case-insensitive, whitespace-trimmed).
 * Uses the same normalization pattern as updateRow / getRawRowData.
 *
 * @param {Sheet} sheet - the "Form Responses 2" sheet
 * @param {string} projectTitle - the title to check for
 * @param {number} [excludeRow] - optional 1-based sheet row to skip.
 *   Pass the row being edited so updateRow doesn't false-positive against itself.
 *   Omit (or pass falsy) when checking for creates.
 */
function projectTitleExists_(sheet, projectTitle, excludeRow) {
  const target = (projectTitle || "").toString().trim().toLowerCase();
  if (!target) return false;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowNumber = i + 1; // sheet rows are 1-indexed
    if (excludeRow && rowNumber === excludeRow) continue;
    const cellValue = (data[i][1] || "").toString().trim().toLowerCase();
    if (cellValue === target) return true;
  }
  return false;
}
/**
 * Server-side guard for the five quote-breakdown percents.
 * Matches the client's rules in _percentLogic.html:
 *   - Individual values must be numeric and >= 0.
 *   - Sum > 100 is a hard block (throws).
 *   - Sum < 100 is allowed (soft-warn on the client; server does not care).
 *   - Blank / null / undefined values are treated as 0.
 * Uses a tiny epsilon so 100.0000001-type float noise doesn't reject valid input.
 *
 * Throws an Error with a user-friendly message on failure so the client's
 * .withFailureHandler(...) surfaces it the same way the duplicate-title check does.
 */
function validatePercents_(formData) {
  var fields = [
    { key: "bq1Pct", label: "Breakdown 1 %" },
    { key: "bq2Pct", label: "Breakdown 2 %" },
    { key: "bq3Pct", label: "Breakdown 3 %" },
    { key: "bq4Pct", label: "Breakdown 4 %" },
    { key: "bq5Pct", label: "Breakdown 5 %" }
  ];
  var nums = [];
  for (var i = 0; i < fields.length; i++) {
    var raw = formData[fields[i].key];
    // Blank / null / undefined => 0 (matches the client)
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      nums.push(0);
      continue;
    }
    // Trim surrounding whitespace, then strip a single trailing % if present
    // (so "50%" and " 50 " still work). Anything else must parse as a number.
    var trimmed = String(raw).trim().replace(/%$/, "").trim();
    // Reject anything that isn't a valid numeric string.
    // Number("") is 0 and Number("abc") is NaN, but Number(" ") is also 0,
    // so we already guarded blanks above. This regex only allows an optional
    // minus, digits, and one optional decimal portion.
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new Error(
        fields[i].label + " must be a number. Received: \"" + raw + "\"."
      );
    }
    var n = Number(trimmed);
    if (isNaN(n)) {
      throw new Error(
        fields[i].label + " must be a number. Received: \"" + raw + "\"."
      );
    }
    if (n < 0) {
      throw new Error(
        fields[i].label + " cannot be negative. Received: " + n + "."
      );
    }
    nums.push(n);
  }
  var total = nums[0] + nums[1] + nums[2] + nums[3] + nums[4];
  // Epsilon guard against float wobble (e.g. 33.33 + 33.33 + 33.34 = 100.00000000000001)
  if (total > 100.001) {
    throw new Error(
      "The five Quote Breakdown percents add up to " + total.toFixed(2) +
      "%, which is more than 100%. Please adjust the values so they total 100% or less."
    );
  }
}
/**
 * Returns the deployed web app's base URL (no query string).
 * Used by NewDataPage after submit to redirect back to the chooser.
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}
function testDocGen() {
  generateDocForRow(2); // or whichever row has real data
}