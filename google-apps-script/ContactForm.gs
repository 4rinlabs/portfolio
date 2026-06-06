/**
 * 4RinLabs contact form → Google Sheets
 *
 * POST JSON body keys (exact):
 *   name, email, contact, message, timestamp
 *
 * Columns A–E (fixed positions):
 *   A: Name | B: Email | C: Contact Number | D: Message | E: Timestamp
 */

const SHEET_NAME = 'Submissions'
const COL = { NAME: 1, EMAIL: 2, CONTACT: 3, MESSAGE: 4, TIMESTAMP: 5 }
const HEADERS = ['Name', 'Email', 'Contact Number', 'Message', 'Timestamp']

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME)
  }
  fixSheetLayout_(sheet)
  return sheet
}

/** Ensures row 1 headers and column C exists for Contact Number */
function fixSheetLayout_(sheet) {
  const row1 = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 5)).getValues()[0]

  // Legacy layout: Name | Email | Message | Timestamp (no contact column)
  if (row1[2] === 'Message' && (row1[3] === 'Timestamp' || String(row1[3] || '').indexOf('Timestamp') !== -1)) {
    sheet.insertColumnBefore(COL.CONTACT)
  }

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold')
  sheet.setFrozenRows(1)
}

function setupSheet() {
  const sheet = getSheet_()
  SpreadsheetApp.getUi().alert(
    'Sheet "' +
      SHEET_NAME +
      '" ready.\n\nColumns:\nA: Name\nB: Email\nC: Contact Number\nD: Message\nE: Timestamp',
  )
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ ok: false, error: 'Missing request body.' })
    }

    const body = JSON.parse(e.postData.contents)
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim()
    const contact = String(body.contact || '').trim()
    const message = String(body.message || '').trim()
    const timestamp = body.timestamp ? String(body.timestamp) : new Date().toISOString()

    if (!name || name.length < 2) {
      return jsonResponse_({ ok: false, error: 'Invalid name.' })
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse_({ ok: false, error: 'Invalid email.' })
    }
    if (!contact || !/^[+]?[\d\s().-]{7,20}$/.test(contact)) {
      return jsonResponse_({ ok: false, error: 'Invalid contact. Send body.contact with the phone number.' })
    }
    if (!message || message.length < 10) {
      return jsonResponse_({ ok: false, error: 'Invalid message.' })
    }

    const sheet = getSheet_()
    const row = sheet.getLastRow() + 1

    // Write each field to a fixed column — prevents shifted data
    sheet.getRange(row, COL.NAME).setValue(name)
    sheet.getRange(row, COL.EMAIL).setValue(email)
    sheet.getRange(row, COL.CONTACT).setValue(contact)
    sheet.getRange(row, COL.MESSAGE).setValue(message)
    sheet.getRange(row, COL.TIMESTAMP).setValue(timestamp)

    return jsonResponse_({ ok: true })
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) })
  }
}

function doGet() {
  return jsonResponse_({ ok: true, message: '4RinLabs contact endpoint. Use POST.' })
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
