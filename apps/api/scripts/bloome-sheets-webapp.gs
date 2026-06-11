/**
 * Bloome sheet → AstraSolar CRM bridge (Google Apps Script web app).
 *
 * Returns a tab of the "ASTRA - MASTER BLASTER" spreadsheet as JSON so the
 * CRM API (BloomeSyncService) can poll it. Deploy this from an account that
 * has at least view access to the sheet (it runs as the deploying account).
 *
 * Setup:
 *   1. Go to https://script.google.com → New project, paste this file.
 *   2. Set TOKEN below to a long random string.
 *   3. Deploy → New deployment → type "Web app":
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      (The token — not Google login — gates access, because the CRM server
 *      polls it headlessly.)
 *   4. Copy the /exec URL into the API's .env:
 *        BLOOME_SYNC_URL="https://script.google.com/macros/s/…/exec"
 *        BLOOME_SYNC_TOKEN="<the same random string>"
 *
 * Optional (instant-ish sync): in the spreadsheet, add an installable
 * "On change" trigger that calls `ping` — with polling enabled this is
 * usually unnecessary.
 */

var SPREADSHEET_ID = '1gtjBJ4JLftqNzZmFsEHwJ_5Ll8Ku7_stDfFx7G1xpSg';
var TOKEN = 'CHANGE-ME-to-a-long-random-string';
var ALLOWED_TABS = ['ACT:Live', 'TAS:Live'];

function doGet(e) {
  var out = ContentService.createTextOutput().setMimeType(
    ContentService.MimeType.JSON,
  );
  try {
    var params = (e && e.parameter) || {};
    if (!TOKEN || params.token !== TOKEN) {
      out.setContent(JSON.stringify({ ok: false, error: 'invalid token' }));
      return out;
    }
    var tab = params.tab || 'ACT:Live';
    if (ALLOWED_TABS.indexOf(tab) === -1) {
      out.setContent(JSON.stringify({ ok: false, error: 'tab not allowed' }));
      return out;
    }
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(tab);
    if (!sheet) {
      out.setContent(JSON.stringify({ ok: false, error: 'tab not found' }));
      return out;
    }
    var lastRow = sheet.getLastRow();
    var lastCol = Math.min(sheet.getLastColumn(), 21); // columns A..U
    var rows =
      lastRow > 0 ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [];
    out.setContent(
      JSON.stringify({ ok: true, tab: tab, rowCount: rows.length, rows: rows }),
    );
  } catch (err) {
    out.setContent(JSON.stringify({ ok: false, error: String(err) }));
  }
  return out;
}
